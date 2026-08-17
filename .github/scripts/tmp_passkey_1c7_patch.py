from pathlib import Path
import re


def read(name):
    return Path(name).read_text(encoding='utf-8')


def write(name, text):
    Path(name).write_text(text, encoding='utf-8', newline='')


def once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 anchor, got {count}')
    return text.replace(old, new, 1)


# Auth Session: force one-time cache migration and strip legacy credential fields defensively.
p = 'core/kinojo-auth-session.js'
text = read(p)
text = once(text, "const AUTH_SCHEMA_VERSION='supabase-passkey-v5-server-session-320-20260816';", "const AUTH_SCHEMA_VERSION='supabase-passkey-v6-session-only-329-20260818';", 'auth schema')
old = "function getAccount(){return readJson(ACCOUNT_KEY);}\n  function setStoredSession(session,account){const next=Object.assign({},session||{},{lastActivityAt:Date.now()});delete next.expiresAt;writeJson(STORAGE_KEY,next);writeJson(ACCOUNT_KEY,account||{});emitAuthChanged(next,account);return next;}"
new = "function getAccount(){return readJson(ACCOUNT_KEY);}\n  function stripStoredCredentialFields(value){const next=Object.assign({},value||{});for(const key of ['passKey','passCode','pass_key','pass_code'])delete next[key];return next;}\n  function setStoredSession(session,account){const next=stripStoredCredentialFields(Object.assign({},session||{},{lastActivityAt:Date.now()}));const nextAccount=stripStoredCredentialFields(account);delete next.expiresAt;writeJson(STORAGE_KEY,next);writeJson(ACCOUNT_KEY,nextAccount);emitAuthChanged(next,nextAccount);return next;}"
text = once(text, old, new, 'auth stored credential stripping')
write(p, text)

# Auth Service: never persist the PASS KEY after initial login.
p = 'core/kinojo-auth-service.js'
text = read(p)
start = text.index('  function currentCompatibilityPassKey(')
end = text.index('\n\n  async function ensureReady()', start)
text = text[:start] + text[end:]
text = once(text, 'function normalizeAuthResult(api,data,compatibilityPassKey,tokenOverride){', 'function normalizeAuthResult(api,data,tokenOverride){', 'auth normalize signature')
text = once(text, "    const passKey=api.normalizePassKey(compatibilityPassKey||'');\n", '', 'auth compatibility variable')
compat = "\n    // 1-B 호환 구간: 후속 RPC/Edge가 아직 p_pass_key를 요구하므로 원문 필드를 유지한다.\n    // Server session 전환이 끝난 기능부터 제거하고 1-C에서 완전히 삭제한다.\n    if(passKey){\n      profile.passCode=passKey;\n      profile.passKey=passKey;\n      session.passCode=passKey;\n      session.passKey=passKey;\n    }\n"
text = once(text, compat, '\n', 'auth compatibility storage block')
text = once(text, 'return normalizeAuthResult(api,data,normalized);', 'return normalizeAuthResult(api,data);', 'auth login normalize')
if text.count('return normalizeAuthResult(api,data,currentCompatibilityPassKey(api),token);') != 2:
    raise SystemExit('auth validate/touch anchors')
text = text.replace('return normalizeAuthResult(api,data,currentCompatibilityPassKey(api),token);', 'return normalizeAuthResult(api,data,token);')
if 'currentCompatibilityPassKey' in text:
    raise SystemExit('auth compatibility helper remains')
write(p, text)

# Auth UI: old non-kws session fallback must not require a stored PASS KEY.
p = 'core/kinojo-auth-ui.js'
text = read(p)
old = "      }else{\n        const passKey=String(account.passKey||account.passCode||session.passKey||session.passCode||'').trim();\n        if(!passKey){clearSession('compatibility_data_missing');toast('로그인 정보를 다시 확인해 주세요.');return;}\n        data=await window.KinojoAuthService?.verifyPassKey?.(passKey);\n        if(data?.session) setSession(data.session,data.account||account);\n      }"
new = "      }else{\n        clearSession('legacy_session_unsupported');\n        toast('로그인 방식을 갱신했습니다. 다시 로그인해 주세요.');\n        return;\n      }"
text = once(text, old, new, 'auth ui legacy fallback')
write(p, text)

