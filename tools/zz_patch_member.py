from pathlib import Path
root=Path(__file__).resolve().parents[1]
common=root/'ui/kinojo-common-ui.js'
css=root/'ui/kinojo-my-info.css'

s = common.read_text(encoding='utf-8')
s = s.replace("link.href='/ui/kinojo-my-info.css?cache=2026082202';", "link.href='/ui/kinojo-my-info.css?cache=2026082203';")
s = s.replace(
"  const KINOJO_REFERENCE_IMAGE_SLOTS=['FRONT','BACK','UPPER_BODY'];\n",
"  const KINOJO_REFERENCE_IMAGE_SLOTS=['FRONT','BACK','UPPER_BODY'];\n"
"  const KINOJO_REFERENCE_GUIDE_ASSETS={FRONT:'/assets/images/my-info/guides/front-2x3.svg',BACK:'/assets/images/my-info/guides/back-2x3.svg',UPPER_BODY:'/assets/images/my-info/guides/upper-body-4x5.svg'};\n"
)

start = s.index('  function renderMyInfoReferencePicker_(){')
end = s.index('  function resetMyInfoReferencePicker_(', start)
new_render = r'''  function renderMyInfoReferencePicker_(){
    const characterId=Number(kinojoMyProfileUiState.selectedCharacterId||0);
    const ready=Number.isInteger(characterId)&&characterId>0&&!!myInfoSessionToken_()&&kinojoMyReferencePickerState.characterId===characterId;
    const serverState=kinojoMyReferencePickerState.stateByCharacter[characterId]||null;
    const references=Array.isArray(serverState?.references)?serverState.references:[];
    const section=q('#kinojoMyInfoReferenceSection');
    const head=q('#kinojoMyInfoReferenceHeadMeta');
    if(section)section.setAttribute('aria-disabled',ready?'false':'true');
    if(head)head.textContent=ready?(serverState?.ok===true?'비공개 · 최대 7일 보관':'등록 상태 확인 중'):'캐릭터 선택 후 슬롯 선택';
    document.querySelectorAll('#kinojoMyInfoReferenceGrid [data-reference-slot]').forEach(card=>{
      const slot=String(card.dataset.referenceSlot||'');
      const file=kinojoMyReferencePickerState.filesBySlot[slot]||null;
      const active=references.find(item=>item?.slot===slot&&item?.active===true)||null;
      const selected=kinojoMyReferencePickerState.activeSlot===slot;
      const busy=!!kinojoMyReferencePickerState.uploadingSlot;
      card.setAttribute('aria-disabled',(!ready||busy)?'true':'false');
      card.classList.toggle('is-selected',selected||!!file);
      card.classList.toggle('is-registered',!!active);
      card.classList.toggle('is-pending',!!file);
      const visual=card.querySelector('[data-reference-visual]')||card;
      let preview=card.querySelector('[data-reference-preview]');
      const guide=card.querySelector('[data-reference-guide]');
      const previewUrl=String(kinojoMyReferencePickerState.previewUrlsBySlot[slot]||'');
      if(previewUrl){
        if(!preview){
          preview=document.createElement('img');
          preview.setAttribute('data-reference-preview','');
          preview.className='kinojo-my-info-reference-preview-image';
          visual.appendChild(preview);
        }
        preview.src=previewUrl;
        preview.alt=slot+' 참고 이미지 로컬 미리보기';
        preview.hidden=false;
        if(guide)guide.hidden=true;
      }else{
        if(preview){preview.removeAttribute('src');preview.hidden=true;}
        if(guide)guide.hidden=false;
      }
      const status=card.querySelector('[data-reference-file-status]');
      if(status){
        if(file)status.textContent='WEBP · '+myInfoProfileFileSize_(file.size)+' · 등록 대기';
        else if(active){
          const expiry=String(active.expiresAt||'');
          const remaining=Math.max(0,Math.ceil((new Date(expiry).getTime()-Date.now())/86400000));
          status.textContent='등록됨 · '+(remaining>0?'약 '+remaining+'일 남음':'만료 처리 중');
        }else status.textContent='등록된 이미지 없음';
      }
      const select=card.querySelector('[data-reference-select-slot]');
      const upload=card.querySelector('[data-reference-upload-slot]');
      const cancel=card.querySelector('[data-reference-cancel-slot]');
      const remove=card.querySelector('[data-reference-delete-slot]');
      if(select){select.disabled=!ready||busy;select.textContent=active?'이미지 교체':'이미지 업로드';}
      if(upload){upload.hidden=!file;upload.disabled=!file||busy;upload.textContent=active?'안전하게 교체':'비공개 등록';}
      if(cancel){cancel.hidden=!file;cancel.disabled=busy;}
      if(remove){remove.hidden=!active;remove.disabled=busy;}
    });
  }
'''
s = s[:start] + new_render + s[end:]

