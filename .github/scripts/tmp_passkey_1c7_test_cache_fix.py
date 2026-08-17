from pathlib import Path

replacements = {
    'tests/meter-presence-log-contract.test.js': [
        ('meter-app.js?cache=2026081502-50040', 'meter-app.js?cache=2026081801'),
        ('kinojo-supabase-features.js?cache=2026081706', 'kinojo-supabase-features.js?cache=2026081801'),
    ],
    'tests/sanctuary-waitlist-contract.test.js': [
        ('sanctuary.js?cache=2026081222', 'sanctuary.js?cache=2026081801'),
        ('kinojo-supabase-features.js?cache=2026081706', 'kinojo-supabase-features.js?cache=2026081801'),
    ],
}

for test_name, pairs in replacements.items():
    path = Path(test_name)
    text = path.read_text(encoding='utf-8')
    for old, new in pairs:
        if old not in text:
            raise SystemExit(f'{test_name}: cache expectation missing {old}')
        text = text.replace(old, new)
    path.write_text(text, encoding='utf-8', newline='')
