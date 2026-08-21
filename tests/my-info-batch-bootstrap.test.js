'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const batch=require('../ui/kinojo-my-info-batch-bootstrap.js');

const commonUi=fs.readFileSync(path.join(__dirname,'../ui/kinojo-common-ui.js'),'utf8');
const prepareStart=commonUi.indexOf('async function prepareMyInfoProfileModal_');
const selectStart=commonUi.indexOf('function selectMyInfoProfileCharacter_',prepareStart);
const selectEnd=commonUi.indexOf('async function handleMyInfoProfileFile_',selectStart);
const prepareSource=commonUi.slice(prepareStart,selectStart);
const selectSource=commonUi.slice(selectStart,selectEnd);
assert.ok(commonUi.includes("kinojo-my-info-batch-bootstrap.js?cache=2026082101"),'common UI must load the C-1 batch client');
assert.ok(prepareSource.includes('await loadMyInfoBatchBootstrap_()'),'modal preparation must use the one-request batch');
assert.equal(prepareSource.includes('await loadMyInfoCharacters_()'),false,'modal preparation must not issue the legacy character request first');
assert.equal(prepareSource.includes('loadMyInfoProfileBootstrap_('),false,'modal preparation must not issue a selected profile request');
assert.equal(prepareSource.includes('loadMyInfoReferenceState_('),false,'modal preparation must not issue a selected reference request');
assert.ok(selectSource.includes('renderMyInfoBatchSelectedState_()'),'character selection must render hydrated batch state');
assert.equal(selectSource.includes('loadMyInfoProfileBootstrap_('),false,'character selection must not refetch profile state');
assert.equal(selectSource.includes('loadMyInfoReferenceState_('),false,'character selection must not refetch reference state');

const token='kws_'+('B'.repeat(48));
const response={
  ok:true,
  service:'kinojo-member-profile',
  apiVersion:'2.7',
  databaseContract:'375',
  authContract:'320',
  characterListContract:'334',
  characterAccessContract:'336',
  batchBootstrapContract:'375',
  contract:'member-image-batch-bootstrap-api-v1',
  bootstrapTransport:'ONE_EDGE_REQUEST_ONE_RPC',
  ownerResolved:true,
  owner:{mainCharacterId:11},
  member:{id:1},
  characterCount:2,
  imageStateCount:2,
  characters:[
    {characterId:11,characterName:'본캐',isMain:true,mainCharacterId:11},
    {characterId:12,characterName:'부캐',isMain:false,mainCharacterId:11}
  ],
  items:[
    {
      characterId:11,isMain:true,mainCharacterId:11,character:{characterId:11},
      profile:{hasOverride:true,effectiveSource:'USER_OVERRIDE',effectiveProfileImageUrl:'https://example.test/profile.webp'},
      referenceState:{retentionDays:7,activeCount:1,logicalExpiry:'SERVER_FILTER_EXPIRES_AT_GT_NOW',references:[{slot:'FRONT',mimeType:'image/webp',sizeBytes:100,uploadedAt:'2026-08-21T00:00:00Z',expiresAt:'2026-08-28T00:00:00Z',retentionDays:7,active:true}]}
    },
    {
      characterId:12,isMain:false,mainCharacterId:11,character:{characterId:12},
      profile:{hasOverride:false,effectiveSource:'OFFICIAL',effectiveProfileImageUrl:'https://example.test/official.webp'},
      referenceState:{retentionDays:7,activeCount:0,logicalExpiry:'SERVER_FILTER_EXPIRES_AT_GT_NOW',references:[]}
    }
  ]
};

(async()=>{
  const calls=[];
  const client={async invokeEdgeFunction(name,body){calls.push({name,body});return response;}};
  const result=await batch.load({client,sessionToken:token});

  assert.equal(calls.length,1,'C-1 must use one browser Edge request');
  assert.deepEqual(calls[0],{name:'kinojo-member-profile',body:{action:'batch-bootstrap',sessionToken:token}});
  assert.equal(result.requestCount,1);
  assert.equal(result.rpcCount,1);
  assert.equal(result.characters.characters.length,2);
  assert.equal(result.profileByCharacter[11].profile.effectiveSource,'USER_OVERRIDE');
  assert.equal(result.referenceByCharacter[11].references[0].slot,'FRONT');
  assert.equal(result.referenceByCharacter[12].activeCount,0);
  assert.equal(result.preloadingConnected,false,'preloading belongs to C-2');
  assert.equal(result.backgroundLoadingConnected,false,'background loading belongs to C-2');
  assert.equal(result.retryConnected,false,'retry belongs to C-2');

  assert.throws(()=>batch.normalizeResponse({...response,databaseContract:'371'}),/BATCH_BOOTSTRAP_CONTRACT_MISMATCH/);
  assert.throws(()=>batch.normalizeResponse({...response,characterCount:1}),/BATCH_BOOTSTRAP_COUNT_MISMATCH/);
  const duplicate=structuredClone(response);
  duplicate.characters[1].characterId=11;
  duplicate.items[1].characterId=11;
  duplicate.items[1].character.characterId=11;
  assert.throws(()=>batch.normalizeResponse(duplicate),/BATCH_BOOTSTRAP_CHARACTER_BINDING_MISMATCH/);
  const leaked=structuredClone(response);
  leaked.items[0].referenceState.references[0].objectPath='characters/11/FRONT/private.webp';
  assert.throws(()=>batch.normalizeResponse(leaked),/BATCH_BOOTSTRAP_PRIVATE_REFERENCE_SELECTOR_FORBIDDEN/);

  if(process.env.CI==='true'){
    const live=await fetch('https://josvoltpktvwysrasffq.supabase.co/functions/v1/kinojo-member-profile',{
      method:'POST',
      headers:{'content-type':'application/json',origin:'https://kinojo.info'},
      body:JSON.stringify({action:'health'})
    });
    const health=await live.json();
    assert.equal(live.status,200);
    assert.equal(health.ok,true);
    assert.equal(health.apiVersion,'2.7');
    assert.equal(health.databaseContract,'375');
    assert.equal(health.batchBootstrapContract,'375');
    assert.equal(health.bootstrap?.transport,'ONE_EDGE_REQUEST_ONE_RPC');
    assert.equal(health.bootstrap?.preloading,'C2_NOT_INCLUDED');
    assert.ok(health.actions.includes('batch-bootstrap'));
    assert.equal(live.headers.get('x-kinojo-image-batch-bootstrap-contract'),'375');
  }

  console.log('KINOJO My Info C-1 one-request batch bootstrap contract: PASS');
})().catch(error=>{
  console.error(error);
  process.exitCode=1;
});