s = s.replace('  async function uploadMyInfoReference_(){\n    const slot=String(kinojoMyReferencePickerState.activeSlot||\'\');',
              '  async function uploadMyInfoReference_(slotValue){\n    const slot=String(slotValue||kinojoMyReferencePickerState.activeSlot||\'\').trim();\n    if(!KINOJO_REFERENCE_IMAGE_SLOTS.includes(slot))return false;\n    kinojoMyReferencePickerState.activeSlot=slot;')
s = s.replace('  async function deleteMyInfoReference_(){\n    const slot=String(kinojoMyReferencePickerState.activeSlot||\'\');',
              '  async function deleteMyInfoReference_(slotValue){\n    const slot=String(slotValue||kinojoMyReferencePickerState.activeSlot||\'\').trim();\n    if(!KINOJO_REFERENCE_IMAGE_SLOTS.includes(slot))return false;\n    kinojoMyReferencePickerState.activeSlot=slot;')
s = s.replace("    if(!button||button.disabled)return false;", "    if(!button||button.getAttribute('aria-disabled')==='true')return false;")

needle = '  function renderMyInfoProfileCharacterButtons_(){'
idx = s.index(needle)
overflow_fn = r'''  function updateMyInfoProfileCharacterOverflow_(){
    const host=q('#kinojoMyInfoProfileCharacters');
    const pane=host?.closest?.('.kinojo-my-info-profile-character-pane');
    if(!host||!pane)return;
    const overflow=host.scrollHeight>host.clientHeight+2;
    const maxScroll=Math.max(0,host.scrollHeight-host.clientHeight);
    pane.classList.toggle('is-overflowing',overflow);
    pane.classList.toggle('is-at-start',!overflow||host.scrollTop<=2);
    pane.classList.toggle('is-at-end',!overflow||host.scrollTop>=maxScroll-2);
  }
'''
s = s[:idx] + overflow_fn + s[idx:]
s = s.replace("      host.innerHTML='<span class=\"kinojo-my-info-profile-empty\">연결된 캐릭터가 없습니다.</span>';\n      return;",
              "      host.innerHTML='<span class=\"kinojo-my-info-profile-empty\">연결된 캐릭터가 없습니다.</span>';\n      requestAnimationFrame(updateMyInfoProfileCharacterOverflow_);\n      return;")
old = "    }).join('');\n  }\n  function myInfoProfileImageState_(characterId){"
new = "    }).join('');\n    requestAnimationFrame(updateMyInfoProfileCharacterOverflow_);\n  }\n  function myInfoProfileImageState_(characterId){"
if old not in s: raise SystemExit('profile render tail not found')
s = s.replace(old,new,1)

