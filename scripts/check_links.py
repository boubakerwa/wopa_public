from pathlib import Path
import re
import sys

ROOT = Path('.')

html_files = [p for p in ROOT.rglob('*.html') if '.git' not in p.parts]

errors = []

href_pattern = re.compile(r'href=["\']([^"\']+)["\']', re.IGNORECASE)

for html_file in html_files:
    content = html_file.read_text(encoding='utf-8', errors='ignore')

    for href in href_pattern.findall(content):
        if href.startswith(('http://', 'https://', 'mailto:', 'tel:', '#')):
            continue

        clean_href = href.split('#')[0].split('?')[0]

        if not clean_href:
            continue

        target = (html_file.parent / clean_href).resolve()

        if not target.exists():
            errors.append(f'{html_file}: broken internal link -> {href}')

if errors:
    print('\nBROKEN LINK CHECK FAILED\n')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('Internal link checks passed.')