# Supabase feature bridge: all browser-authenticated calls use kws_ session credentials.
p = 'core/kinojo-supabase-features.js'
text = read(p)
start = text.index('  function currentPassKey(){')
end = text.index('\n\n  function currentServerSessionCredential()', start)
text = text[:start] + text[end:]
for start_marker, end_marker, label in [
    ('  async function adminAccount(', '\n\n  async function getLatestAnnouncements(', 'adminAccount'),
    ('  async function adminCharacter(', '\n\n  function noticeAuthorLabel(', 'adminCharacter'),
    ('  async function adminEventNotice(', '\n\n  async function adminMeter(', 'adminEventNotice'),
    ('  async function adminMeter(', '\n\n\n  async function getWebEventNoticeGroups(', 'adminMeter'),
    ('  async function adminVisitor(', '\n\n  async function adminUnsupported(', 'adminVisitor'),
]:
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    seg = text[start:end]
    count = seg.count('currentPassKey()')
    if count < 1:
        raise SystemExit(f'{label}: no raw credential calls')
    seg = seg.replace('currentPassKey()', 'currentAdminSessionCredential()')
    text = text[:start] + seg + text[end:]

start = text.index('  async function adminLookup(')
end = text.index('\n\n  async function adminSanctuarySheetSync(', start)
seg = text[start:end]
seg = once(seg, 'const passKey=currentPassKey();', 'const credential=currentAdminSessionCredential();', 'adminLookup credential')
for old, new in [('p_pass_code:passKey', 'p_pass_code:credential'), ('runtimeStart(passKey,', 'runtimeStart(credential,'), ('p_pass_key:passKey', 'p_pass_key:credential')]:
    seg = seg.replace(old, new)
if re.search(r'\bpassKey\b', seg):
    raise SystemExit('adminLookup raw variable remains')
text = text[:start] + seg + text[end:]

start = text.index('  function optionalPassKey(){')
end = text.index('\n\n  async function logPageView(', start)
text = text[:start] + text[end:]
start = text.index('  async function logPageView(')
end = text.index('\n  async function logLoginVisit(', start)
seg = text[start:end]
seg = once(seg, "    const passKey=optionalPassKey();\n    if(passKey)body.authPassKey=passKey;", "    const credential=optionalServerSessionCredential();\n    if(credential)body.authCredential=credential;", 'page view credential')
seg = once(seg, "return rpc('kinojo_log_page_view', {", "return rpc('kinojo_log_page_view_v329', {", 'page view rpc')
text = text[:start] + seg + text[end:]

start = text.index('  async function submitHallReaction(')
end = text.index('\n\n  async function submitHallSuggestion(', start)
seg = text[start:end]
seg = once(seg, "return rpc('kinojo_web_submit_hall_reaction_v279',{", "return rpc('kinojo_web_submit_hall_reaction_v329',{", 'hall reaction rpc')
seg = once(seg, '      p_pass_key:currentPassKey(),', '      p_credential:currentServerSessionCredential(),', 'hall reaction credential')
text = text[:start] + seg + text[end:]

if 'currentPassKey()' in text or 'function currentPassKey' in text or 'optionalPassKey' in text:
    raise SystemExit('core raw credential helpers remain')
write(p, text)