modal_start = s.index('  function makeMyInfoModal(){')
modal_end = s.index('  async function openMyInfoModal(){', modal_start)
new_modal = r'''  function makeMyInfoModal(){
    const modal=document.createElement('section');
    modal.className='kinojo-my-info-modal';
    modal.id='kinojoMyInfoModal';
    modal.setAttribute('aria-hidden','true');
    modal.innerHTML=`
      <div class="kinojo-my-info-modal-backdrop" data-kinojo-my-info-modal-close></div>
      <div class="kinojo-my-info-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="kinojoMyInfoModalTitle" aria-describedby="kinojoMyInfoModalSummary" tabindex="-1">
        <button class="kinojo-my-info-modal-close" type="button" aria-label="내 정보 닫기" data-kinojo-my-info-modal-close>×</button>
        <div class="kinojo-my-info-manager">
          <header class="kinojo-my-info-manager-head">
            <span class="kinojo-my-info-manager-badge">MY INFO</span>
            <div class="kinojo-my-info-manager-headline"><strong id="kinojoMyInfoModalTitle">내 정보</strong><p id="kinojoMyInfoModalSummary">내 캐릭터의 프로필 이미지와 관리자 확인용 참고 이미지를 관리합니다.</p></div>
          </header>
          <section class="kinojo-my-info-profile-section" aria-labelledby="kinojoMyInfoProfileTitle">
            <div class="kinojo-my-info-manager-section-head">
              <div><strong id="kinojoMyInfoProfileTitle">프로필 이미지</strong><span>캐릭터별 개별 설정</span></div>
              <small>원본 JPEG · PNG · WebP / 결과 512×512 WebP</small>
            </div>
            <div class="kinojo-my-info-profile-layout">
              <div class="kinojo-my-info-profile-character-pane is-at-start is-at-end">
                <div class="kinojo-my-info-profile-characters" id="kinojoMyInfoProfileCharacters" aria-label="프로필 이미지를 관리할 캐릭터"><span class="kinojo-my-info-profile-empty">캐릭터 정보를 불러오는 중입니다.</span></div>
              </div>
              <div class="kinojo-my-info-profile-current-pane">
                <div class="kinojo-my-info-profile-actions">
                  <input id="kinojoMyInfoProfileFileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
                  <button class="kinojo-my-info-action-btn is-primary" id="kinojoMyInfoProfileSelectBtn" type="button" disabled>이미지 선택</button>
                  <button class="kinojo-my-info-action-btn" id="kinojoMyInfoProfileResetBtn" type="button" hidden>공식 이미지로 복원</button>
                  <button class="kinojo-my-info-action-btn" id="kinojoMyInfoProfileRetryBtn" type="button" hidden>이미지 다시 시도</button>
                  <button class="kinojo-my-info-action-btn is-primary" id="kinojoMyInfoProfileUploadBtn" type="button" hidden>업로드</button>
                  <button class="kinojo-my-info-action-btn" id="kinojoMyInfoProfileCancelBtn" type="button" hidden>선택 취소</button>
                </div>
                <div class="kinojo-my-info-profile-images">
                  <article class="kinojo-my-info-profile-card is-current">
                    <div class="kinojo-my-info-profile-image-frame"><img id="kinojoMyInfoProfileCurrentImage" alt="" hidden><span id="kinojoMyInfoProfileCurrentPlaceholder">현재 이미지</span></div>
                    <div class="kinojo-my-info-profile-card-copy"><small>현재 적용</small><strong id="kinojoMyInfoProfileCurrentSource">현재 이미지 확인 중</strong><span id="kinojoMyInfoProfileCurrentMeta">Server에서 현재 적용 이미지를 확인합니다.</span></div>
                  </article>
                  <article class="kinojo-my-info-profile-card is-candidate" id="kinojoMyInfoProfileCandidate" hidden>
                    <div class="kinojo-my-info-profile-image-frame"><img id="kinojoMyInfoProfileCandidateImage" alt="" hidden></div>
                    <div class="kinojo-my-info-profile-card-copy"><small>선택 미리보기</small><strong id="kinojoMyInfoProfileCandidateName">선택한 이미지</strong><span id="kinojoMyInfoProfileCandidateMeta"></span></div>
                  </article>
                </div>
                <div class="kinojo-my-info-profile-status" id="kinojoMyInfoProfileStatus" data-state="loading" role="status" aria-live="polite" aria-atomic="true">현재 프로필 이미지를 확인하는 중입니다.</div>
              </div>
            </div>
          </section>
          <section class="kinojo-my-info-reference-preview" id="kinojoMyInfoReferenceSection" aria-labelledby="kinojoMyInfoReferenceTitle" aria-disabled="true">
            <div class="kinojo-my-info-manager-section-head">
              <div><strong id="kinojoMyInfoReferenceTitle">참고 이미지</strong><span>관리자 확인용 비공개 자료</span></div>
              <small id="kinojoMyInfoReferenceHeadMeta">캐릭터 선택 후 슬롯 선택</small>
            </div>
            <input id="kinojoMyInfoReferenceFileInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
            <div class="kinojo-my-info-reference-preview-grid" id="kinojoMyInfoReferenceGrid" role="group" aria-labelledby="kinojoMyInfoReferenceTitle">
              ${KINOJO_REFERENCE_IMAGE_SLOTS.map(slot=>{const label=slot==='FRONT'?'정면':slot==='BACK'?'후면':'얼굴이 잘 보이는 상반신';return `<article class="kinojo-my-info-reference-slot" data-reference-slot="${slot}" aria-disabled="true"><div class="kinojo-my-info-reference-visual" data-reference-visual><img class="kinojo-my-info-reference-guide" data-reference-guide src="${KINOJO_REFERENCE_GUIDE_ASSETS[slot]}" alt="${label} 촬영 가이드"></div><div class="kinojo-my-info-reference-slot-copy"><b>${slot}</b><span>${label}</span><small data-reference-file-status>등록된 이미지 없음</small></div><div class="kinojo-my-info-reference-slot-actions"><button class="kinojo-my-info-action-btn" data-reference-select-slot="${slot}" type="button" disabled>이미지 업로드</button><button class="kinojo-my-info-action-btn is-primary" data-reference-upload-slot="${slot}" type="button" hidden>비공개 등록</button><button class="kinojo-my-info-action-btn" data-reference-cancel-slot="${slot}" type="button" hidden>편집 취소</button><button class="kinojo-my-info-action-btn is-danger" data-reference-delete-slot="${slot}" type="button" hidden>등록 삭제</button></div></article>`;}).join('')}
            </div>
            <div class="kinojo-my-info-reference-status" id="kinojoMyInfoReferenceStatus" data-state="info" role="status" aria-live="polite" aria-atomic="true">캐릭터를 선택하면 슬롯별 이미지를 고를 수 있습니다.</div>
          </section>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
'''
s = s[:modal_start] + new_modal + s[modal_end:]

