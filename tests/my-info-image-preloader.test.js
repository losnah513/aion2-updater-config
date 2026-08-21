'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const preloader=require('../ui/kinojo-my-info-image-preloader.js');

const tick=()=>new Promise(resolve=>setImmediate(resolve));
const profile=(characterId,url)=>({
  ok:true,
  characterId,
  character:{characterId,characterName:'캐릭터 '+characterId,officialProfileImageUrl:url},
  profile:{effectiveProfileImageUrl:url,effectiveSource:'OFFICIAL'}
});

async function run(){
  assert.equal(preloader.constants.CONTRACT,'kinojo-my-info-image-preloader-v1');
  assert.equal(preloader.constants.BACKGROUND_CONCURRENCY,2);
  assert.equal(preloader.profileImageUrl(profile(1,'javascript:alert(1)')),'','non-HTTP profile URLs must be rejected');

  const calls=[];
  const pending=[];
  let active=0;
  let maxActive=0;
  const loader=preloader.create({
    loadImage(url,detail){
      calls.push({url,characterId:detail.characterId,attempt:detail.attempt});
      active+=1;
      maxActive=Math.max(maxActive,active);
      return new Promise((resolve,reject)=>pending.push({
        characterId:detail.characterId,
        resolve(){active-=1;resolve({url});},
        reject(){active-=1;reject(new Error('TEST_IMAGE_FAILED'));}
      }));
    }
  });
  const characters=[1,2,3,4,5].map(characterId=>({characterId}));
  const profileByCharacter=Object.fromEntries(characters.map(({characterId})=>[characterId,profile(characterId,'https://img.example/'+characterId+'.webp')]));
  const configured=loader.configure({characters,profileByCharacter});
  assert.equal(configured.characterCount,5);
  assert.deepEqual(configured.counts,{idle:5,loading:0,loaded:0,empty:0,error:0});

  const initialPromise=loader.prepareInitial(2);
  await tick();
  assert.deepEqual(calls.map(call=>call.characterId),[2,3],'selected and next character must be the initial gate');
  assert.equal(active,2);
  pending.splice(0,2).forEach(item=>item.resolve());
  const initial=await initialPromise;
  assert.deepEqual(initial.characterIds,[2,3]);
  assert.equal(initial.prepared,2);
  assert.equal(initial.failed,0);
  assert.equal(loader.getState(2).status,'loaded');
  assert.equal(loader.getState(3).status,'loaded');

  maxActive=0;
  const backgroundPromise=loader.startBackground();
  await tick();
  assert.deepEqual(calls.slice(2).map(call=>call.characterId),[1,4],'background loading must start only two workers');
  assert.equal(active,2);
  const first=pending.shift();
  assert.equal(first.characterId,1);
  first.resolve();
  await tick();
  assert.equal(calls.at(-1).characterId,5,'the next background item must start after a worker settles');
  const failed=pending.find(item=>item.characterId===4);
  failed.reject();
  pending.splice(pending.indexOf(failed),1);
  pending.shift().resolve();
  await backgroundPromise;
  assert.equal(maxActive,2,'background concurrency must never exceed two');
  assert.equal(loader.getState(1).status,'loaded');
  assert.equal(loader.getState(4).status,'error');
  assert.equal(loader.getState(5).status,'loaded');

  const retryPromise=loader.retry(4);
  await tick();
  assert.deepEqual(calls.at(-1),{url:'https://img.example/4.webp',characterId:4,attempt:2});
  pending.shift().resolve();
  await retryPromise;
  assert.equal(loader.getState(4).status,'loaded');
  assert.equal(loader.getState(4).attempts,2);

  loader.update(5,profile(5,''));
  const empty=await loader.request(5);
  assert.equal(empty.status,'empty');
  assert.equal(loader.getState(5).url,'');

  const partial=preloader.create({
    loadImage(_url,detail){
      return detail.characterId===2?Promise.reject(new Error('ONE_CHARACTER_FAILED')):Promise.resolve(true);
    }
  });
  partial.configure({characters:[{characterId:2},{characterId:3}],profileByCharacter:{
    2:profile(2,'https://img.example/2.webp'),
    3:profile(3,'https://img.example/3.webp')
  }});
  const partialInitial=await partial.prepareInitial(2);
  assert.equal(partialInitial.settled,true);
  assert.equal(partialInitial.prepared,1);
  assert.equal(partialInitial.failed,1,'one failed character must not block the whole modal gate');
  assert.equal(partial.getState(2).status,'error');
  assert.equal(partial.getState(3).status,'loaded');

  const commonUi=fs.readFileSync(path.join(__dirname,'../ui/kinojo-common-ui.js'),'utf8');
  assert.ok(commonUi.includes('kinojo-my-info-image-preloader.js?cache=2026082101'),'common UI must load the C-2 preloader');
  assert.ok(commonUi.includes('prepareInitial(selected.characterId)'),'modal opening must await selected and next image preparation');
  assert.ok(commonUi.includes('.startBackground()'),'remaining images must use background loading');
  assert.ok(commonUi.includes('retryMyInfoProfileImage_'),'per-character retry must be connected');
  assert.equal(commonUi.includes('setTimeout(show,300)'),false,'the fixed 300ms modal opening delay must be removed');

  console.log('KINOJO My Info C-2 profile image preloading contract: PASS');
}

run().catch(error=>{console.error(error);process.exitCode=1;});
