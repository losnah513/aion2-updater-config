from pathlib import Path

root = Path(__file__).resolve().parents[1]
for rel in ('admin/index.html', 'm/admin/index.html'):
    path = root / rel
    text = path.read_text(encoding='utf-8')
    text = text.replace('admin.css?cache=2026081502', 'admin.css?cache=2026082202')
    text = text.replace('admin.js?cache=2026082201', 'admin.js?cache=2026082202')
    if 'admin.css?cache=2026082202' not in text:
        raise SystemExit(f'{rel}: admin CSS cache alignment failed')
    if 'admin.js?cache=2026082202' not in text:
        raise SystemExit(f'{rel}: admin JS cache alignment failed')
    path.write_text(text, encoding='utf-8')
print('admin cache alignment applied')
