from pathlib import Path
import re
import xml.etree.ElementTree as ET
from typing import Optional

ROOT = Path('.')
SITE_ORIGIN = 'https://mywopa.com'

EXCLUDED_HTML_FILES = {
    Path('wopa-landing.html'),
    Path('wopa-landing-2.html'),
    Path('wopa-landing-rebrand.html'),
    Path('WOPA Brand Book (1) (1).html'),
    Path('gmail-footer-wopa.html'),
    Path('old_index.html'),
}

LOCALE_HREFLANG = {
    '': 'en-GB',
    'fr-fr': 'fr-FR',
    'de-de': 'de-DE',
    'it-it': 'it-IT',
    'es-es': 'es-ES',
    'en-us': 'en-US',
    'nl-nl': 'nl-NL',
    'ar-sa': 'ar-SA',
    'ar-ae': 'ar-AE',
}


def html_files() -> list[Path]:
    return [
        path for path in ROOT.rglob('*.html')
        if not any(part.startswith('.') for part in path.parts)
        and 'node_modules' not in path.parts
        and path not in EXCLUDED_HTML_FILES
    ]


def path_to_url(path: Path) -> str:
    route = path.as_posix()
    if route == 'index.html':
        return f'{SITE_ORIGIN}/'
    if route.endswith('/index.html'):
        return f'{SITE_ORIGIN}/{route[:-len("index.html")]}'
    return f'{SITE_ORIGIN}/{route[:-len(".html")]}'


def clean_url(url: str) -> str:
    if not url.startswith(SITE_ORIGIN):
        return url
    if url == f'{SITE_ORIGIN}/index.html':
        return f'{SITE_ORIGIN}/'
    if url.endswith('/index.html'):
        return url[:-len('index.html')]
    if url.endswith('.html'):
        return url[:-len('.html')]
    return url


def clean_internal_route(url: str) -> str:
    if url == '/index.html':
        return '/'
    if url == 'index.html':
        return './'
    if url.endswith('/index.html'):
        return url[:-len('index.html')]
    if url.endswith('.html'):
        return url[:-len('.html')]
    return url


def clean_href_value(match: re.Match) -> str:
    quote, href = match.groups()
    if href.startswith(('http://', 'https://', 'mailto:', 'tel:', '#', 'javascript:')):
        return match.group(0)

    route = href
    suffix = ''
    for separator in ('#', '?'):
        if separator in route:
            route, suffix = route.split(separator, 1)
            suffix = f'{separator}{suffix}'
            break

    cleaned = clean_internal_route(route)
    return f'href={quote}{cleaned}{suffix}{quote}'


def cluster_key(path: Path) -> Optional[tuple[str, str]]:
    parts = path.parts
    locale = ''
    if parts and parts[0] in LOCALE_HREFLANG and parts[0]:
        locale = parts[0]
        route = '/'.join(parts[1:])
    else:
        route = path.as_posix()

    if route == 'index.html':
        return ('landing', '')
    if route.startswith('blog/'):
        return ('blog', route)
    return None


def page_locale(path: Path) -> str:
    first = path.parts[0] if path.parts else ''
    return first if first in LOCALE_HREFLANG and first else ''


def alternate_links(path: Path, clusters: dict[tuple[str, str], list[Path]]) -> str:
    key = cluster_key(path)
    if key is None:
        return ''

    pages = sorted(clusters[key], key=lambda item: list(LOCALE_HREFLANG).index(page_locale(item)))
    links = []
    for page in pages:
        hreflang = LOCALE_HREFLANG[page_locale(page)]
        links.append(f'<link rel="alternate" hreflang="{hreflang}" href="{path_to_url(page)}"/>')

    default = next((page for page in pages if page_locale(page) == ''), pages[0])
    links.append(f'<link rel="alternate" hreflang="x-default" href="{path_to_url(default)}"/>')
    return '\n'.join(links)


def normalize_html(path: Path, clusters: dict[tuple[str, str], list[Path]]) -> bool:
    content = path.read_text(encoding='utf-8', errors='ignore')
    original = content

    content = re.sub(r'https://mywopa\.com/[^\s"\'<>]+?\.html\b', lambda m: clean_url(m.group(0)), content)
    content = re.sub(r'href=(["\'])([^"\']+)["\']', clean_href_value, content)

    canonical = f'<link rel="canonical" href="{path_to_url(path)}"/>'
    if re.search(r'<link\b[^>]*rel=["\']canonical["\'][^>]*>', content, flags=re.I):
        content = re.sub(r'<link\b[^>]*rel=["\']canonical["\'][^>]*>', canonical, content, count=1, flags=re.I)

    alternates = alternate_links(path, clusters)
    if alternates:
        content = re.sub(r'\n?<link\b(?=[^>]*rel=["\']alternate["\'])(?=[^>]*hreflang=)[^>]*>', '', content, flags=re.I)
        content = re.sub(r'\n?<link\b(?=[^>]*hreflang=)(?=[^>]*rel=["\']alternate["\'])[^>]*>', '', content, flags=re.I)
        content = content.replace(canonical, f'{canonical}\n{alternates}', 1)

    if content != original:
        path.write_text(content, encoding='utf-8')
        return True
    return False


def normalize_sitemap() -> bool:
    path = ROOT / 'sitemap.xml'
    tree = ET.parse(path)
    root = tree.getroot()
    namespace = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
    changed = False
    for loc in root.findall('.//sm:loc', namespace):
        if loc.text:
            cleaned = clean_url(loc.text.strip())
            if cleaned != loc.text:
                loc.text = cleaned
                changed = True
    if changed:
        ET.register_namespace('', 'http://www.sitemaps.org/schemas/sitemap/0.9')
        tree.write(path, encoding='UTF-8', xml_declaration=True)
    return changed


files = html_files()
clusters: dict[tuple[str, str], list[Path]] = {}
for html_file in files:
    key = cluster_key(html_file)
    if key is not None:
        clusters.setdefault(key, []).append(html_file)

changed = [path.as_posix() for path in files if normalize_html(path, clusters)]
if normalize_sitemap():
    changed.append('sitemap.xml')

print('\n'.join(changed))
