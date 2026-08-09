from pathlib import Path
import re


def read(path):
    return Path(path).read_text(encoding='utf-8')


def write(path, text):
    Path(path).write_text(text, encoding='utf-8', newline='\n')


def replace_once(path, old, new, label):
    text = read(path)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, found {count}')
    write(path, text.replace(old, new, 1))


def replace_all_exact(paths, old, new, label):
    for path in paths:
        text = read(path)
        count = text.count(old)
        if count != 1:
            raise SystemExit(f'{label} ({path}): expected exactly one match, found {count}')
        write(path, text.replace(old, new, 1))


html_paths = ['admin/index.html', 'm/admin/index.html']
replace_all_exact(
    html_paths,
    '''    <section class="admin-pane" data-admin-pane="meter" data-admin-master-only>\n      <div class="admin-meter-grid">''',
    '''    <section class="admin-pane" data-admin-pane="meter" data-admin-master-only>\n      <section class="admin-card admin-meter-channel-card">\n        <div class="admin-card-head"><div><h2>운영 채널</h2><p>Stable 사용자 운영과 Staging 테스트 운영을 서로 독립적으로 관리합니다.</p></div></div>\n        <div class="admin-meter-operation-head">\n          <div><span>현재 관리 대상</span><strong id="meterAdminChannelBadge">Stable</strong></div>\n          <label class="admin-meter-mode">채널<select class="admin-select" id="meterAdminChannel" aria-label="키노조 미터 운영 채널"><option value="stable">Stable · 사용자 운영</option><option value="staging">Staging · 테스트 운영</option></select></label>\n        </div>\n        <div id="meterAdminChannelStatus" class="admin-statusline">채널을 바꾸면 해당 채널의 운영 상태를 다시 불러옵니다.</div>\n      </section>\n      <div class="admin-meter-grid">''',
    'meter channel selector')

launch_card = '''          <div id="meterAdminOperationStatus" class="admin-statusline"></div>\n        </section>\n\n        <section class="admin-card admin-meter-operation-card">\n          <div class="admin-card-head"><div><h2>미터기 실행</h2><p>런처 로그인·업데이트는 유지하고 실제 Core 실행만 채널별로 허용하거나 차단합니다.</p></div></div>\n          <div class="admin-meter-operation-head">\n            <div><span>현재 실행 상태</span><strong id="meterAdminLaunchBadge">확인 중</strong></div>\n            <label class="admin-meter-mode">미터기 실행<select class="admin-select" id="meterAdminLaunchMode" aria-label="미터기 실행 상태"><option value="ON">ON · 실행 허용</option><option value="OFF">OFF · 실행 차단</option></select></label>\n          </div>\n          <label class="admin-meter-field">실행 차단/점검 안내 문구<textarea class="admin-textarea" id="meterAdminLaunchMessage" rows="3" maxlength="300" placeholder="예: 현재 미터기 점검 중입니다."></textarea></label>\n          <div class="admin-form-row"><button class="admin-btn primary" id="meterAdminLaunchSaveBtn" type="button">미터기 실행 상태 저장</button></div>\n          <div id="meterAdminLaunchStatus" class="admin-statusline"></div>\n        </section>\n\n        <section class="admin-card admin-meter-operation-card">'''
replace_all_exact(
    html_paths,
    '''          <div id="meterAdminOperationStatus" class="admin-statusline"></div>\n        </section>\n\n        <section class="admin-card admin-meter-operation-card">''',
    launch_card,
    'meter launch card')

# Shared feature bridge: one secure Edge action map entry.
path = 'core/kinojo-supabase-features.js'
text = read(path)
patterns = [
    (r"(saveStatistics\s*:\s*['\"]adminMeterStatisticsSave['\"]\s*,)", r"\1\n      saveLaunch:'adminMeterLaunchSave',"),
    (r"(saveOperation\s*:\s*['\"]adminMeterOperationSave['\"]\s*,)", r"\1\n      saveLaunch:'adminMeterLaunchSave',")
]
updated = text
matched = False
for pattern, replacement in patterns:
    candidate, count = re.subn(pattern, replacement, updated, count=1)
    if count == 1:
        updated = candidate
        matched = True
        break
