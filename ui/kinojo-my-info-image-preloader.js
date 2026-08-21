(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.KinojoMyInfoImagePreloader=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';

  const CONTRACT='kinojo-my-info-image-preloader-v1';
  const BACKGROUND_CONCURRENCY=2;
  const DEFAULT_TIMEOUT_MS=8000;
  const STATUSES=new Set(['idle','loading','loaded','empty','error']);

  const positiveId=value=>{
    const number=Number(value);
    return Number.isInteger(number)&&number>0?number:null;
  };
  const text=value=>String(value??'').trim();
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:null;
  const safeUrl=value=>{
    const source=text(value);
    if(!source)return '';
    try{
      const parsed=new URL(source,typeof location!=='undefined'?location.href:'https://kinojo.info/');
      return parsed.protocol==='https:'||parsed.protocol==='http:'?parsed.href:'';
    }catch(_error){return '';}
  };
  const profileImageUrl=value=>{
    const source=record(value)||{};
    const profile=record(source.profile)||{};
    const character=record(source.character)||{};
    return safeUrl(profile.effectiveProfileImageUrl||character.officialProfileImageUrl);
  };

  function defaultLoadImage(url,options={}){
    const ImageCtor=options.ImageCtor||(typeof Image==='function'?Image:null);
    const timeoutMs=Math.max(1000,Number(options.timeoutMs)||DEFAULT_TIMEOUT_MS);
    if(!ImageCtor)return Promise.reject(new Error('PROFILE_IMAGE_PRELOAD_UNSUPPORTED'));
    return new Promise((resolve,reject)=>{
      const image=new ImageCtor();
      let settled=false;
      const finish=(error=null)=>{
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        image.onload=null;
        image.onerror=null;
        if(error)reject(error);
        else resolve({url,width:Number(image.naturalWidth)||0,height:Number(image.naturalHeight)||0});
      };
      const timer=setTimeout(()=>finish(new Error('PROFILE_IMAGE_PRELOAD_TIMEOUT')),timeoutMs);
      image.decoding='async';
      image.loading='eager';
      image.onload=async()=>{
        try{
          if(typeof image.decode==='function')await image.decode();
          finish();
        }catch(_error){finish(new Error('PROFILE_IMAGE_PRELOAD_DECODE_FAILED'));}
      };
      image.onerror=()=>finish(new Error('PROFILE_IMAGE_PRELOAD_FAILED'));
      image.src=url;
    });
  }

  function create(options={}){
    const loadImage=typeof options.loadImage==='function'
      ? options.loadImage
      : (url,detail)=>defaultLoadImage(url,{...detail,ImageCtor:options.ImageCtor,timeoutMs:options.timeoutMs});
    const onStateChange=typeof options.onStateChange==='function'?options.onStateChange:()=>{};
    let generation=0;
    let entries=[];
    let states=new Map();
    let backgroundPromise=null;

    const snapshot=state=>state?Object.freeze({
      characterId:state.characterId,
      url:state.url,
      status:STATUSES.has(state.status)?state.status:'idle',
      attempts:state.attempts,
      errorCode:state.errorCode||''
    }):null;
    const emit=state=>{try{onStateChange(snapshot(state));}catch(_error){}};
    const makeState=(characterId,url,previous=null)=>({
      characterId,
      url,
      status:previous&&previous.url===url&&STATUSES.has(previous.status)?previous.status:'idle',
      attempts:previous&&previous.url===url?previous.attempts:0,
      errorCode:previous&&previous.url===url?previous.errorCode:'',
      promise:null
    });

    function configure(input={}){
      const characters=Array.isArray(input.characters)?input.characters:[];
      const profiles=record(input.profileByCharacter)||{};
      const previous=states;
      const nextEntries=[];
      const nextStates=new Map();
      const seen=new Set();
      for(const character of characters){
        const characterId=positiveId(character?.characterId);
        if(characterId===null||seen.has(characterId))continue;
        seen.add(characterId);
        const profileState=profiles[characterId]||profiles[String(characterId)]||null;
        const url=profileImageUrl(profileState);
        nextEntries.push({characterId,url});
        nextStates.set(characterId,makeState(characterId,url,previous.get(characterId)||null));
      }
      generation+=1;
      entries=nextEntries;
      states=nextStates;
      backgroundPromise=null;
      entries.forEach(entry=>emit(states.get(entry.characterId)));
      return summary();
    }

    function update(characterId,value){
      const id=positiveId(characterId);
      if(id===null)return null;
      const url=profileImageUrl(value);
      const index=entries.findIndex(entry=>entry.characterId===id);
      if(index<0)entries.push({characterId:id,url});
      else entries[index]={characterId:id,url};
      const current=states.get(id)||null;
      const state=makeState(id,url,current);
      states.set(id,state);
      generation+=1;
      backgroundPromise=null;
      emit(state);
      return snapshot(state);
    }

    function request(characterId,detail={}){
      const id=positiveId(characterId);
      const state=id===null?null:states.get(id);
      if(!state)return Promise.reject(new Error('PROFILE_IMAGE_CHARACTER_NOT_CONFIGURED'));
      const force=detail.force===true;
      if(!state.url){
        state.status='empty';
        state.errorCode='';
        state.promise=null;
        emit(state);
        return Promise.resolve(snapshot(state));
      }
      if(state.status==='loaded'&&!force)return Promise.resolve(snapshot(state));
      if(state.status==='loading'&&state.promise)return state.promise;
      if(state.status==='error'&&!force)return Promise.reject(new Error(state.errorCode||'PROFILE_IMAGE_PRELOAD_FAILED'));

      const runGeneration=generation;
      const runUrl=state.url;
      state.status='loading';
      state.attempts+=1;
      state.errorCode='';
      emit(state);
      const promise=Promise.resolve()
        .then(()=>loadImage(runUrl,{characterId:id,attempt:state.attempts,timeoutMs:Number(options.timeoutMs)||DEFAULT_TIMEOUT_MS}))
        .then(()=>{
          const current=states.get(id);
          if(runGeneration!==generation||current!==state||current.url!==runUrl)return snapshot(current);
          state.status='loaded';
          state.errorCode='';
          state.promise=null;
          emit(state);
          return snapshot(state);
        })
        .catch(error=>{
          const current=states.get(id);
          if(runGeneration!==generation||current!==state||current.url!==runUrl)return snapshot(current);
          state.status='error';
          state.errorCode=text(error?.message||error)||'PROFILE_IMAGE_PRELOAD_FAILED';
          state.promise=null;
          emit(state);
          throw error;
        });
      state.promise=promise;
      return promise;
    }

    function initialCharacterIds(selectedCharacterId){
      const selected=positiveId(selectedCharacterId);
      const index=entries.findIndex(entry=>entry.characterId===selected);
      if(index<0)return entries.slice(0,2).map(entry=>entry.characterId);
      const ids=[entries[index].characterId];
      if(entries.length>1)ids.push(entries[(index+1)%entries.length].characterId);
      return [...new Set(ids)];
    }

    async function prepareInitial(selectedCharacterId){
      const ids=initialCharacterIds(selectedCharacterId);
      const results=await Promise.allSettled(ids.map(characterId=>request(characterId)));
      return Object.freeze({
        contract:CONTRACT,
        characterIds:Object.freeze([...ids]),
        prepared:results.filter(result=>result.status==='fulfilled').length,
        failed:results.filter(result=>result.status==='rejected').length,
        settled:true
      });
    }

    function startBackground(){
      if(backgroundPromise)return backgroundPromise;
      const queue=entries
        .map(entry=>entry.characterId)
        .filter(characterId=>{
          const status=states.get(characterId)?.status;
          return status==='idle';
        });
      const runGeneration=generation;
      let cursor=0;
      const worker=async()=>{
        while(runGeneration===generation){
          const characterId=queue[cursor++];
          if(characterId===undefined)return;
          try{await request(characterId);}catch(_error){}
        }
      };
      backgroundPromise=Promise.all(Array.from({length:Math.min(BACKGROUND_CONCURRENCY,queue.length)},()=>worker()))
        .then(()=>summary())
        .finally(()=>{if(runGeneration===generation)backgroundPromise=null;});
      return backgroundPromise;
    }

    const retry=characterId=>request(characterId,{force:true});
    const getState=characterId=>snapshot(states.get(positiveId(characterId)));
    function summary(){
      const counts={idle:0,loading:0,loaded:0,empty:0,error:0};
      states.forEach(state=>{counts[STATUSES.has(state.status)?state.status:'idle']+=1;});
      return Object.freeze({
        contract:CONTRACT,
        characterCount:entries.length,
        backgroundConcurrency:BACKGROUND_CONCURRENCY,
        counts:Object.freeze(counts)
      });
    }
    function reset(){
      generation+=1;
      entries=[];
      states=new Map();
      backgroundPromise=null;
      return summary();
    }

    return Object.freeze({configure,update,request,prepareInitial,startBackground,retry,getState,summary,reset});
  }

  return Object.freeze({
    create,
    defaultLoadImage,
    profileImageUrl,
    constants:Object.freeze({CONTRACT,BACKGROUND_CONCURRENCY,DEFAULT_TIMEOUT_MS})
  });
});
