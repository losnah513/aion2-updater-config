/*
 * KINOJO My Info edited-image upload boundary.
 * Reuses the completed member-profile Edge contracts; never accepts originals.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.KinojoMyInfoImageUpload=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const PROFILE_BUCKET='kinojo-member-profile';
  const REFERENCE_BUCKET='kinojo-member-reference';
  const SLOT_KEYS=Object.freeze(['PROFILE','FRONT','BACK','UPPER_BODY']);
  const SESSION_TOKEN=/^kws_[A-Za-z0-9_-]{40,80}$/;
  const MAX_BYTES=5*1024*1024;

  function text(value){return String(value??'').trim();}
  function positiveInteger(value){
    const number=Number(value);
    return Number.isInteger(number)&&number>0?number:0;
  }
  function slotKey(value,contract){
    const slot=text(value).toUpperCase();
    if(!SLOT_KEYS.includes(slot)||!contract?.slots?.[slot])throw new Error('EDITED_IMAGE_SLOT_INVALID');
    return slot;
  }
  function blobLike(value){
    return value&&typeof value==='object'&&Number.isFinite(Number(value.size))&&typeof value.type==='string';
  }
  function validateEditedOutput(result,contract){
    const slot=slotKey(result?.slot,contract);
    const definition=contract.slots[slot];
    const blob=result?.blob;
    if(!blobLike(blob)||Number(blob.size)<1||Number(blob.size)>MAX_BYTES)throw new Error('EDITED_IMAGE_SIZE_INVALID');
    if(text(blob.type).toLowerCase()!=='image/webp'||text(result?.mimeType).toLowerCase()!=='image/webp')throw new Error('EDITED_IMAGE_WEBP_REQUIRED');
    if(Number(result?.width)!==Number(definition.outputWidth)||Number(result?.height)!==Number(definition.outputHeight))throw new Error('EDITED_IMAGE_DIMENSIONS_INVALID');
    if(result?.outputReady!==true||result?.uploadConnected!==false||result?.originalUploaded!==false||result?.metadataStripped!==true)throw new Error('EDITED_IMAGE_BOUNDARY_INVALID');
    return Object.freeze({slot,definition,blob,mimeType:'image/webp',sizeBytes:Number(blob.size)});
  }
  function uploadPathPattern(characterId,slot){
    return slot==='PROFILE'
      ? new RegExp('^characters/'+characterId+'/[0-9a-f]{32}\\.webp$')
      : new RegExp('^characters/'+characterId+'/'+slot+'/[0-9a-f]{32}\\.webp$');
  }
  function validatePreparedUpload(prepared,context){
    const upload=prepared?.upload||null;
    const expectedBucket=context.slot==='PROFILE'?PROFILE_BUCKET:REFERENCE_BUCKET;
    const objectPath=text(upload?.objectPath);
    if(prepared?.ok!==true||upload?.bucket!==expectedBucket||upload?.upsert!==false||upload?.mimeType!=='image/webp'||Number(upload?.sizeBytes)!==context.sizeBytes||!uploadPathPattern(context.characterId,context.slot).test(objectPath)||!text(upload?.uploadUrl)){
      throw new Error('EDITED_IMAGE_UPLOAD_PREPARE_INVALID');
    }
    return Object.freeze({bucket:expectedBucket,objectPath,uploadUrl:text(upload.uploadUrl)});
  }
  function validateCompletedPixels(completed,context){
    const upload=completed?.upload||null;
    if(upload?.pixelVerified!==true||upload?.pixelContract!=='B3'||Number(upload?.pixelWidth)!==Number(context?.definition?.outputWidth)||Number(upload?.pixelHeight)!==Number(context?.definition?.outputHeight)){
      throw new Error('EDITED_IMAGE_SERVER_PIXELS_INVALID');
    }
    return true;
  }
  async function signedUpload(client,prepared,context){
    if(!client||typeof client.ensureConfig!=='function')throw new Error('EDITED_IMAGE_UPLOAD_CLIENT_NOT_READY');
    const cfg=await client.ensureConfig();
    const target=new URL(prepared.uploadUrl);
    const expected=new URL(text(cfg?.url));
    const prefix='/storage/v1/object/upload/sign/'+prepared.bucket+'/';
    if(target.origin!==expected.origin||!target.pathname.startsWith(prefix)||!target.searchParams.get('token'))throw new Error('EDITED_IMAGE_UPLOAD_URL_INVALID');
    const publishableKey=text(cfg?.publishableKey);
    if(!publishableKey)throw new Error('EDITED_IMAGE_PUBLISHABLE_KEY_REQUIRED');
    const body=new FormData();
    body.append('cacheControl','3600');
    body.append('',context.blob,'kinojo-'+context.slot.toLowerCase().replace(/_/g,'-')+'.webp');
    const response=await fetch(target.toString(),{
      method:'PUT',
      headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey,'x-upsert':'false'},
      body
    });
    if(response.ok)return true;
    let message='';
    try{
      const raw=await response.text();
      if(raw){try{const data=JSON.parse(raw);message=text(data?.message||data?.error||raw);}catch(_error){message=raw;}}
    }catch(_error){}
    throw new Error(message||('EDITED_IMAGE_STORAGE_HTTP_'+response.status));
  }
  function requireClient(client){
    if(!client||typeof client.invokeEdgeFunction!=='function')throw new Error('EDITED_IMAGE_EDGE_CLIENT_NOT_READY');
    return client;
  }
  function requestContext(options){
    const contract=options?.contract||root?.KinojoMyInfoImageContract;
    const edited=validateEditedOutput(options?.result,contract);
    const characterId=positiveInteger(options?.characterId);
    const sessionToken=text(options?.sessionToken);
    if(!characterId)throw new Error('EDITED_IMAGE_CHARACTER_REQUIRED');
    if(!SESSION_TOKEN.test(sessionToken))throw new Error('EDITED_IMAGE_SESSION_INVALID');
    return Object.freeze({...edited,characterId,sessionToken,contract});
  }
  async function referenceState(options){
    const client=requireClient(options?.client);
    const characterId=positiveInteger(options?.characterId);
    const sessionToken=text(options?.sessionToken);
    if(!characterId||!SESSION_TOKEN.test(sessionToken))throw new Error('REFERENCE_STATE_CONTEXT_INVALID');
    const state=await client.invokeEdgeFunction('kinojo-member-profile',{action:'reference-state',sessionToken,characterId});
    if(state?.ok!==true||Number(state?.characterId)!==characterId||!Array.isArray(state?.references))throw new Error('REFERENCE_STATE_INVALID');
    return state;
  }
  async function uploadEdited(options={}){
    const client=requireClient(options.client);
    const context=requestContext(options);
    if(context.slot!=='PROFILE')throw new Error('REFERENCE_DIRECT_UPLOAD_REMOVED_USE_IMAGE_REQUEST');
    const latest=await client.invokeEdgeFunction('kinojo-member-profile',{action:'profile-bootstrap',sessionToken:context.sessionToken,characterId:context.characterId});
    if(latest?.ok!==true||Number(latest?.character?.characterId)!==context.characterId)throw new Error('PROFILE_BOOTSTRAP_INVALID');
    const replacing=latest.profile?.hasOverride===true;
    const prepareAction='profile-upload-prepare';
    const prepareBody={action:prepareAction,sessionToken:context.sessionToken,characterId:context.characterId,mimeType:context.mimeType,sizeBytes:context.sizeBytes};
    const preparedResponse=await client.invokeEdgeFunction('kinojo-member-profile',prepareBody);
    const prepared=validatePreparedUpload(preparedResponse,context);
    await signedUpload(client,prepared,context);
    const completeAction=replacing?'profile-upload-replace-complete':'profile-upload-complete';
    const completeBody={action:completeAction,sessionToken:context.sessionToken,characterId:context.characterId,objectPath:prepared.objectPath,mimeType:context.mimeType,sizeBytes:context.sizeBytes};
    const completed=await client.invokeEdgeFunction('kinojo-member-profile',completeBody);
    if(completed?.ok!==true||completed?.upload?.activated!==true||text(completed?.upload?.objectPath)!==prepared.objectPath)throw new Error('EDITED_IMAGE_UPLOAD_COMPLETE_INVALID');
    validateCompletedPixels(completed,context);
    if(Number(completed?.character?.characterId)!==context.characterId||completed?.profile?.hasOverride!==true)throw new Error('PROFILE_UPLOAD_RESULT_INVALID');
    if(replacing&&(completed?.replacement?.replaced!==true||text(completed?.replacement?.newObjectPath)!==prepared.objectPath))throw new Error('PROFILE_REPLACEMENT_RESULT_INVALID');
    return Object.freeze({ok:true,slot:context.slot,characterId:context.characterId,replacing,uploadConnected:true,originalUploaded:false,response:completed});
  }
  async function deleteReference(options={}){
    const client=requireClient(options.client);
    const characterId=positiveInteger(options.characterId);
    const sessionToken=text(options.sessionToken);
    const slot=slotKey(options.slot,options.contract||root?.KinojoMyInfoImageContract);
    if(slot==='PROFILE'||!characterId||!SESSION_TOKEN.test(sessionToken))throw new Error('REFERENCE_DELETE_CONTEXT_INVALID');
    const deleted=await client.invokeEdgeFunction('kinojo-member-profile',{action:'reference-delete',sessionToken,characterId,slot});
    if(deleted?.ok!==true||Number(deleted?.characterId)!==characterId||deleted?.deleted?.slot!==slot||deleted?.deleted?.deleted!==true||deleted?.deleted?.storageObjectDeleted!==true||deleted?.deleted?.metadataDeleted!==true)throw new Error('REFERENCE_DELETE_RESULT_INVALID');
    return deleted;
  }

  return Object.freeze({validateEditedOutput,validatePreparedUpload,validateCompletedPixels,referenceState,uploadEdited,deleteReference,constants:Object.freeze({PROFILE_BUCKET,REFERENCE_BUCKET,SLOT_KEYS,MAX_BYTES})});
});