# Sanctuary page: auth gate uses only the server-issued session token.
p = 'sanctuary/js/sanctuary.js'
text = read(p)
start = text.index('function readStoredSanctuaryAuth(')
end = text.index('\nfunction operationStatusClass(', start)
new = """function readStoredSanctuaryAuth(key){
  try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_error){return null}
}
function currentSanctuaryAuthState(){
  const auth=window.KinojoAuth||{};
  const session=typeof auth.getSession==='function'?auth.getSession():null;
  const storedSession=readStoredSanctuaryAuth('kinojo_login_session_v1');
  const credential=String(session?.token||storedSession?.token||'').trim();
  return {credential,loggedIn:Boolean(credential)};
}"""
text = text[:start] + new + text[end:]
text = text.replace('authState.passKey', 'authState.credential')
text = once(text, '  const passKey=authState.credential;', '  const credential=authState.credential;', 'sanctuary credential local')
text = text.replace("currentId+'|'+passKey", "currentId+'|'+credential")
text = text.replace('if(!passKey){', 'if(!credential){')
text = once(text, "window.KinojoApi.getAction('sanctuaryOperation',{id:currentId,passKey:currentSanctuaryPassKey()})", "window.KinojoApi.getAction('sanctuaryOperation',{id:currentId})", 'sanctuary operation call')
if 'currentSanctuaryPassKey' in text or 'merged.passKey' in text or 'merged.passCode' in text:
    raise SystemExit('sanctuary raw auth remains')
write(p, text)

# Sanctuary schedule: session token is the only browser credential.
p = 'sanctuary-schedule/js/sanctuary-schedule.js'
text = read(p)
old = """  function currentPassKey(){
    const session = window.KinojoAuth?.getSession?.();
    return String(session?.passKey || session?.passCode || '').trim();
  }"""
new = """  function currentSessionCredential(){
    const session = window.KinojoAuth?.getSession?.();
    return String(session?.token || '').trim();
  }"""
text = once(text, old, new, 'schedule credential helper')
text = text.replace('currentPassKey()', 'currentSessionCredential()')
if 'session?.passKey' in text or 'session?.passCode' in text or 'currentPassKey' in text:
    raise SystemExit('schedule raw auth remains')
write(p, text)

# Common topbar notifications: gate on the server session, not legacy PASS fields.
p = 'ui/kinojo-common-ui.js'
text = read(p)
start = text.index('  function commonPassKey_(){')
end = text.index('\n  function clearSanctuaryAlert_(', start)
new = """  function commonSessionCredential_(){
    const auth=window.KinojoAuth||{};
    const session=typeof auth.getSession==='function'?auth.getSession():null;
    return String(session?.token||'').trim();
  }"""
text = text[:start] + new + text[end:]
text = once(text, '    const passKey=commonPassKey_();', '    const credential=commonSessionCredential_();', 'topbar sanctuary credential')
text = once(text, '    if(!passKey){clearSanctuaryAlert_();return;}', '    if(!credential){clearSanctuaryAlert_();return;}', 'topbar sanctuary gate')
text = once(text, "window.KinojoApi.getAction('mySanctuaryTopbar',{passKey})", "window.KinojoApi.getAction('mySanctuaryTopbar',{})", 'topbar sanctuary call')
text = once(text, "    const passKey=commonPassKey_();const badge=q('#kinojoAdminPendingBadge');", "    const credential=commonSessionCredential_();const badge=q('#kinojoAdminPendingBadge');", 'notification credential')
text = once(text, '    if(!passKey||!window.KinojoApi?.getAction){if(badge)badge.hidden=true;return;}', '    if(!credential||!window.KinojoApi?.getAction){if(badge)badge.hidden=true;return;}', 'notification gate')
text = once(text, "window.KinojoApi.getAction('notificationSummary',{passKey})", "window.KinojoApi.getAction('notificationSummary',{})", 'notification call')
if 'commonPassKey_' in text or 'account?.passKey' in text or 'session?.passKey' in text:
    raise SystemExit('common UI raw auth remains')
write(p, text)

# Hall personal ranking uses kws_ through SQL 329 wrapper.
p = 'hof/js/hall-data.js'
text = read(p)
old = """function hallPassKey(){
  const session=window.KinojoAuth?.getSession?.()||{};
  const account=window.KinojoAuth?.getAccount?.()||{};
  return String(account.passKey||account.passCode||session.passKey||session.passCode||\"\").trim();
}"""
new = """function hallSessionCredential(){
  const session=window.KinojoAuth?.getSession?.()||{};
  return String(session.token||\"\").trim();
}"""
text = once(text, old, new, 'hall credential helper')
text = once(text, '      const passKey=hallPassKey();', '      const credential=hallSessionCredential();', 'hall credential local')
text = once(text, "      if(!passKey){lastError=new Error('로그인 정보를 불러오는 중입니다.');continue;}", "      if(!credential){lastError=new Error('로그인 정보를 불러오는 중입니다.');continue;}", 'hall credential gate')
text = once(text, 'personal=await window.KinojoSupabase.rpc("kinojo_web_get_my_hof_ranking_v319",{p_pass_key:passKey,p_include_subs:!!includeSubs,p_include_all_legions:!!includeAllLegions});', 'personal=await window.KinojoSupabase.rpc("kinojo_web_get_my_hof_ranking_v329",{p_credential:credential,p_include_subs:!!includeSubs,p_include_all_legions:!!includeAllLegions});', 'hall ranking rpc')
if 'hallPassKey' in text or 'account.passKey' in text or 'session.passKey' in text:
    raise SystemExit('hall raw auth remains')
