(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.KinojoMyInfoBatchBootstrap=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const EDGE_NAME='kinojo-member-profile';
  const ACTION='batch-bootstrap';
  const API_VERSION='2.7';
  const DATABASE_CONTRACT='375';
  const BATCH_CONTRACT='375';
  const RESPONSE_CONTRACT='member-image-batch-bootstrap-api-v1';
  const TOKEN=/^kws_[A-Za-z0-9_-]{40,80}$/;
  const REFERENCE_SLOTS=['FRONT','BACK','UPPER_BODY'];
  const PRIVATE_REFERENCE_KEYS=new Set([
    'objectPath','object_path','uploadUrl','upload_url','signedUrl','signedURL','previewUrl','previewURL','url'
  ]);

  const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  const positiveId=value=>{
    const number=Number(value);
    return Number.isInteger(number)&&number>0?number:null;
  };
  const text=value=>String(value??'').trim();

  function assertNoPrivateReferenceSelectors(value){
    if(Array.isArray(value)){
      value.forEach(assertNoPrivateReferenceSelectors);
      return;
    }
    const source=record(value);
    if(!source)return;
    for(const [key,nested] of Object.entries(source)){
      if(PRIVATE_REFERENCE_KEYS.has(key))throw new Error('BATCH_BOOTSTRAP_PRIVATE_REFERENCE_SELECTOR_FORBIDDEN');
      assertNoPrivateReferenceSelectors(nested);
    }
  }

  function normalizeReferenceState(value,characterId,base){
    const source=record(value)||{};
    const seen=new Set();
    const references=(Array.isArray(source.references)?source.references:[]).map(item=>{
      const row=record(item)||{};
      const slot=text(row.slot);
      if(!REFERENCE_SLOTS.includes(slot)||seen.has(slot)||row.active!==true){
        throw new Error('BATCH_BOOTSTRAP_REFERENCE_STATE_INVALID');
      }
      seen.add(slot);
      assertNoPrivateReferenceSelectors(row);
      return {
        slot,
        mimeType:text(row.mimeType),
        sizeBytes:Number(row.sizeBytes)||0,
        uploadedAt:text(row.uploadedAt),
        expiresAt:text(row.expiresAt),
        retentionDays:Number(row.retentionDays)||7,
        active:true
      };
    });
    if(Number(source.activeCount)!==references.length)throw new Error('BATCH_BOOTSTRAP_REFERENCE_COUNT_MISMATCH');
    return {
      ...base,
      contract:'member-image-batch-bootstrap-reference-state-v1',
      characterId,
      retentionDays:Number(source.retentionDays)||7,
      activeCount:references.length,
      references,
      logicalExpiry:text(source.logicalExpiry)||'SERVER_FILTER_EXPIRES_AT_GT_NOW'
    };
  }

  function normalizeResponse(value){
    const data=record(value);
    if(!data||data.ok!==true)throw new Error(text(data?.message||data?.code)||'BATCH_BOOTSTRAP_FAILED');
    if(text(data.apiVersion)!==API_VERSION||text(data.databaseContract)!==DATABASE_CONTRACT||text(data.batchBootstrapContract)!==BATCH_CONTRACT||text(data.contract)!==RESPONSE_CONTRACT){
      throw new Error('BATCH_BOOTSTRAP_CONTRACT_MISMATCH');
    }
    if(text(data.bootstrapTransport)!=='ONE_EDGE_REQUEST_ONE_RPC')throw new Error('BATCH_BOOTSTRAP_TRANSPORT_MISMATCH');

    const characters=Array.isArray(data.characters)?data.characters:[];
    const items=Array.isArray(data.items)?data.items:[];
    if(Number(data.characterCount)!==characters.length||Number(data.imageStateCount)!==items.length||characters.length!==items.length){
      throw new Error('BATCH_BOOTSTRAP_COUNT_MISMATCH');
    }

    const seen=new Set();
    const profileByCharacter=Object.create(null);
    const referenceByCharacter=Object.create(null);
    const normalizedCharacters=characters.map((character,index)=>{
      const row=record(character);
      const item=record(items[index]);
      const characterId=positiveId(row?.characterId);
      if(!row||!item||characterId===null||positiveId(item.characterId)!==characterId||positiveId(item.character?.characterId)!==characterId||seen.has(characterId)){
        throw new Error('BATCH_BOOTSTRAP_CHARACTER_BINDING_MISMATCH');
      }
      seen.add(characterId);
      const base={
        ok:true,
        service:text(data.service)||EDGE_NAME,
        apiVersion:API_VERSION,
        databaseContract:DATABASE_CONTRACT,
        authContract:text(data.authContract),
        characterListContract:text(data.characterListContract),
        characterAccessContract:text(data.characterAccessContract),
        batchBootstrapContract:BATCH_CONTRACT,
        member:data.member||null,
        owner:data.owner||null,
        characterId,
        isMain:item.isMain===true,
        mainCharacterId:positiveId(item.mainCharacterId),
        character:row
      };
      const profile=record(item.profile);
      if(!profile)throw new Error('BATCH_BOOTSTRAP_PROFILE_STATE_INVALID');
      profileByCharacter[characterId]={
        ...base,
        contract:'member-image-batch-bootstrap-profile-state-v1',
        profile
      };
      referenceByCharacter[characterId]=normalizeReferenceState(item.referenceState,characterId,base);
      return row;
    });

    return {
      ok:true,
      raw:data,
      characters:{
        ok:true,
        service:text(data.service)||EDGE_NAME,
        apiVersion:API_VERSION,
        databaseContract:DATABASE_CONTRACT,
        authContract:text(data.authContract),
        characterListContract:text(data.characterListContract),
        characterAccessContract:text(data.characterAccessContract),
        batchBootstrapContract:BATCH_CONTRACT,
        contract:RESPONSE_CONTRACT,
        displayStatBasis:'PVE',
        member:data.member||null,
        ownerResolved:data.ownerResolved===true,
        code:text(data.code),
        owner:data.owner||null,
        characterCount:normalizedCharacters.length,
        characters:normalizedCharacters
      },
      profileByCharacter,
      referenceByCharacter,
      requestCount:1,
      rpcCount:1,
      preloadingConnected:false,
      backgroundLoadingConnected:false,
      retryConnected:false
    };
  }

  async function load(options){
    const client=options?.client;
    const sessionToken=text(options?.sessionToken);
    if(!client||typeof client.invokeEdgeFunction!=='function')throw new Error('BATCH_BOOTSTRAP_CLIENT_REQUIRED');
    if(!TOKEN.test(sessionToken))throw new Error('BATCH_BOOTSTRAP_SESSION_INVALID');
    const response=await client.invokeEdgeFunction(EDGE_NAME,{action:ACTION,sessionToken});
    return normalizeResponse(response);
  }

  return Object.freeze({
    load,
    normalizeResponse,
    constants:Object.freeze({EDGE_NAME,ACTION,API_VERSION,DATABASE_CONTRACT,BATCH_CONTRACT,RESPONSE_CONTRACT,REFERENCE_SLOTS:Object.freeze([...REFERENCE_SLOTS])})
  });
});