if not matched:
    raise SystemExit('adminMeter action map: saveOperation/saveStatistics marker not found')
write(path, updated)

# Admin system JS.
path = 'admin/js/admin-system.js'
text = read(path)
old = '''  function selectedMeterLevels(){\n    return $$('[data-meter-level]:checked').map(input=>Number(input.value)).filter(level=>level>=1&&level<=5);\n  }\n\n'''
new = '''  function selectedMeterLevels(){\n    return $$('[data-meter-level]:checked').map(input=>Number(input.value)).filter(level=>level>=1&&level<=5);\n  }\n\n  function selectedMeterChannel(){\n    return String($('#meterAdminChannel')?.value||'stable').toLowerCase()==='staging'?'staging':'stable';\n  }\n\n'''
if text.count(old) != 1: raise SystemExit('selectedMeterLevels marker missing')
text = text.replace(old, new, 1)

old = '''    badge.textContent=METER_MODE_LABELS[mode]||METER_MODE_LABELS.CLOSED;\n    badge.classList.toggle('is-off',mode==='CLOSED');\n    const statistics=data?.statisticsOperation||{};'''
new = '''    badge.textContent=METER_MODE_LABELS[mode]||METER_MODE_LABELS.CLOSED;\n    badge.classList.toggle('is-off',mode==='CLOSED');\n    const channel=String(operation.channel||selectedMeterChannel()).toLowerCase()==='staging'?'staging':'stable';\n    const channelSelect=$('#meterAdminChannel'); if(channelSelect)channelSelect.value=channel;\n    const channelBadge=$('#meterAdminChannelBadge'); if(channelBadge)channelBadge.textContent=channel==='staging'?'Staging':'Stable';\n    setStatus('#meterAdminChannelStatus',(channel==='staging'?'Staging 테스트':'Stable 사용자')+' 채널을 관리하고 있습니다.','ok');\n    const launchEnabled=operation.launchEnabled===true;\n    const launchMode=$('#meterAdminLaunchMode'); if(launchMode)launchMode.value=launchEnabled?'ON':'OFF';\n    const launchMessage=$('#meterAdminLaunchMessage'); if(launchMessage)launchMessage.value=String(operation.launchMessage||'키노조 미터 실행이 일시 중지되어 있습니다. 잠시 후 다시 시도해 주세요.');\n    const launchBadge=$('#meterAdminLaunchBadge');\n    if(launchBadge){launchBadge.textContent=launchEnabled?'실행 허용':'실행 차단';launchBadge.classList.toggle('is-off',!launchEnabled);}\n    const statistics=data?.statisticsOperation||{};'''
if text.count(old) != 1: raise SystemExit('render launch marker missing')
text = text.replace(old, new, 1)

text = text.replace("const data=await adminMeter('console',{channel:'stable'});", "const data=await adminMeter('console',{channel:selectedMeterChannel()});", 1)
text = text.replace("        channel:'stable',\n        downloadEnabled:enabled,", "        channel:selectedMeterChannel(),\n        downloadEnabled:enabled,", 1)
text = text.replace("const data=await adminMeter('saveStatistics',{channel:'stable',publicEnabled,publicMessage});", "const data=await adminMeter('saveStatistics',{channel:selectedMeterChannel(),publicEnabled,publicMessage});", 1)