write(p, text)

# Character comparison: character-profile-snapshot accepts kws_ through SQL 328.
p = 'ui/kinojo-character-reaction.js'
text = read(p)
start = text.index('  function compareAccount(){')
end = text.index('\n\n  function normalizedCharacterName(', start)
new = """  function compareAccount(){
    const auth = window.KinojoAuth;
    if(!auth || typeof auth.isLoggedIn !== 'function' || !auth.isLoggedIn()) return null;
    const account = typeof auth.getAccount === 'function' ? (auth.getAccount() || {}) : {};
    const session = typeof auth.getSession === 'function' ? (auth.getSession() || {}) : {};
    const sessionToken = String(session.token || '').trim();
    return sessionToken ? Object.assign({}, account, { sessionToken }) : null;
  }"""
text = text[:start] + new + text[end:]
text = once(text, '        passKey:account.passKey || account.passCode,', '        passKey:account.sessionToken,', 'character compare credential')
if 'account.passKey' in text or 'account.passCode' in text:
    raise SystemExit('character comparison raw auth remains')
write(p, text)

# Meter WEB common login hands the kws_ token to meter-ingest; SQL 329 accepts legacy + kws_.
p = 'meter/js/meter-app.js'
text = read(p)
old = """    const passKey = String(
      (account && (account.passKey || account.passCode || account.pass_key || account.pass_code)) ||
      (session && (session.passKey || session.passCode || session.pass_key || session.pass_code)) || ''
    ).trim();
    return { session, account, passKey, loggedIn: Boolean(source.loggedIn || (session && session.token) || (storedSession && storedSession.token)) };"""
new = """    const sessionToken = String((session && session.token) || (storedSession && storedSession.token) || '').trim();
    return { session, account, sessionToken, loggedIn: Boolean(source.loggedIn || sessionToken) };"""
text = once(text, old, new, 'meter common auth state')
text = text.replace('state.loggedIn && state.passKey', 'state.loggedIn && state.sessionToken')
text = once(text, '  async function loginMine(passKey, authDetail) {', '  async function loginMine(credential, authDetail) {', 'meter login signature')
text = once(text, '        passKey,\n        clientVersion:', '        passKey: credential,\n        clientVersion:', 'meter login payload')
text = once(text, 'if (!state.loggedIn || !state.passKey) {', 'if (!state.loggedIn || !state.sessionToken) {', 'meter connect gate')
text = once(text, 'await loginMine(state.passKey, detail);', 'await loginMine(state.sessionToken, detail);', 'meter connect login')
text = once(text, 'if (state.loggedIn && state.passKey) {', 'if (state.loggedIn && state.sessionToken) {', 'meter open login gate')
if 'account.passKey' in text or 'session.passKey' in text or 'state.passKey' in text:
    raise SystemExit('meter common raw auth remains')
write(p, text)

