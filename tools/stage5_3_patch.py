from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def rep(path, old, new, expected=1):
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} occurrences, found {count}: {old[:80]}")
    write(path, text.replace(old, new))


def rep_at_least(path, old, new, minimum=1):
    text = read(path)
    count = text.count(old)
    if count < minimum:
        raise SystemExit(f"{path}: expected >= {minimum} occurrences, found {count}: {old[:80]}")
    write(path, text.replace(old, new))


def insert_before(path, marker, block):
    text = read(path)
    if text.count(marker) != 1:
        raise SystemExit(f"{path}: marker count != 1: {marker[:80]}")
    write(path, text.replace(marker, block + marker))


meter = "meter/js/meter-app.js"
rep_at_least(meter, "WEB_50021", "WEB_50026", 1)
rep(meter, "  let meterOperation = null;\n", "  let meterOperation = null;\n  let statisticsOperation = null;\n")
rep(
    meter,
    "    meterNotices = asArray(data && data.notices);\n",
    "    statisticsOperation = data && data.statisticsOperation && typeof data.statisticsOperation === 'object'\n"
    "      ? data.statisticsOperation\n"
    "      : { publicEnabled: false, publicMessage: '전투 통계 준비 중입니다.' };\n"
    "    meterNotices = asArray(data && data.notices);\n",
)
rep(
    meter,
    "    } else if (state === 'NO_DATA') {\n",
    "    } else if (state === 'ADMIN_HIDDEN') {\n"
    "      badge.textContent = '관리자 비공개';\n"
    "      badge.classList.add('is-waiting');\n"
    "    } else if (state === 'INSUFFICIENT_SAMPLE') {\n"
    "      badge.textContent = '표본 집계 중';\n"
    "      badge.classList.add('is-suppressed');\n"
    "    } else if (state === 'NO_DATA') {\n",
)
rep(
    meter,
    "        setSystemNotice('공개 기준 집계 중', data.publicMessage || 'Server 공개 기준을 충족할 때까지 정확한 통계값을 보호합니다.');\n",
    "        setSystemNotice(data.publicState === 'ADMIN_HIDDEN' ? '전투 통계 비공개' : '공개 기준 집계 중', data.publicMessage || 'Server 공개 기준을 충족할 때까지 정확한 통계값을 보호합니다.');\n",
)
rep(
    meter,
    "      const guide = data.publicState === 'NO_DATA'\n"
    "        ? 'Server 연결은 정상입니다. 검증 완료 전투가 수집되면 이 영역에 자동으로 통계가 표시됩니다.'\n"
    "        : '정확한 표본 수와 DPS 값은 공개 기준 미달 시 표시하지 않습니다.';\n",
    "      const guide = data.publicState === 'NO_DATA'\n"
    "        ? 'Server 연결은 정상입니다. 검증 완료 전투가 수집되면 이 영역에 자동으로 통계가 표시됩니다.'\n"
    "        : data.publicState === 'ADMIN_HIDDEN'\n"
    "          ? '관리자 공개 설정이 켜지기 전까지 Server가 통계값을 반환하지 않습니다.'\n"
    "          : '정확한 표본 수와 DPS 값은 공개 기준 미달 시 표시하지 않습니다.';\n",
)
rep(
    meter,
    "    const profileResolved = Number(participant.meterCharacterId || 0) > 0;\n",
    "    const profileStatus = String(participant.profileStatus || '').toUpperCase();\n"
    "    const profileResolved = profileStatus && !['PENDING','UNRESOLVED'].includes(profileStatus);\n",
)
text = read(meter)
start = text.index("  function observedRecordMarkup(record) {")
end = text.index("\n  function resetObserved", start)
new_func = r'''  function observedRecordMarkup(record) {
    const participants = asArray(record.participants);
    const resolvedCount = participants.filter((row) => {
      const status = String(row.profileStatus || '').toUpperCase();
      return status && !['PENDING','UNRESOLVED'].includes(status);
    }).length;
    const validation = String(record.validationStatus || 'OBSERVED').toUpperCase();
    const validationLabels = {
      VALIDATED: record.statisticsEligible === true ? '통계 적격' : '검증 완료',
      REVIEW_REQUIRED: '검토 필요',
      INVALID: '제외',
      OBSERVED: '검증 대기'
    };
    const validationLabel = validationLabels[validation] || '검증 대기';
    const dungeon = record.dungeonName || record.dungeonKey || '던전 미확인';
    const difficulty = record.difficultyName || record.variantName || record.difficultyKey || record.variantKey || '난이도 미확인';
    const bossOrder = Number(record.bossOrder || 0) > 0 ? `${Math.trunc(Number(record.bossOrder))}보스 · ` : '';
    const occurred = serverTime(record.occurredAt);
    const reason = String(record.validationReason || '').trim();
    const integrity = String(record.damageIntegrityStatus || 'UNKNOWN').toUpperCase();
    return `<article class="meter-observed-card">
      <header>
        <div><span>${escapeHtml(dungeon)} · ${escapeHtml(difficulty)}</span><h3>${bossOrder}${escapeHtml(record.bossName || '보스 미확인')}</h3></div>
        <b>${escapeHtml(validationLabel)}</b>
      </header>
      <div class="meter-observed-summary">
        <div><span>파티 피해</span><strong>${formatCount(record.partyTotalDamage, '0')}</strong></div>
        <div><span>전투 시간</span><strong>${Number(record.durationSeconds || 0).toFixed(1)}초</strong></div>
        <div><span>참가자 프로필</span><strong>${resolvedCount}/${participants.length}</strong></div>
        <div><span>Server 무결성</span><strong>${escapeHtml(integrity)}</strong></div>
      </div>
      <p>${occurred ? `${escapeHtml(occurred)} KST` : '수집 시각 미확인'} · ${escapeHtml(record.decoderType || 'Decoder 미확인')} ${escapeHtml(record.decoderVersion || '')}${reason ? ` · ${escapeHtml(reason)}` : ''}</p>
      <details>
        <summary>파티원별 피해 보기</summary>
        <ul>${participants.length ? participants.map(observedParticipantMarkup).join('') : '<li class="meter-empty">저장된 참가자가 없습니다.</li>'}</ul>
      </details>
    </article>`;
  }
'''
write(meter, text[:start] + new_func + text[end:])
rep(meter, "callMeter('recentObserved', { sessionToken: meterSessionToken, limit: 20 })", "callMeter('recentCombatRecords', { sessionToken: meterSessionToken, limit: 20 })")
rep(meter, "이 계정에서 Server에 저장한 최근 실제 수집 기록을 확인하는 중입니다.", "이 계정에서 Server에 저장한 최근 전투 기록과 검증 상태를 확인하는 중입니다.")
rep(meter, "아직 Server에 저장된 실제 수집 기록이 없습니다. Desktop 0.2.33 이상에서 보스 전투가 끝나면 여기에 표시됩니다.", "아직 Server에 저장된 전투 기록이 없습니다. 새 Core에서 보스 전투가 끝나면 검증 상태와 함께 여기에 표시됩니다.")
rep(meter, "최근 ${records.length.toLocaleString('ko-KR')}건 · 소유자 전용 · Decoder 검증 전 · 공개 통계 제외", "최근 ${records.length.toLocaleString('ko-KR')}건 · 소유자 전용 · Server 검증 상태 표시")
rep_at_least(meter, "2026080601", "2026080701", 1)

