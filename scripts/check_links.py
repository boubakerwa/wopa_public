from pathlib import Path
import re
import sys

ROOT = Path('.').resolve()

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
    if '.git' not in p.parts and p not in EXCLUDED_HTML_FILES
]

errors = []

href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)


def resolve_internal_path(current_file: Path, href: str) -> Path:
    clean_href = href.split('#')[0].split('?')[0]

    if clean_href.startswith('/'):
        clean_href = clean_href.lstrip('/')
        if clean_href == '':
            return ROOT / 'index.html'
        if clean_href.endswith('/'):
            return ROOT / clean_href / 'index.html'
        return ROOT / clean_href

    if clean_href.endswith('/'):
        return (current_file.parent / clean_href / 'index.html').resolve()

    return (current_file.parent / clean_href).resolve()


for html_file in html_files:
    content = html_file.read_text(encoding='utf-8', errors='ignore')

    for href in href_pattern.findall(content):
        if href.startswith(('http://', 'https://', 'mailto:', 'tel:', '#', 'javascript:')):
            continue

        clean_href = href.split('#')[0].split('?')[0]

        if not clean_href:
            continue

        target = resolve_internal_path(html_file, href)

        if not target.exists():
            errors.append(f'{html_file}: broken internal link -> {href}')

if errors:
    print('\nBROKEN LINK CHECK FAILED\n')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('Internal link checks passed.')