bind_idx = s.index('  function bind(){')
click_fn = r'''  function replayMyInfoClickAnimation_(element){
    if(!(element instanceof HTMLElement))return;
    element.classList.remove('is-clicked');
    void element.offsetWidth;
    element.classList.add('is-clicked');
    window.setTimeout(()=>element.classList.remove('is-clicked'),220);
  }
'''
s = s[:bind_idx] + click_fn + s[bind_idx:]
s = s.replace("    q('#kinojoMyInfoBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openMyInfoPanel();});\n    q('#kinojoMyInfoMenuBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();openMyInfoModal().catch(()=>{});});",
"    q('#kinojoMyInfoBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();replayMyInfoClickAnimation_(e.currentTarget);openMyInfoPanel();});\n    q('#kinojoMyInfoMenuBtn')?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();replayMyInfoClickAnimation_(e.currentTarget);openMyInfoModal().catch(()=>{});});")
old_handlers = """      const referenceSlot=e.target.closest('[data-reference-slot]');
      if(referenceSlot){e.preventDefault();e.stopPropagation();selectMyInfoReferenceSlot_(referenceSlot.dataset.referenceSlot);return;}
"""
new_handlers = """      const referenceSelect=e.target.closest('[data-reference-select-slot]');
      if(referenceSelect){e.preventDefault();e.stopPropagation();selectMyInfoReferenceSlot_(referenceSelect.dataset.referenceSelectSlot);return;}
      const referenceUpload=e.target.closest('[data-reference-upload-slot]');
      if(referenceUpload){e.preventDefault();e.stopPropagation();uploadMyInfoReference_(referenceUpload.dataset.referenceUploadSlot).catch(()=>{});return;}
      const referenceCancel=e.target.closest('[data-reference-cancel-slot]');
      if(referenceCancel){e.preventDefault();e.stopPropagation();clearMyInfoReferencePreview_(referenceCancel.dataset.referenceCancelSlot,'편집 결과를 취소했습니다. 원본은 저장되거나 업로드되지 않았습니다.');return;}
      const referenceDelete=e.target.closest('[data-reference-delete-slot]');
      if(referenceDelete){e.preventDefault();e.stopPropagation();deleteMyInfoReference_(referenceDelete.dataset.referenceDeleteSlot).catch(()=>{});return;}
"""
if old_handlers not in s: raise SystemExit('reference handler block not found')
s = s.replace(old_handlers,new_handlers,1)
for line in [
"      if(e.target.closest('#kinojoMyInfoReferenceUploadBtn')){e.preventDefault();e.stopPropagation();uploadMyInfoReference_().catch(()=>{});return;}\n",
"      if(e.target.closest('#kinojoMyInfoReferenceCancelBtn')){e.preventDefault();e.stopPropagation();clearMyInfoReferencePreview_(kinojoMyReferencePickerState.activeSlot,'편집 결과를 취소했습니다. 원본은 저장되거나 업로드되지 않았습니다.');return;}\n",
"      if(e.target.closest('#kinojoMyInfoReferenceDeleteBtn')){e.preventDefault();e.stopPropagation();deleteMyInfoReference_().catch(()=>{});return;}\n",
]: s = s.replace(line,'')
needle = "    const referenceGrid=q('#kinojoMyInfoReferenceGrid');\n"
replacement = "    const profileCharacters=q('#kinojoMyInfoProfileCharacters');\n    profileCharacters?.addEventListener('scroll',updateMyInfoProfileCharacterOverflow_,{passive:true});\n    window.addEventListener('resize',updateMyInfoProfileCharacterOverflow_,{passive:true});\n    const referenceGrid=q('#kinojoMyInfoReferenceGrid');\n"
s = s.replace(needle,replacement,1)
common.write_text(s,encoding='utf-8')

css.write_text(css.read_text(encoding='utf-8')+(root/'tools/zz_member_append.css').read_text(encoding='utf-8'),encoding='utf-8')
print('member patch applied')
