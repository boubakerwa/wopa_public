from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path('.')

# Only validate public, indexable HTML pages.
# Draft/design/helper HTML files are intentionally excluded.
EXCLUDED_HTML_FILES = {
    Path('wopa-landing.html'),
    Path('wopa-landing-2.html'),
    Path('WOPA Brand Book (1) (1).html'),
    Path('gmail-footer-wopa.html'),
}

html_files = [
    path for path in ROOT.rglob('*.html')
    if not any(part.startswith('.') for part in path.parts)
    and path not in EXCLUDED_HTML_FILES
]

if not html_files:
    print('No indexable HTML files found.')
    sys.exit(1)

errors = []
warnings = []

for file_path in html_files:
    content = file_path.read_text(encoding='utf-8', errors='ignore')

    if not re.search(r'<title>.+?</title>', content, re.IGNORECASE | re.DOTALL):
        errors.append(f'{file_path}: missing <title>')

    if not re.search(r'<meta\s+name=["\']description["\']', content, re.IGNORECASE):
        errors.append(f'{file_path}: missing meta description')

    if not re.search(r'<link\s+rel=["\']canonical["\']', content, re.IGNORECASE):
        errors.append(f'{file_path}: missing canonical link')

    h1_matches = re.findall(r'<h1\b[^>]*>', content, re.IGNORECASE)
    if len(h1_matches) == 0:
        errors.append(f'{file_path}: missing <h1>')
    elif len(h1_matches) > 1:
        warnings.append(f'{file_path}: expected 1 <h1>, found {len(h1_matches)}')

sitemap_path = ROOT / 'sitemap.xml'

if not sitemap_path.exists():
    errors.append('Missing sitemap.xml')
else:
    try:
        sitemap_tree = ET.parse(sitemap_path)
        sitemap_root = sitemap_tree.getroot()
        namespace = {'sm': 'http://www.sitemaps.org/schemas/sitemap/0.9'}
        sitemap_urls = [loc.text.strip() for loc in sitemap_root.findall('.//sm:loc', namespace) if loc.text]
        if not sitemap_urls:
            errors.append('sitemap.xml contains no URLs')
    except ET.ParseError as e:
        errors.append(f'sitemap.xml invalid XML: {e}')

robots_path = ROOT / 'robots.txt'

if not robots_path.exists():
    errors.append('Missing robots.txt')
else:
    robots = robots_path.read_text(encoding='utf-8', errors='ignore')
    if 'Sitemap: https://mywopa.com/sitemap.xml' not in robots:
        errors.append('robots.txt missing sitemap directive')

if warnings:
    print('\nSEO CHECK WARNINGS\n')
    for warning in warnings:
        print(f'- {warning}')

if errors:
    print('\nSEO CHECK FAILED\n')
    for error in errors:
        print(f'- {error}')
    sys.exit(1)

print('SEO checks passed.')