save_launch = '''  async function saveMeterLaunch(){\n    if(!isMaster())return;\n    const launchEnabled=$('#meterAdminLaunchMode')?.value==='ON';\n    const launchMessage=$('#meterAdminLaunchMessage')?.value.trim()||'';\n    if(!launchMessage){setStatus('#meterAdminLaunchStatus','실행 상태 안내 문구를 입력하세요.','error');return;}\n    const channel=selectedMeterChannel();\n    const channelLabel=channel==='staging'?'Staging':'Stable';\n    if(!confirm(launchEnabled?channelLabel+' 미터기 실행을 허용할까요?':channelLabel+' 런처의 실제 미터기 실행만 차단할까요?'))return;\n    const button=$('#meterAdminLaunchSaveBtn'); if(button)button.disabled=true;\n    setStatus('#meterAdminLaunchStatus','미터기 실행 상태를 저장하는 중...','');\n    try{\n      const data=await adminMeter('saveLaunch',{channel,launchEnabled,launchMessage});\n      if(!data||data.ok===false)throw new Error(data?.message||'미터기 실행 상태 저장 실패');\n      renderMeterAdminConsole(data);\n      setStatus('#meterAdminLaunchStatus',data.message||'미터기 실행 상태를 저장했습니다.','ok');\n      toast(data.message||'미터기 실행 상태 저장 완료');\n      addLog('METER',channelLabel+' '+(launchEnabled?'미터기 실행 허용':'미터기 실행 차단'));\n    }catch(err){setStatus('#meterAdminLaunchStatus',meterAdminErrorMessage(err,'미터기 실행 상태를 저장하지 못했습니다.'),'error');}\n    finally{if(button)button.disabled=false;}\n  }\n\n'''
marker = '  async function saveMeterStatistics(){\n'
if text.count(marker) != 1: raise SystemExit('saveMeterStatistics marker missing')
text = text.replace(marker, save_launch + marker, 1)

old_export = 'METER_STATISTICS_MODE_LABELS,meterDateInput,meterIsoFromInput,meterFileSize,selectedMeterLevels,setMeterModeControls,ensureMeterStatisticsModeControl'
new_export = 'METER_STATISTICS_MODE_LABELS,meterDateInput,meterIsoFromInput,meterFileSize,selectedMeterLevels,selectedMeterChannel,setMeterModeControls,ensureMeterStatisticsModeControl'
if text.count(old_export) != 1: raise SystemExit('admin system export prefix missing')
text = text.replace(old_export, new_export, 1)
old_export2 = 'loadMeterAdminConsole,saveMeterOperation,saveMeterStatistics,saveMeterNotice'
new_export2 = 'loadMeterAdminConsole,saveMeterOperation,saveMeterLaunch,saveMeterStatistics,saveMeterNotice'
if text.count(old_export2) != 1: raise SystemExit('admin system function export missing')
text = text.replace(old_export2, new_export2, 1)
write(path, text)

# Bootstrap bindings.
path = 'admin/js/admin-bootstrap.js'
text = read(path)
old = '''  const saveMeterOperation=(...args)=>A.saveMeterOperation(...args);\n  const saveMeterStatistics=(...args)=>A.saveMeterStatistics(...args);'''
new = '''  const saveMeterOperation=(...args)=>A.saveMeterOperation(...args);\n  const saveMeterLaunch=(...args)=>A.saveMeterLaunch(...args);\n  const saveMeterStatistics=(...args)=>A.saveMeterStatistics(...args);'''
if text.count(old) != 1: raise SystemExit('bootstrap save function marker missing')
text = text.replace(old, new, 1)
old = '''    $('#meterAdminReloadBtn')?.addEventListener('click',loadMeterAdminConsole);\n    $('#meterAdminOperationSaveBtn')?.addEventListener('click',saveMeterOperation);\n    $('#meterAdminStatisticsSaveBtn')?.addEventListener('click',saveMeterStatistics);'''
new = '''    $('#meterAdminReloadBtn')?.addEventListener('click',loadMeterAdminConsole);\n    $('#meterAdminChannel')?.addEventListener('change',()=>loadMeterAdminConsole());\n    $('#meterAdminOperationSaveBtn')?.addEventListener('click',saveMeterOperation);\n    $('#meterAdminLaunchSaveBtn')?.addEventListener('click',saveMeterLaunch);\n    $('#meterAdminStatisticsSaveBtn')?.addEventListener('click',saveMeterStatistics);'''
if text.count(old) != 1: raise SystemExit('bootstrap meter binding marker missing')
text = text.replace(old, new, 1)
write(path, text)

print('WEB Meter channel + launch operation patch applied.')
