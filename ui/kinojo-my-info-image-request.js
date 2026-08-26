/*
 * KINOJO My Info member image-production request client.
 * Keeps edited WebP files local until one explicit 1-3 image submission.
 */
(function(root,factory){
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.KinojoMyInfoImageRequest=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(root){
  'use strict';

  const EDGE_NAME='kinojo-member-profile';
  const REFERENCE_BUCKET='kinojo-member-reference';
  const SESSION_TOKEN=/^kws_[A-Za-z0-9_-]{40,80}$/;
  const IDEMPOTENCY_KEY=/^[A-Za-z0-9_-]{24,80}$/;
  const SLOT_KEYS=Object.freeze(['FRONT','BACK','UPPER_BODY']);
  const STYLE_CODES=Object.freeze(['SHONEN_MANGA','ROMANCE_MANGA','ANIMATION','REALISTIC','CUSTOM']);
  const MAX_NOTE_LENGTH=300;
  const PREPARE_CONTRACT='member-image-request-prepare-api-v1';
  const FINALIZE_CONTRACT='member-image-request-finalize-api-v1';
  const STATE_CONTRACT='member-image-request-state-api-v1';

  function text(value){return String(value??'').trim();}
  function positiveInteger(value){const number=Number(value);return Number.isInteger(number)&&number>0?number:0;}
  function record(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:null;}
  function requireClient(client){
    if(!client||typeof client.invokeEdgeFunction!=='function')throw new Error('IMAGE_REQUEST_EDGE_CLIENT_NOT_READY');
    return client;
  }
  function createIdempotencyKey(){
    const cryptoApi=root?.crypto;
    if(typeof cryptoApi?.randomUUID==='function')return cryptoApi.randomUUID().replace(/-/g,'');
    if(typeof cryptoApi?.getRandomValues==='function'){
      const bytes=new Uint8Array(24);
      cryptoApi.getRandomValues(bytes);
      return Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
    }
    return (Date.now().toString(36)+Math.random().toString(36).slice(2)+Math.random().toString(36).slice(2)).padEnd(32,'0').slice(0,48);
  }
  function normalizeStyle(value){
    const style=text(value).toUpperCase();
    if(!style)return null;
    if(!STYLE_CODES.includes(style))throw new Error('REQUEST_STYLE_INVALID');
    return style;
  }
  function normalizeNote(value,styleCode){
    const note=text(value);
    if(note.length>MAX_NOTE_LENGTH)throw new Error('REQUEST_NOTE_TOO_LONG');
    if(styleCode==='CUSTOM'&&!note)throw new Error('REQUEST_CUSTOM_NOTE_REQUIRED');
    return note;
  }
  function validateContext(options={}){
    const client=requireClient(options.client);
    const characterId=positiveInteger(options.characterId);
    const sessionToken=text(options.sessionToken);
    if(!characterId)throw new Error('REQUEST_CHARACTER_REQUIRED');
    if(!SESSION_TOKEN.test(sessionToken))throw new Error('REQUEST_SESSION_INVALID');
    const styleCode=normalizeStyle(options.styleCode);
    const requestNote=normalizeNote(options.requestNote,styleCode);
    const uploadApi=options.uploadApi||root?.KinojoMyInfoImageUpload;
    const contract=options.contract||root?.KinojoMyInfoImageContract;
    if(!uploadApi||typeof uploadApi.validateEditedOutput!=='function'||!contract)throw new Error('REQUEST_IMAGE_CONTRACT_NOT_READY');
    const rows=Array.isArray(options.results)?options.results:[];
    if(rows.length<1||rows.length>3)throw new Error('REQUEST_IMAGE_COUNT_INVALID');
    const seen=new Set();
    const items=rows.map(result=>{
      const item=uploadApi.validateEditedOutput(result,contract);
      if(!SLOT_KEYS.includes(item.slot)||seen.has(item.slot))throw new Error(seen.has(item.slot)?'REQUEST_SLOT_DUPLICATE':'REQUEST_SLOT_INVALID');
      seen.add(item.slot);
      return Object.freeze({slot:item.slot,mimeType:item.mimeType,sizeBytes:item.sizeBytes,blob:item.blob});
    }).sort((a,b)=>SLOT_KEYS.indexOf(a.slot)-SLOT_KEYS.indexOf(b.slot));
    const fingerprint=JSON.stringify({characterId,styleCode,requestNote,items:items.map(({slot,mimeType,sizeBytes})=>({slot,mimeType,sizeBytes}))});
    return Object.freeze({client,characterId,sessionToken,styleCode,requestNote,items,fingerprint});
  }
  function assertNoPrivatePath(value){
    if(Array.isArray(value)){value.forEach(assertNoPrivatePath);return;}
    const source=record(value);
    if(!source)return;
    for(const [key,nested] of Object.entries(source)){
      if(key==='objectPath'||key==='object_path'||key==='bucket'||key==='bucketId'||key==='bucket_id')throw new Error('IMAGE_REQUEST_PRIVATE_PATH_EXPOSED');
      assertNoPrivatePath(nested);
    }
  }
  function normalizeRequest(value,context){
    const request=record(value);
    const requestId=positiveInteger(request?.requestId);
    const status=text(request?.status);
    const slots=Array.isArray(request?.slots)?request.slots.map(text):[];
    if(!requestId||!['DRAFT','SUBMITTED'].includes(status)||slots.length!==context.items.length||slots.some((slot,index)=>slot!==context.items[index].slot))throw new Error('IMAGE_REQUEST_RESULT_INVALID');
    if((request.styleCode??null)!==(context.styleCode??null)||text(request.requestNote)!==context.requestNote)throw new Error('IMAGE_REQUEST_RESULT_BINDING_MISMATCH');
    return Object.freeze({
      requestId,status,styleCode:request.styleCode??null,requestNote:text(request.requestNote),slots:Object.freeze([...slots]),
      submittedAt:text(request.submittedAt)||null,imageExpiresAt:text(request.imageExpiresAt),metadataExpiresAt:text(request.metadataExpiresAt),draftExpiresAt:text(request.draftExpiresAt)||null
    });
  }
  function validatePrepared(value,context){
    const data=record(value);
    assertNoPrivatePath(data);
    if(!data||data.ok!==true||text(data.contract)!==PREPARE_CONTRACT||Number(data.characterId)!==context.characterId)throw new Error('IMAGE_REQUEST_PREPARE_INVALID');
    const request=normalizeRequest(data.request,context);
    const rows=Array.isArray(data.uploads)?data.uploads:[];
    if(request.status==='SUBMITTED'){
      if(rows.length!==0)throw new Error('IMAGE_REQUEST_IDEMPOTENT_UPLOADS_INVALID');
      return Object.freeze({request,uploads:Object.freeze([]),submitted:true});
    }
    if(rows.length!==context.items.length)throw new Error('IMAGE_REQUEST_PREPARE_COUNT_MISMATCH');
    const uploads=rows.map((value,index)=>{
      const upload=record(value);
      const item=context.items[index];
      const slot=text(upload?.slot);
      if(!upload||slot!==item.slot||text(upload.mimeType).toLowerCase()!==item.mimeType||Number(upload.sizeBytes)!==item.sizeBytes||upload.upsert!==false||!text(upload.uploadUrl))throw new Error('IMAGE_REQUEST_UPLOAD_BINDING_MISMATCH');
      return Object.freeze({slot,uploadUrl:text(upload.uploadUrl),mimeType:item.mimeType,sizeBytes:item.sizeBytes});
    });
    return Object.freeze({request,uploads:Object.freeze(uploads),submitted:false});
  }
  function validateFinalized(value,context,requestId){
    const data=record(value);
    assertNoPrivatePath(data);
    if(!data||data.ok!==true||text(data.contract)!==FINALIZE_CONTRACT||Number(data.characterId)!==context.characterId)throw new Error('IMAGE_REQUEST_FINALIZE_INVALID');
    const request=normalizeRequest(data.request,context);
    if(request.requestId!==requestId||request.status!=='SUBMITTED')throw new Error('IMAGE_REQUEST_FINALIZE_BINDING_MISMATCH');
    return Object.freeze({ok:true,characterId:context.characterId,request,privacy:text(data.privacy)});
  }
  async function signedUpload(client,upload,item){
    if(typeof client.ensureConfig!=='function')throw new Error('IMAGE_REQUEST_UPLOAD_CLIENT_NOT_READY');
    const cfg=await client.ensureConfig();
    const target=new URL(upload.uploadUrl);
    const expected=new URL(text(cfg?.url));
    const prefix='/storage/v1/object/upload/sign/'+REFERENCE_BUCKET+'/';
    if(target.origin!==expected.origin||!target.pathname.startsWith(prefix)||!target.searchParams.get('token'))throw new Error('IMAGE_REQUEST_UPLOAD_URL_INVALID');
    const publishableKey=text(cfg?.publishableKey);
    if(!publishableKey)throw new Error('IMAGE_REQUEST_PUBLISHABLE_KEY_REQUIRED');
    const body=new FormData();
    body.append('cacheControl','3600');
    body.append('',item.blob,'kinojo-'+item.slot.toLowerCase().replace(/_/g,'-')+'.webp');
    const response=await fetch(target.toString(),{method:'PUT',headers:{apikey:publishableKey,Authorization:'Bearer '+publishableKey,'x-upsert':'false'},body});
    if(response.ok)return true;
    let message='';
    try{const raw=await response.text();if(raw){try{const data=JSON.parse(raw);message=text(data?.message||data?.error||raw);}catch(_error){message=raw;}}}catch(_error){}
    throw new Error(message||('IMAGE_REQUEST_STORAGE_HTTP_'+response.status));
  }
  function cloneResume(value){
    if(!value)return null;
    return Object.freeze({
      fingerprint:text(value.fingerprint),idempotencyKey:text(value.idempotencyKey),requestId:positiveInteger(value.requestId),
      uploadedSlots:Object.freeze([...(value.uploadedSlots||[])])
    });
  }
  function attachResume(error,attempt){
    const normalized=error instanceof Error?error:new Error(text(error)||'IMAGE_REQUEST_SUBMIT_FAILED');
    normalized.resume=cloneResume(attempt);
    return normalized;
  }
  async function submit(options={}){
    const context=validateContext(options);
    const prior=record(options.resume);
    const reusable=prior&&text(prior.fingerprint)===context.fingerprint&&IDEMPOTENCY_KEY.test(text(prior.idempotencyKey));
    const attempt={
      fingerprint:context.fingerprint,
      idempotencyKey:reusable?text(prior.idempotencyKey):text(options.idempotencyKey)||createIdempotencyKey(),
      requestId:reusable?positiveInteger(prior.requestId):0,
      prepared:null,
      uploadedSlots:new Set(reusable&&Array.isArray(prior.uploadedSlots)?prior.uploadedSlots.filter(slot=>SLOT_KEYS.includes(slot)):[])
    };
    if(!IDEMPOTENCY_KEY.test(attempt.idempotencyKey))throw new Error('REQUEST_IDEMPOTENCY_KEY_INVALID');
    const progress=typeof options.onProgress==='function'?options.onProgress:()=>{};
    const snapshot=()=>cloneResume({...attempt,uploadedSlots:[...attempt.uploadedSlots]});
    try{
      progress({stage:'preparing',completed:attempt.uploadedSlots.size,total:context.items.length,resume:snapshot()});
      const preparedResponse=await context.client.invokeEdgeFunction(EDGE_NAME,{
        action:'image-request-prepare',sessionToken:context.sessionToken,characterId:context.characterId,idempotencyKey:attempt.idempotencyKey,
        styleCode:context.styleCode,requestNote:context.requestNote,items:context.items.map(({slot,mimeType,sizeBytes})=>({slot,mimeType,sizeBytes}))
      });
      attempt.prepared=validatePrepared(preparedResponse,context);
      if(attempt.requestId&&attempt.requestId!==attempt.prepared.request.requestId)throw new Error('IMAGE_REQUEST_RESUME_BINDING_MISMATCH');
      attempt.requestId=attempt.prepared.request.requestId;
      if(attempt.prepared.submitted){
        progress({stage:'complete',completed:context.items.length,total:context.items.length,resume:snapshot()});
        return Object.freeze({ok:true,characterId:context.characterId,request:attempt.prepared.request,resume:snapshot(),idempotent:true});
      }
      if(attempt.requestId!==attempt.prepared.request.requestId)throw new Error('IMAGE_REQUEST_RESUME_BINDING_MISMATCH');
      const uploadFile=typeof options.uploadFile==='function'?options.uploadFile:signedUpload;
      for(const upload of attempt.prepared.uploads){
        if(attempt.uploadedSlots.has(upload.slot))continue;
        const item=context.items.find(row=>row.slot===upload.slot);
        if(!item)throw new Error('IMAGE_REQUEST_UPLOAD_ITEM_MISSING');
        progress({stage:'uploading',slot:upload.slot,completed:attempt.uploadedSlots.size,total:context.items.length,resume:snapshot()});
        await uploadFile(context.client,upload,item);
        attempt.uploadedSlots.add(upload.slot);
        progress({stage:'uploaded',slot:upload.slot,completed:attempt.uploadedSlots.size,total:context.items.length,resume:snapshot()});
      }
      progress({stage:'finalizing',completed:attempt.uploadedSlots.size,total:context.items.length,resume:snapshot()});
      const finalizedResponse=await context.client.invokeEdgeFunction(EDGE_NAME,{action:'image-request-finalize',sessionToken:context.sessionToken,requestId:attempt.requestId,idempotencyKey:attempt.idempotencyKey});
      const finalized=validateFinalized(finalizedResponse,context,attempt.requestId);
      progress({stage:'complete',completed:context.items.length,total:context.items.length,resume:snapshot()});
      return Object.freeze({...finalized,resume:snapshot(),idempotent:false});
    }catch(error){
      const failedSlot=text(error?.slot||error?.data?.slot);
      if(SLOT_KEYS.includes(failedSlot))attempt.uploadedSlots.delete(failedSlot);
      throw attachResume(error,attempt);
    }
  }
  async function state(options={}){
    const client=requireClient(options.client);
    const characterId=positiveInteger(options.characterId);
    const sessionToken=text(options.sessionToken);
    if(!characterId||!SESSION_TOKEN.test(sessionToken))throw new Error('IMAGE_REQUEST_STATE_CONTEXT_INVALID');
    const data=await client.invokeEdgeFunction(EDGE_NAME,{action:'image-request-state',sessionToken,characterId});
    assertNoPrivatePath(data);
    if(data?.ok!==true||text(data.contract)!==STATE_CONTRACT||Number(data.characterId)!==characterId||!Array.isArray(data.requests)||Number(data.requestCount)!==data.requests.length)throw new Error('IMAGE_REQUEST_STATE_INVALID');
    const requests=data.requests.map(request=>{
      const slots=Array.isArray(request?.slots)?request.slots.map(text):[];
      if(!positiveInteger(request?.requestId)||!['DRAFT','SUBMITTED'].includes(text(request?.status))||slots.length<1||slots.length>3||slots.some((slot,index)=>!SLOT_KEYS.includes(slot)||slots.indexOf(slot)!==index))throw new Error('IMAGE_REQUEST_STATE_ITEM_INVALID');
      const styleCode=request.styleCode===null?null:normalizeStyle(request.styleCode);
      const requestNote=normalizeNote(request.requestNote,styleCode);
      return Object.freeze({requestId:Number(request.requestId),status:text(request.status),styleCode,requestNote,submittedAt:text(request.submittedAt)||null,imageExpiresAt:text(request.imageExpiresAt),metadataExpiresAt:text(request.metadataExpiresAt),slots:Object.freeze(slots)});
    });
    return Object.freeze({ok:true,characterId,imageRetentionDays:Number(data.imageRetentionDays)||7,metadataRetentionDays:Number(data.metadataRetentionDays)||30,requestCount:requests.length,requests:Object.freeze(requests)});
  }

  return Object.freeze({
    submit,state,validateContext,validatePrepared,validateFinalized,createIdempotencyKey,
    constants:Object.freeze({EDGE_NAME,REFERENCE_BUCKET,SLOT_KEYS,STYLE_CODES,MAX_NOTE_LENGTH,PREPARE_CONTRACT,FINALIZE_CONTRACT,STATE_CONTRACT})
  });
});