# Contract test: session/account storage must be credential-free.
p = 'tests/web-shell-auth-contract.test.js'
text = read(p)
text = once(text, "auth.setStoredSession({ token: serverToken, passKey: '000000' }, { passKey: '000000' });", "auth.setStoredSession({ token: serverToken, passKey: '000000', passCode: '000000' }, { passKey: '000000', passCode: '000000' });\nassert.equal(JSON.parse(localStorage.getItem(auth.STORAGE_KEY)).passKey, undefined, 'stored session must not retain PASS KEY');\nassert.equal(JSON.parse(localStorage.getItem(auth.ACCOUNT_KEY)).passCode, undefined, 'stored account must not retain PASS KEY');", 'auth storage test')
text = once(text, "  assert.equal(result.session.passKey, 'AB12', 'Phase 1-B must preserve downstream PASS KEY compatibility');", "  assert.equal(result.session.passKey, undefined, 'Server session must not persist PASS KEY');\n  assert.equal(result.session.passCode, undefined, 'Server session must not persist PASS CODE');\n  assert.equal(result.account.passKey, undefined, 'Account cache must not persist PASS KEY');", 'auth service no-pass test')
text = text.replace("assert.match(html, /kinojo-common-ui\\.js\\?cache=20260812(?:04|22)/, `${page}: common UI cache missing`);", "assert.ok(html.includes('kinojo-common-ui.js?cache=2026081801'), `${page}: common UI cache missing`);")
write(p, text)

# Bust affected browser scripts so credential-bearing cached modules are replaced immediately.
target_scripts = [
    'kinojo-auth-session.js', 'kinojo-auth-service.js', 'kinojo-auth-ui.js', 'kinojo-supabase-features.js',
    'kinojo-common-ui.js', 'kinojo-character-reaction.js', 'hall-data.js', 'meter-app.js', 'sanctuary.js', 'sanctuary-schedule.js'
]
for path in Path('.').rglob('*'):
    if not path.is_file() or path.suffix.lower() not in {'.html', '.js'}:
        continue
    if '.git' in path.parts or path.as_posix().startswith('.github/'):
        continue
    src = path.read_text(encoding='utf-8')
    updated = src
    for script in target_scripts:
        updated = re.sub(re.escape(script) + r'\?cache=[0-9A-Za-z._-]+', script + '?cache=2026081801', updated)
    if updated != src:
        path.write_text(updated, encoding='utf-8', newline='')

# Regex literals and stale exact test expectations need explicit updates.
p = Path('tests/web-shell-auth-contract.test.js')
text = p.read_text(encoding='utf-8')
for old, new in [
    ("'kinojo-auth-session.js?cache=2026081602'", "'kinojo-auth-session.js?cache=2026081801'"),
    ("'kinojo-auth-service.js?cache=2026081602'", "'kinojo-auth-service.js?cache=2026081801'"),
    ("'kinojo-auth-ui.js?cache=2026081602'", "'kinojo-auth-ui.js?cache=2026081801'"),
    ("'kinojo-common-ui.js?cache=2026081204'", "'kinojo-common-ui.js?cache=2026081801'"),
    ("'sanctuary-schedule.js?cache=2026081218'", "'sanctuary-schedule.js?cache=2026081801'"),
]:
    text = text.replace(old, new)
p.write_text(text, encoding='utf-8', newline='')

# Session-only audit on actual runtime readers.
checks = [
    'core/kinojo-auth-service.js', 'core/kinojo-auth-ui.js', 'core/kinojo-supabase-features.js',
    'hof/js/hall-data.js', 'meter/js/meter-app.js', 'sanctuary/js/sanctuary.js',
    'sanctuary-schedule/js/sanctuary-schedule.js', 'ui/kinojo-common-ui.js', 'ui/kinojo-character-reaction.js'
]
forbidden = ['account.passKey', 'account.passCode', 'session.passKey', 'session.passCode', 'currentPassKey()', 'optionalPassKey()', 'authPassKey=']
failed = []
print('=== SESSION-ONLY AUDIT ===')
for name in checks:
    source = Path(name).read_text(encoding='utf-8')
    hits = [token for token in forbidden if token in source]
    print(name, 'OK' if not hits else 'HITS ' + ','.join(hits))
    if hits:
        failed.append((name, hits))
auth_source = Path('core/kinojo-auth-service.js').read_text(encoding='utf-8')
if '.passKey=passKey' in auth_source or '.passCode=passKey' in auth_source:
    failed.append(('core/kinojo-auth-service.js', ['credential assignment']))
if failed:
    raise SystemExit(f'session-only audit failed: {failed}')
