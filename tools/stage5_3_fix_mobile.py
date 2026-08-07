from pathlib import Path

path = Path('tools/stage5_3_patch.py')
text = path.read_text(encoding='utf-8')
old = '''for page in ["admin/index.html", "m/admin/index.html"]:\n    insert_before(page, '        <section class="admin-card admin-meter-release-card">\\n', stats_card)\n    rep(page, '../core/kinojo-supabase-features.js?cache=2026080205', '../core/kinojo-supabase-features.js?cache=2026080701')\n    rep(page, './js/admin.js?cache=2026080601', './js/admin.js?cache=2026080701')\n'''
new = '''for page in ["admin/index.html", "m/admin/index.html"]:\n    insert_before(page, '        <section class="admin-card admin-meter-release-card">\\n', stats_card)\nrep('admin/index.html', '../core/kinojo-supabase-features.js?cache=2026080205', '../core/kinojo-supabase-features.js?cache=2026080701')\nrep('admin/index.html', './js/admin.js?cache=2026080601', './js/admin.js?cache=2026080701')\nrep('m/admin/index.html', '../../core/kinojo-supabase-features.js?cache=2026080205', '../../core/kinojo-supabase-features.js?cache=2026080701')\nrep('m/admin/index.html', '../../admin/js/admin.js?cache=2026080601', '../../admin/js/admin.js?cache=2026080701')\n'''
if text.count(old) != 1:
    raise SystemExit('mobile admin path patch marker mismatch')
path.write_text(text.replace(old, new), encoding='utf-8')
