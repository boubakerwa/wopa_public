from pathlib import Path
import re
import json

ROOT = Path('.')
SITE = 'https://mywopa.com'

CATEGORIES = {
    'blog': ('Blog', f'{SITE}/blog/'),
    'tools': ('Tools', f'{SITE}/tools/'),
    'vs': ('Comparisons', f'{SITE}/vs/'),
}

EXCLUDED = {
    Path('old_index.html'),
    Path('wopa-landing.html'),
    Path('wopa-landing-2.html'),
    Path('wopa-landing-rebrand.html'),
    Path('WOPA Brand Book (1) (1).html'),
    Path('gmail-footer-wopa.html'),
}


def title_from_file(path: Path) -> str:
    text = path.read_text(encoding='utf-8', errors='ignore')
    match = re.search(r'<h1\b[^>]*>(.*?)</h1>', text, re.I | re.S)
    if match:
        value = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        if value:
            return value
    stem = path.stem.replace('-', ' ').replace('_', ' ')
    return stem.title()


def page_url(path: Path) -> str:
    rel = path.as_posix()
    if rel == 'index.html':
        return f'{SITE}/'
    if rel.endswith('/index.html'):
        return f'{SITE}/{rel.removesuffix("index.html")}'
    return f'{SITE}/{rel}'


def breadcrumb_schema(path: Path) -> str | None:
    parts = path.parts
    if len(parts) < 2 or parts[0] not in CATEGORIES:
        return None
    cat_name, cat_url = CATEGORIES[parts[0]]
    item_list = [
        {'@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': f'{SITE}/'},
        {'@type': 'ListItem', 'position': 2, 'name': cat_name, 'item': cat_url},
    ]
    if path.name != 'index.html':
        item_list.append({'@type': 'ListItem', 'position': 3, 'name': title_from_file(path), 'item': page_url(path)})
    return json.dumps({'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': item_list}, indent=2)


def add_schema(content: str, schema: str) -> str:
    if '"@type": "BreadcrumbList"' in content or '"@type":"BreadcrumbList"' in content:
        return content
    block = f'\n<script type="application/ld+json">\n{schema}\n</script>\n'
    return content.replace('</head>', block + '</head>', 1)


def fix_duplicate_h1(content: str) -> str:
    seen = 0
    def repl(match):
        nonlocal seen
        seen += 1
        if seen == 1:
            return match.group(0)
        return match.group(0).replace('<h1', '<div', 1).replace('</h1>', '</div>')
    return re.sub(r'<h1\b[^>]*>.*?</h1>', repl, content, flags=re.I | re.S)


INVOICE_SEO = '''
<section class="section seo-copy">
  <div class="container">
    <div class="eyebrow" style="margin-bottom:18px;">Invoice guidance</div>
    <h2>Free UK invoice generator for tradespeople and sole traders</h2>
    <p>This invoice generator is designed for UK tradespeople who need a simple invoice quickly: electricians, plumbers, builders, roofers, gas engineers, landscapers, carpenters, handymen, and other sole traders. Add your business details, customer details, line items, VAT settings, CIS deductions where relevant, bank details, payment terms, and then download a clean invoice PDF.</p>
    <p>Use it when you need a one-off invoice. Use WOPA when you want the whole workflow from WhatsApp: create the invoice, email the customer, track whether it has been paid, and send polite payment reminders without opening accounting software.</p>
    <div class="related-links" style="margin-top:20px;">
      <a href="/tools/quote-to-invoice.html">Convert a quote to an invoice</a>
      <a href="/tools/cis-calculator.html">Calculate CIS deductions</a>
      <a href="/tools/late-payment-calculator.html">Calculate late payment interest</a>
      <a href="/blog/how-to-invoice-sole-trader-uk.html">Sole trader invoicing guide</a>
      <a href="/blog/send-invoice-whatsapp.html">Send invoices via WhatsApp</a>
      <a href="/vs/quickbooks.html">WOPA vs QuickBooks</a>
    </div>
  </div>
</section>
'''

QUOTE_SEO = '''
<section class="section seo-copy">
  <div class="container">
    <div class="eyebrow" style="margin-bottom:18px;">Quote to invoice guide</div>
    <h2>Turn an accepted quote into a proper invoice</h2>
    <p>Once a customer accepts a quote, the invoice should keep the important details consistent: your business details, customer details, agreed work, payment terms, VAT treatment, CIS deductions where relevant, and bank details. This free converter helps UK tradespeople create a clean invoice from quoted work without starting from scratch.</p>
    <p>For one-off jobs, this tool is enough. For repeat work, WOPA is built to make the process faster from WhatsApp: send a message, confirm the draft, email the invoice, and let WOPA handle payment follow-ups.</p>
    <div class="related-links" style="margin-top:20px;">
      <a href="/tools/invoice-generator.html">Free invoice generator</a>
      <a href="/blog/quote-vs-invoice-difference.html">Quote vs invoice explained</a>
      <a href="/blog/payment-terms-tradespeople-guide.html">Payment terms guide</a>
      <a href="/tools/late-payment-calculator.html">Late payment calculator</a>
      <a href="/plumbers.html">WOPA for plumbers</a>
      <a href="/builders.html">WOPA for builders</a>
    </div>
  </div>
</section>
'''


def add_tool_copy(path: Path, content: str) -> str:
    if 'class="section seo-copy"' in content:
        return content
    block = INVOICE_SEO if path.as_posix() == 'tools/invoice-generator.html' else QUOTE_SEO if path.as_posix() == 'tools/quote-to-invoice.html' else None
    if not block:
        return content
    return content.replace('<!-- CTA -->', block + '\n<!-- CTA -->', 1)


changed = []
for path in ROOT.rglob('*.html'):
    if path in EXCLUDED or any(part.startswith('.') for part in path.parts):
        continue
    content = path.read_text(encoding='utf-8', errors='ignore')
    original = content
    schema = breadcrumb_schema(path)
    if schema:
        content = add_schema(content, schema)
    if path.as_posix() in {'tools/invoice-generator.html', 'tools/quote-to-invoice.html'}:
        content = fix_duplicate_h1(content)
        content = add_tool_copy(path, content)
    if content != original:
        path.write_text(content, encoding='utf-8')
        changed.append(path.as_posix())

print('\n'.join(changed))
