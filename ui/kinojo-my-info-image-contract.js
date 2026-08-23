(function(root,factory){
  const contract=factory();
  if(typeof module==='object'&&module.exports)module.exports=contract;
  if(root)root.KinojoMyInfoImageContract=contract;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  function deepFreeze(value){
    if(!value||typeof value!=='object'||Object.isFrozen(value))return value;
    Object.keys(value).forEach(key=>deepFreeze(value[key]));
    return Object.freeze(value);
  }

  const sharedInput=deepFreeze({
    acceptedMimeTypes:['image/jpeg','image/png','image/webp'],
    maxBytes:5*1024*1024
  });
  const sharedOutput=deepFreeze({
    mimeType:'image/webp',
    extension:'webp',
    quality:0.90,
    uploadOriginal:false,
    stripMetadata:true,
    qualityWarning:{
      cautionBelowSourcePixelsPerOutputPixel:1,
      lowBelowSourcePixelsPerOutputPixel:0.75,
      blocksExport:false
    }
  });
  const commonCaptureNotice='캐릭터 위에 겹친 채팅창·스킬 버튼 등은 편집으로 제거할 수 없습니다. 가능하면 HUD를 숨기거나 캐릭터와 겹치지 않게 촬영해 주세요.';

  const slots=deepFreeze({
    PROFILE:{
      slot:'PROFILE',
      label:'프로필',
      guideAssetPath:null,
      outputWidth:512,
      outputHeight:512,
      aspectWidth:1,
      aspectHeight:1,
      visibility:'PUBLIC_PROFILE_OVERRIDE',
      retentionDays:null,
      preAttachGuide:'얼굴과 캐릭터 특징이 정사각형 안에서 잘 보이게 촬영해 주세요.'
    },
    FRONT:{
      slot:'FRONT',
      label:'전신 정면',
      guideAssetPath:'/assets/images/my-info/guides/front-2x3.png?v=20260823',
      outputWidth:800,
      outputHeight:1200,
      aspectWidth:2,
      aspectHeight:3,
      visibility:'PRIVATE_REFERENCE',
      retentionDays:7,
      preAttachGuide:'머리·양손·발끝까지 모두 포함해 주세요.'
    },
    BACK:{
      slot:'BACK',
      label:'전신 후면',
      guideAssetPath:'/assets/images/my-info/guides/back-2x3.png?v=20260823',
      outputWidth:800,
      outputHeight:1200,
      aspectWidth:2,
      aspectHeight:3,
      visibility:'PRIVATE_REFERENCE',
      retentionDays:7,
      preAttachGuide:'머리카락·의상 후면·뒤꿈치까지 모두 포함해 주세요.'
    },
    UPPER_BODY:{
      slot:'UPPER_BODY',
      label:'상반신',
      guideAssetPath:'/assets/images/my-info/guides/upper-body-4x5.png?v=20260823',
      outputWidth:800,
      outputHeight:1000,
      aspectWidth:4,
      aspectHeight:5,
      visibility:'PRIVATE_REFERENCE',
      retentionDays:7,
      preAttachGuide:'머리 전체부터 허리선까지, 양어깨를 포함해 주세요.'
    }
  });

  return deepFreeze({
    contractVersion:'2026-08-23.1',
    status:'FOLLOWUP_TARGET',
    input:sharedInput,
    output:sharedOutput,
    commonCaptureNotice,
    slots,
    slotOrder:['PROFILE','FRONT','BACK','UPPER_BODY'],
    referenceSlotOrder:['FRONT','BACK','UPPER_BODY']
  });
});
