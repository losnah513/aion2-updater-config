from pathlib import Path
root=Path(__file__).resolve().parents[1]
admin_js=root/'admin/js/admin-members.js'
admin_css=root/'admin/css/admin.css'

aj = admin_js.read_text(encoding='utf-8')
aj = aj.replace('  let memberImagePreviewRequestId=0;\n', '  let memberImagePreviewRequestId=0;\n  let memberImageModalData=null;\n  let selectedMemberImageCharacterId=0;\n')
start = aj.index('  function renderMemberImageGroups_(data){')
end = aj.index('  function clearAdminImagePreview_(){', start)
new_admin_render = r'''  function defaultMemberImageCharacterId_(characters){
    const list=Array.isArray(characters)?characters:[];
    const preferred=list.find(character=>character?.isMain===true)||list[0]||null;
    const id=Number(preferred?.characterId||0);
    return Number.isInteger(id)&&id>0?id:0;
  }

  function renderMemberImageCharacterSelector_(characters,selectedId){
    return '<div class="admin-member-image-character-selector" role="listbox" aria-label="이미지를 확인할 캐릭터">'+characters.map(character=>{
      const id=Number(character?.characterId||0);
      const selected=id===Number(selectedId||0);
      const name=esc(character?.characterName||'이름 없음');
      const server=esc(character?.serverName||'-');
      const className=esc(character?.className||'-');
      return '<button class="admin-member-image-character-btn '+(selected?'is-selected':'')+'" data-admin-image-character-select="'+id+'" type="button" role="option" aria-selected="'+(selected?'true':'false')+'"><span><strong>'+name+'</strong><small>'+server+' · '+className+'</small></span><em class="admin-pill '+(character?.isMain===true?'info':'')+'">'+(character?.isMain===true?'본캐':'부캐')+'</em></button>';
    }).join('')+'</div>';
  }

  function renderMemberImageGroups_(data,selectedCharacterId=selectedMemberImageCharacterId){
    const characters=Array.isArray(data?.characters)?data.characters:[];
    if(!characters.length){
      const reason=data?.ownerResolved===false?'회원 소유 캐릭터를 확정하지 못했습니다.':'등록된 보유 캐릭터가 없습니다.';
      return '<div class="admin-empty">'+esc(reason)+'</div>';
    }
    const selectedId=characters.some(character=>Number(character?.characterId||0)===Number(selectedCharacterId||0))?Number(selectedCharacterId):defaultMemberImageCharacterId_(characters);
    const selected=characters.find(character=>Number(character?.characterId||0)===selectedId)||characters[0];
    const summary='<div class="admin-statusline ok">캐릭터 '+characters.length+'명 · 사용자 프로필 '+Number(data?.profileOverrideCount||0)+'건 · 활성 참고 이미지 '+Number(data?.referenceCount||0)+'건</div>';
    const selector='<section class="admin-member-image-selector-wrap"><div class="admin-member-image-selector-head"><strong>캐릭터 선택</strong><span>한 캐릭터씩 이미지 상태를 확인합니다.</span></div>'+renderMemberImageCharacterSelector_(characters,selectedId)+'</section>';
    const preview='<section class="admin-card" id="adminMemberImagePreview" hidden aria-live="polite"></section>';
    const detail='<div class="admin-member-image-detail" data-admin-member-image-detail>'+renderAdminCharacterImageGroup_(selected)+'</div>';
    return summary+selector+preview+detail;
  }

  function selectMemberImageCharacter_(characterId){
    const id=Number(characterId||0);
    const characters=Array.isArray(memberImageModalData?.characters)?memberImageModalData.characters:[];
    const selected=characters.find(character=>Number(character?.characterId||0)===id)||null;
    if(!selected)return false;
    selectedMemberImageCharacterId=id;
    clearAdminImagePreview_();
    const modal=$('#adminMemberImageModal');
    if(!modal?.classList.contains('active'))return false;
    modal.querySelectorAll('[data-admin-image-character-select]').forEach(button=>{
      const active=Number(button.dataset.adminImageCharacterSelect||0)===id;
      button.classList.toggle('is-selected',active);
      button.setAttribute('aria-selected',active?'true':'false');
    });
    const detail=$('[data-admin-member-image-detail]',modal);
    if(detail)detail.innerHTML=renderAdminCharacterImageGroup_(selected);
    return true;
  }

'''
aj = aj[:start] + new_admin_render + aj[end:]
# load data state
old = "    if(String(data?.privacy||'')!=='NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS')throw new Error('ADMIN_MEMBER_IMAGE_PRIVACY_CONTRACT_MISMATCH');\n    if(body)body.innerHTML=renderMemberImageGroups_(data);\n    return data;"
new = "    if(String(data?.privacy||'')!=='NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS')throw new Error('ADMIN_MEMBER_IMAGE_PRIVACY_CONTRACT_MISMATCH');\n    memberImageModalData=data;\n    selectedMemberImageCharacterId=defaultMemberImageCharacterId_(data.characters);\n    if(body)body.innerHTML=renderMemberImageGroups_(data,selectedMemberImageCharacterId);\n    return data;"
if old not in aj: raise SystemExit('admin load block not found')
aj = aj.replace(old,new,1)
# delegated click replace single-line event listener
old_line = "    modal?.addEventListener('click',event=>{const close=event.target.closest('[data-member-image-modal-close]');if(close){closeMemberImageModal();return;}const previewClose=event.target.closest('[data-admin-image-preview-close]');if(previewClose){clearAdminImagePreview_();return;}const preview=event.target.closest('[data-admin-image-preview]');if(preview)showAdminImagePreview_(preview).catch(error=>{const host=$('#adminMemberImagePreview',modal);if(host){host.hidden=false;host.innerHTML='<div class=\"admin-callout error\"><strong>미리보기를 열지 못했습니다.</strong><span>'+esc(error?.message||error)+'</span></div>';}});});"
new_line = "    modal?.addEventListener('click',event=>{const close=event.target.closest('[data-member-image-modal-close]');if(close){closeMemberImageModal();return;}const selector=event.target.closest('[data-admin-image-character-select]');if(selector){selectMemberImageCharacter_(selector.dataset.adminImageCharacterSelect);return;}const previewClose=event.target.closest('[data-admin-image-preview-close]');if(previewClose){clearAdminImagePreview_();return;}const preview=event.target.closest('[data-admin-image-preview]');if(preview)showAdminImagePreview_(preview).catch(error=>{const host=$('#adminMemberImagePreview',modal);if(host){host.hidden=false;host.innerHTML='<div class=\"admin-callout error\"><strong>미리보기를 열지 못했습니다.</strong><span>'+esc(error?.message||error)+'</span></div>';}});});"
if old_line not in aj: raise SystemExit('admin modal click line not found')
aj = aj.replace(old_line,new_line,1)
# close/open state + body class
aj = aj.replace("  function closeMemberImageModal(){\n    clearAdminImagePreview_();\n    memberImageModalRequestId+=1;",
                "  function closeMemberImageModal(){\n    clearAdminImagePreview_();\n    memberImageModalRequestId+=1;\n    memberImageModalData=null;\n    selectedMemberImageCharacterId=0;\n    document.body.classList.remove('admin-member-image-modal-open');")
aj = aj.replace("    const requestId=++memberImageModalRequestId;\n    modal.dataset.memberId=memberId;",
                "    const requestId=++memberImageModalRequestId;\n    memberImageModalData=null;\n    selectedMemberImageCharacterId=0;\n    modal.dataset.memberId=memberId;")
aj = aj.replace("    modal.setAttribute('aria-hidden','false');\n    modal.classList.add('active');",
                "    modal.setAttribute('aria-hidden','false');\n    modal.classList.add('active');\n    document.body.classList.add('admin-member-image-modal-open');",1)
# export helper
aj = aj.replace('memberImageSessionToken_,renderMemberImageGroups_,loadMemberImageGroups_', 'memberImageSessionToken_,renderMemberImageGroups_,selectMemberImageCharacter_,loadMemberImageGroups_')
admin_js.write_text(aj,encoding='utf-8')


admin_css.write_text(admin_css.read_text(encoding='utf-8')+(root/'tools/zz_admin_append.css').read_text(encoding='utf-8'),encoding='utf-8')
print('admin patch applied')
