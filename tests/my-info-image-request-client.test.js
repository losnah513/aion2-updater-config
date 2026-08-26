'use strict';

const assert=require('node:assert/strict');
const contract=require('../ui/kinojo-my-info-image-contract.js');
const uploadApi=require('../ui/kinojo-my-info-image-upload.js');
const requestApi=require('../ui/kinojo-my-info-image-request.js');

const token='kws_'+('R'.repeat(44));
const result=(slot,size=12000)=>({
  slot,blob:{size,type:'image/webp'},mimeType:'image/webp',width:800,height:slot==='UPPER_BODY'?1000:1200,
  outputReady:true,uploadConnected:false,originalUploaded:false,metadataStripped:true
});
const request=(requestId,status,styleCode,note,slots)=>({
  requestId,status,styleCode,requestNote:note,submittedAt:status==='SUBMITTED'?'2026-08-26T05:00:00Z':null,
  imageExpiresAt:'2026-09-02T05:00:00Z',metadataExpiresAt:'2026-09-25T05:00:00Z',slots
});

assert.deepEqual(requestApi.constants.STYLE_CODES,['SHONEN_MANGA','ROMANCE_MANGA','ANIMATION','REALISTIC','CUSTOM']);
assert.equal(requestApi.constants.MAX_NOTE_LENGTH,300);
assert.match(requestApi.createIdempotencyKey(),/^[A-Za-z0-9_-]{24,80}$/);
assert.throws(()=>requestApi.validateContext({client:{invokeEdgeFunction(){}},sessionToken:token,characterId:41,results:[],contract,uploadApi}),/REQUEST_IMAGE_COUNT_INVALID/);
assert.throws(()=>requestApi.validateContext({client:{invokeEdgeFunction(){}},sessionToken:token,characterId:41,styleCode:'CUSTOM',requestNote:'',results:[result('FRONT')],contract,uploadApi}),/REQUEST_CUSTOM_NOTE_REQUIRED/);

(async()=>{
  const calls=[];
  let prepareCount=0;
  const client={async invokeEdgeFunction(_name,body){
    calls.push(body);
    if(body.action==='image-request-prepare'){
      prepareCount+=1;
      return {ok:true,contract:'member-image-request-prepare-api-v1',characterId:41,privacy:'SIGNED_UPLOAD_URL_ONLY_NO_OBJECT_PATH_FIELD',
        request:request(701,'DRAFT','ANIMATION','푸른 야간 분위기',['FRONT','BACK']),
        uploads:[
          {slot:'FRONT',uploadUrl:'https://example.supabase.co/storage/v1/object/upload/sign/kinojo-member-reference/a?token=front',mimeType:'image/webp',sizeBytes:12000,upsert:false},
          {slot:'BACK',uploadUrl:'https://example.supabase.co/storage/v1/object/upload/sign/kinojo-member-reference/b?token=back',mimeType:'image/webp',sizeBytes:13000,upsert:false}
        ]};
    }
    if(body.action==='image-request-finalize')return {ok:true,contract:'member-image-request-finalize-api-v1',characterId:41,privacy:'NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS',request:request(701,'SUBMITTED','ANIMATION','푸른 야간 분위기',['FRONT','BACK'])};
    if(body.action==='image-request-state')return {ok:true,contract:'member-image-request-state-api-v1',characterId:41,imageRetentionDays:7,metadataRetentionDays:30,requestCount:1,requests:[request(701,'SUBMITTED','ANIMATION','푸른 야간 분위기',['FRONT','BACK'])]};
    throw new Error('UNEXPECTED_ACTION:'+body.action);
  }};
  const uploads=[];
  let firstFailure=null;
  try{
    await requestApi.submit({client,sessionToken:token,characterId:41,styleCode:'ANIMATION',requestNote:'푸른 야간 분위기',results:[result('BACK',13000),result('FRONT')],contract,uploadApi,
      idempotencyKey:'request_stage2_retry_000001',uploadFile:async(_client,_prepared,item)=>{uploads.push(item.slot);if(item.slot==='BACK')throw new Error('SIMULATED_BACK_FAILURE');}});
  }catch(error){firstFailure=error;}
  assert.ok(firstFailure,'the partial upload must fail before finalize');
  assert.deepEqual(firstFailure.resume.uploadedSlots,['FRONT']);
  assert.equal(calls.filter(call=>call.action==='image-request-finalize').length,0);

  const completed=await requestApi.submit({client,sessionToken:token,characterId:41,styleCode:'ANIMATION',requestNote:'푸른 야간 분위기',results:[result('FRONT'),result('BACK',13000)],contract,uploadApi,resume:firstFailure.resume,
    uploadFile:async(_client,_prepared,item)=>{uploads.push('retry:'+item.slot);}});
  assert.equal(completed.ok,true);
  assert.equal(completed.request.status,'SUBMITTED');
  assert.equal(prepareCount,2,'retry must reuse the idempotency key while refreshing short-lived signed URLs');
  assert.deepEqual(uploads,['FRONT','BACK','retry:BACK'],'retry must skip the slot already uploaded successfully');
  assert.equal(calls.filter(call=>call.action==='image-request-finalize').length,1);
  const prepare=calls.find(call=>call.action==='image-request-prepare');
  assert.deepEqual(prepare.items.map(item=>item.slot),['FRONT','BACK']);
  assert.equal(prepare.styleCode,'ANIMATION');
  assert.equal(prepare.requestNote,'푸른 야간 분위기');
  assert.equal('objectPath' in prepare,false);

  const state=await requestApi.state({client,sessionToken:token,characterId:41});
  assert.equal(state.requestCount,1);
  assert.deepEqual(state.requests[0].slots,['FRONT','BACK']);
  assert.equal(JSON.stringify(state).includes('objectPath'),false);

  assert.throws(()=>requestApi.validatePrepared({ok:true,contract:'member-image-request-prepare-api-v1',characterId:41,request:request(1,'DRAFT',null,'',['FRONT']),uploads:[{slot:'FRONT',objectPath:'private/path.webp',uploadUrl:'https://example.test',mimeType:'image/webp',sizeBytes:12000,upsert:false}]},
    requestApi.validateContext({client,sessionToken:token,characterId:41,results:[result('FRONT')],contract,uploadApi})),/IMAGE_REQUEST_PRIVATE_PATH_EXPOSED/);

  console.log('KINOJO My Info Phase 2 member image-request client contract: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