feature = "core/kinojo-supabase-features.js"
rep(
    feature,
    "      saveOperation:'adminMeterOperationSave',\n      saveNotice:'adminMeterNoticeSave',",
    "      saveOperation:'adminMeterOperationSave',\n      saveStatistics:'adminMeterStatisticsSave',\n      saveNotice:'adminMeterNoticeSave',",
)

system = "admin/js/admin-system.js"
rep(system, "v2026080601", "v2026080701")
rep(
    system,
    "    badge.classList.toggle('is-off',mode==='CLOSED');\n    const distribution=data?.distribution||{};\n",
    "    badge.classList.toggle('is-off',mode==='CLOSED');\n"
    "    const statistics=data?.statisticsOperation||{};\n"
    "    const overview=data?.combatOverview||{};\n"
    "    $('#meterAdminStatisticsEnabled').checked=statistics.publicEnabled===true;\n"
    "    $('#meterAdminStatisticsMessage').value=String(statistics.publicMessage||'전투 통계 준비 중입니다.');\n"
    "    const statisticsBadge=$('#meterAdminStatisticsBadge');\n"
    "    statisticsBadge.textContent=statistics.publicEnabled===true?'통계 공개':'통계 비공개';\n"
    "    statisticsBadge.classList.toggle('is-off',statistics.publicEnabled!==true);\n"
    "    const count=(id,value)=>{$(id).textContent=Number(value||0).toLocaleString('ko-KR');};\n"
    "    count('#meterAdminCombatTotal',overview.totalRecords);\n"
    "    count('#meterAdminCombatCurrent',overview.currentPipelineRecords);\n"
    "    count('#meterAdminCombatValidated',overview.validatedRecords);\n"
    "    count('#meterAdminCombatObserved',overview.observedRecords);\n"
    "    count('#meterAdminCombatReview',overview.reviewRequiredRecords);\n"
    "    count('#meterAdminCombatInvalid',overview.invalidRecords);\n"
    "    count('#meterAdminCombatEligible',overview.statisticsEligibleRecords);\n"
    "    count('#meterAdminCombatParticipants',overview.participantRows);\n"
    "    count('#meterAdminCombatTargetLedger',overview.targetLedgerRecords);\n"
    "    const distribution=data?.distribution||{};\n",
)
insert_before(
    system,
    "  async function saveMeterNotice(){\n",
    r'''  async function saveMeterStatistics(){
    if(!isMaster())return;
    const publicEnabled=$('#meterAdminStatisticsEnabled').checked;
    const publicMessage=$('#meterAdminStatisticsMessage').value.trim();
    if(!publicMessage){setStatus('#meterAdminStatisticsStatus','통계 안내 문구를 입력하세요.','error');return;}
    if(!confirm(publicEnabled?'검증·통계 적격 전투를 사용자에게 공개할까요?':'전투 통계를 사용자에게 비공개로 전환할까요?'))return;
    const button=$('#meterAdminStatisticsSaveBtn');button.disabled=true;
    setStatus('#meterAdminStatisticsStatus','통계 공개 설정을 저장하는 중...','');
    try{
      const data=await adminMeter('saveStatistics',{channel:'stable',publicEnabled,publicMessage});
      if(!data||data.ok===false)throw new Error(data?.message||'통계 공개 설정 저장 실패');
      renderMeterAdminConsole(data);
      setStatus('#meterAdminStatisticsStatus',data.message||'통계 공개 설정을 저장했습니다.','ok');
      toast(data.message||'전투 통계 공개 설정 저장 완료');
      addLog('METER',publicEnabled?'전투 통계 공개':'전투 통계 비공개');
    }catch(err){setStatus('#meterAdminStatisticsStatus',err.message||String(err),'error');}
    finally{button.disabled=false;}
  }

''',
)
rep(system, "renderMeterAdminConsole,loadMeterAdminConsole,saveMeterOperation,saveMeterNotice", "renderMeterAdminConsole,loadMeterAdminConsole,saveMeterOperation,saveMeterStatistics,saveMeterNotice")

