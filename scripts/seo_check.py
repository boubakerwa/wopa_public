from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path('.')

html_files = list(ROOT.rglob('*.html'))

if not html_files:
    print('No HTML files found.')
    sys.exit(1)

errors = []

for file_path in html_files:
    content = file_path.read_text(encoding='utf-8', errors='ignore')

    if not re.search(r'<title>.+?</title>', content, re.IGNORECASE | re.DOTALL):
        errors.append(f'{file_path}: missing <title>')

    if not re.search(r'<meta\s+name="description"', content, re.IGNORECASE):
        errors.append(f'{file_path}: missing meta description')

    if not re.search(r'<link\s+rel="canonical"', content, re.IGNORECASE):
        errors.append(f'{file_path}: missing canonical link')

    h1_matches = re.findall(r'<h1[^>]*>', content, re.IGNORECASE)
    if len(h1_matches) != 1:
        errors.append(f'{file_path}: expected exactly 1 <h1>, found {len(h1_matches)}')

sitemap_path = ROOT / 'sitemap.xml'

if not sitemap_path.exists():
    errors.append('Missing sitemap.xml')
else:
    try:
        ET.parse(sitemap_path)
    except ET.ParseError as e:
        errors.append(f'sitemap.xml invalid XML: {e}')

robots_path = ROOT / 'robots.txt'

if not robots_path.exists():
    errors.append('Missing robots.txt')

if errors:
    print('\nSEO CHECK FAILED\n')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('SEO checks passed.')
