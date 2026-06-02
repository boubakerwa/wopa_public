from pathlib import Path
import re
import sys
from urllib.parse import urlparse

ROOT = Path('.').resolve()
SITE_ORIGIN = 'https://mywopa.com'

# Keep this aligned with scripts/seo_check.py.
EXCLUDED_HTML_FILES = {
    Path('wopa-landing.html'),
    Path('wopa-landing-2.html'),
    Path('wopa-landing-rebrand.html'),
    Path('WOPA Brand Book (1) (1).html'),
    Path('gmail-footer-wopa.html'),
    Path('old_index.html'),
}

html_files = [
    p for p in Path('.').rglob('*.html')
    if '.git' not in p.parts
    and 'node_modules' not in p.parts
    and p not in EXCLUDED_HTML_FILES
]

errors = []

href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)


def is_redirect_style_route(path: str) -> bool:
    return path.endswith('.html') or path.endswith('/index.html')


def is_internal_absolute_url(href: str) -> bool:
    parsed = urlparse(href)
    return f'{parsed.scheme}://{parsed.netloc}' == SITE_ORIGIN


def resolve_internal_path(current_file: Path, href: str) -> Path:
    clean_href = href.split('#')[0].split('?')[0]
    if is_internal_absolute_url(clean_href):
        clean_href = urlparse(clean_href).path

    if clean_href.startswith('/'):
        clean_href = clean_href.lstrip('/')
        if clean_href == '':
            return ROOT / 'index.html'
        if clean_href.endswith('/'):
            return ROOT / clean_href / 'index.html'
        target = ROOT / clean_href
        html_target = ROOT / f'{clean_href}.html'
        return html_target if html_target.exists() else target

    if clean_href.endswith('/'):
        return (current_file.parent / clean_href / 'index.html').resolve()

    target = (current_file.parent / clean_href).resolve()
    html_target = Path(f'{target}.html')
    return html_target if html_target.exists() else target


for html_file in html_files:
    content = html_file.read_text(encoding='utf-8', errors='ignore')

    for href in href_pattern.findall(content):
        if href.startswith(('mailto:', 'tel:', '#', 'javascript:')):
            continue

        if href.startswith(('http://', 'https://')) and not is_internal_absolute_url(href):
            continue

        clean_href = href.split('#')[0].split('?')[0]

        if not clean_href:
            continue

        parsed_href = urlparse(clean_href)
        clean_path = parsed_href.path if parsed_href.scheme else clean_href
        if is_redirect_style_route(clean_path):
            errors.append(f'{html_file}: internal link should use final clean route -> {href}')

        target = resolve_internal_path(html_file, href)

        if not target.exists():
            errors.append(f'{html_file}: broken internal link -> {href}')

if errors:
    print('\nBROKEN LINK CHECK FAILED\n')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('Internal link checks passed.')