bootstrap = "admin/js/admin-bootstrap.js"
rep(bootstrap, "v2026080601", "v2026080701")
rep(bootstrap, "  const saveMeterOperation=(...args)=>A.saveMeterOperation(...args);\n", "  const saveMeterOperation=(...args)=>A.saveMeterOperation(...args);\n  const saveMeterStatistics=(...args)=>A.saveMeterStatistics(...args);\n")
rep(bootstrap, "    $('#meterAdminOperationSaveBtn')?.addEventListener('click',saveMeterOperation);\n", "    $('#meterAdminOperationSaveBtn')?.addEventListener('click',saveMeterOperation);\n    $('#meterAdminStatisticsSaveBtn')?.addEventListener('click',saveMeterStatistics);\n")

loader = "admin/js/admin.js"
rep(loader, "v2026080601", "v2026080701")
rep(loader, "name+'?cache=2026080601'", "name+'?cache=2026080701'")

stats_card = r'''        <section class="admin-card admin-meter-operation-card">
          <div class="admin-card-head"><div><h2>전투 통계 공개</h2><p>Server 검증·통계 적격 판정과 별개로 사용자 공개 여부를 MASTER가 제어합니다.</p></div></div>
          <div class="admin-meter-operation-head">
            <div><span>현재 공개 상태</span><strong id="meterAdminStatisticsBadge">확인 중</strong></div>
            <div class="admin-form-row admin-meter-checks"><label><input id="meterAdminStatisticsEnabled" type="checkbox"/> 통계 공개</label></div>
          </div>
          <label class="admin-meter-field">비공개/준비 안내 문구<textarea class="admin-textarea" id="meterAdminStatisticsMessage" rows="3" maxlength="300" placeholder="예: 전투 통계 준비 중입니다."></textarea></label>
          <dl class="admin-meter-release">
            <div><dt>전체 수집</dt><dd id="meterAdminCombatTotal">-</dd></div>
            <div><dt>현 파이프라인</dt><dd id="meterAdminCombatCurrent">-</dd></div>
            <div><dt>검증 완료</dt><dd id="meterAdminCombatValidated">-</dd></div>
            <div><dt>검증 대기</dt><dd id="meterAdminCombatObserved">-</dd></div>
            <div><dt>검토 필요</dt><dd id="meterAdminCombatReview">-</dd></div>
            <div><dt>제외</dt><dd id="meterAdminCombatInvalid">-</dd></div>
            <div><dt>통계 적격</dt><dd id="meterAdminCombatEligible">-</dd></div>
            <div><dt>참가자 행</dt><dd id="meterAdminCombatParticipants">-</dd></div>
            <div><dt>Target 원장 전투</dt><dd id="meterAdminCombatTargetLedger">-</dd></div>
          </dl>
          <div class="admin-form-row"><button class="admin-btn primary" id="meterAdminStatisticsSaveBtn" type="button">통계 공개 설정 저장</button></div>
          <div id="meterAdminStatisticsStatus" class="admin-statusline"></div>
        </section>

'''
for page in ["admin/index.html", "m/admin/index.html"]:
    insert_before(page, '        <section class="admin-card admin-meter-release-card">\n', stats_card)
    rep(page, '../core/kinojo-supabase-features.js?cache=2026080205', '../core/kinojo-supabase-features.js?cache=2026080701')
    rep(page, './js/admin.js?cache=2026080601', './js/admin.js?cache=2026080701')

