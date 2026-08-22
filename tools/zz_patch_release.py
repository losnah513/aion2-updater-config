from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]

common=root/'ui/kinojo-common-ui.js'
text=common.read_text(encoding='utf-8')
text=text.replace('/* KINOJO common UI v20260822.02 */','/* KINOJO common UI v20260822.03 */',1)
common.write_text(text,encoding='utf-8')

for html in root.rglob('*.html'):
    if '.git' in html.parts:
        continue
    text=html.read_text(encoding='utf-8')
    updated=text.replace('kinojo-common-ui.js?cache=2026082202','kinojo-common-ui.js?cache=2026082203')
    if html.as_posix().endswith(('admin/index.html','m/admin/index.html')):
        updated=updated.replace('/admin/css/admin.css?cache=2026082201','/admin/css/admin.css?cache=2026082202')
        updated=re.sub(r'(/admin/js/[A-Za-z0-9_.-]+\.js)\?cache=2026082201',r'\1?cache=2026082202',updated)
    if html.as_posix().endswith('tests/my-info-image-editor-harness.html'):
        updated=updated.replace('kinojo-my-info.css?cache=2026082202','kinojo-my-info.css?cache=2026082203')
    if updated!=text:
        html.write_text(updated,encoding='utf-8')

admin_loader=root/'admin/js/admin.js'
text=admin_loader.read_text(encoding='utf-8')
text=text.replace('/* KINOJO Admin modular loader v2026082201 */','/* KINOJO Admin modular loader v2026082202 */',1)
text=text.replace("name+'?cache=2026082201'","name+'?cache=2026082202'",1)
admin_loader.write_text(text,encoding='utf-8')

web_shell=root/'tests/web-shell-auth-contract.test.js'
text=web_shell.read_text(encoding='utf-8')
text=text.replace('/ui/kinojo-common-ui.js?cache=2026082202','/ui/kinojo-common-ui.js?cache=2026082203')
web_shell.write_text(text,encoding='utf-8')

(root/'tests/my-info-admin-image-layout-contract.test.js').write_text((root/'tools/zz_contract_test.js').read_text(encoding='utf-8'),encoding='utf-8')

pages_flow=root/'.github/workflows/verify-kinojo-pages.yml'
text=pages_flow.read_text(encoding='utf-8')
if '"admin/js/admin-members.js"' not in text:
    text=text.replace('            "admin/js/admin-system.js"\n', '            "admin/js/admin-members.js"\n            "admin/js/admin.js"\n            "admin/js/admin-system.js"\n',1)
if 'node tests/my-info-admin-image-layout-contract.test.js' not in text:
    text=text.replace('          node tests/my-info-e1-accessibility.test.js\n', '          node tests/my-info-e1-accessibility.test.js\n          node tests/my-info-admin-image-layout-contract.test.js\n',1)
pages_flow.write_text(text,encoding='utf-8')

profile_flow=root/'.github/workflows/verify-character-refresh-profile.yml'
text=profile_flow.read_text(encoding='utf-8')
text=text.replace("if 'admin.js?cache=2026082201' not in text:","if 'admin.js?cache=2026082202' not in text:")
text=text.replace("'function renderMemberImageGroups_(data)',","'function renderMemberImageGroups_(data,selectedCharacterId',")
anchor="              'data-member-image-view',\n"
if "'data-admin-image-character-select'," not in text:
    text=text.replace(anchor,anchor+"              'data-admin-image-character-select',\n              'data-admin-member-image-detail',\n              'function selectMemberImageCharacter_(characterId)',\n",1)
text=text.replace("if 'v2026082201' not in loader or \"name+'?cache=2026082201'\" not in loader","if 'v2026082202' not in loader or \"name+'?cache=2026082202'\" not in loader")
profile_flow.write_text(text,encoding='utf-8')
print('release patch applied')