for page in ["meter/index.html", "m/meter/index.html"]:
    rep(page, 'RECENT CAPTURES · OWNER ONLY', 'RECENT COMBAT · OWNER ONLY')
    rep(page, '최근 수집 기록', '최근 전투 기록')
    rep(page, '<div class="meter-observed-policy"><strong>검증 전 실제 수집 데이터</strong><span>현재 Decoder가 읽은 범위만 표시하며 공개 통계·랭킹에는 포함하지 않습니다.</span></div>', '<div class="meter-observed-policy"><strong>Server 저장·검증 상태</strong><span>모든 실제 전투를 보존하고 검증 상태를 표시합니다. 공개 통계는 Server 적격 판정과 관리자 공개 설정을 모두 충족한 기록만 사용합니다.</span></div>')
    rep(page, 'PASS KEY 로그인 후 이 계정에서 업로드한 기록을 확인할 수 있습니다.', 'PASS KEY 로그인 후 이 계정에서 업로드한 최근 전투와 Server 검증 상태를 확인할 수 있습니다.')
    rep(page, './js/meter-app.js?cache=2026080601', './js/meter-app.js?cache=2026080701')

verify = ".github/workflows/verify-kinojo-pages.yml"
rep_at_least(verify, 'meter-app.js?cache=2026080601', 'meter-app.js?cache=2026080701', 1)
marker = '          for token in ["launcherDownloadAuthorization", "renderDistribution", "미터기 포함"]:\n'
if marker not in read(verify):
    raise SystemExit("verify workflow meter contract marker missing")
extra = r'''          for token in ["WEB_50026", "recentCombatRecords", "ADMIN_HIDDEN"]:
              if token not in meter_app:
                  raise SystemExit(f"Meter WEB stage5-3 contract missing: {token}")
          if "callMeter('recentObserved'" in meter_app:
              raise SystemExit("Meter WEB must use recentCombatRecords for owner history")
          for page in meter_pages:
              text = page.read_text(encoding="utf-8")
              for token in ["RECENT COMBAT · OWNER ONLY", "Server 저장·검증 상태"]:
                  if token not in text:
                      raise SystemExit(f"{page}: Meter combat history contract missing: {token}")
          for page in admin_pages:
              text = page.read_text(encoding="utf-8")
              for token in ["meterAdminStatisticsEnabled", "meterAdminCombatEligible", "meterAdminStatisticsSaveBtn"]:
                  if token not in text:
                      raise SystemExit(f"{page}: Meter statistics admin contract missing: {token}")

'''
text = read(verify)
write(verify, text.replace(marker, extra + marker))

for path in [meter, feature, system, bootstrap, loader]:
    if "\x00" in read(path):
        raise SystemExit(f"{path}: NUL byte")
if "callMeter('recentObserved'" in read(meter):
    raise SystemExit("recentObserved call remains")
if "adminMeterStatisticsSave" not in read(feature):
    raise SystemExit("admin stats action map missing")
