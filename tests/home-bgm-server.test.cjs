'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const sql = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261116002935_home_bgm.sql'),'utf8');
const migration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261116011005_home_bgm_lyrics.sql'),'utf8');
const rollback = fs.readFileSync(path.join(__dirname,'../supabase/rollbacks/20261116011005_home_bgm_lyrics.sql'),'utf8');
const edge = fs.readFileSync(path.join(__dirname,'../supabase/functions/kinojo-home-bgm/index.ts'),'utf8');
test('BGM Edge, database and storage boundary', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema private; create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create function public.kinojo_web_admin_actor_v323(text) returns jsonb language plpgsql
      as $$begin
        if $1='kws_'||repeat('c',40) then raise exception 'expired fixture'; end if;
        return jsonb_build_object('level',case when $1='kws_'||repeat('a',40) then 3 else 2 end);
      end$$;`);
    await db.exec(sql);
    await db.exec(migration);
    const grants = await db.query(`select has_function_privilege('anon','public.kinojo_home_bgm_v1(text,text,jsonb)','execute') as anon,
      has_function_privilege('authenticated','public.kinojo_home_bgm_v1(text,text,jsonb)','execute') as authenticated,
      has_function_privilege('service_role','public.kinojo_home_bgm_v1(text,text,jsonb)','execute') as service`);
    assert.deepEqual(grants.rows[0],{anon:false,authenticated:false,service:true});
    let handler, failPut = false, failDelete = false, putCalls = 0;
    const objects = new Map();
    vm.runInNewContext(stripTypeScriptTypes(edge,{mode:'transform'}), {
      Deno:{serve(fn){handler=fn},env:{get(name){return name==='SUPABASE_URL'?'https://storage.test':'local-fixture'}}},
      Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto,
      fetch:async (url,opts) => {
        if(url.includes('/rpc/')){
          const body=JSON.parse(opts.body);
          const {rows}=await db.query('select public.kinojo_home_bgm_v1($1,$2,$3) as data',
            [body.p_action,body.p_session_token,JSON.stringify(body.p_track)]);
          return Response.json(rows[0].data);
        }
        assert.ok(url.startsWith('https://storage.test/storage/v1/object/kinojo-home-bgm'));
        if(opts.method==='POST'){
          putCalls++;
          if(failPut)return new Response(null,{status:502});
          objects.set(url.split('/').at(-1),opts.body);
        } else {
          if(failDelete)return new Response(null,{status:502});
          JSON.parse(opts.body).prefixes.forEach(id=>objects.delete(id));
        }
        return Response.json({ok:true});
      }
    });
    const base='https://kinojo.info/functions/v1/kinojo-home-bgm?action=';
    const admin='kws_'+'a'.repeat(40), member='kws_'+'b'.repeat(40);
    async function request(action, token=admin, extra={}){
      const response=await handler(new Request(base+action,{
        method:/^(playlist|lyrics&)/.test(action)?'GET':'POST',body:extra.body,
        headers:{origin:'https://kinojo.info',...(token?{'x-kinojo-session':token}:{}),...extra.headers}
      }));
      return {status:response.status,data:await response.json()};
    }
    const get=async()=> (await request('playlist',null)).data.tracks;
    const upload=(name, token=admin, body=Buffer.from('ID3abcdefghijklmnop'))=>request('upload',token,{
      headers:{'content-type':'audio/mpeg','x-bgm-extension':'mp3','x-bgm-title':encodeURIComponent(name)},body
    });
    assert.deepEqual(await get(),[]);
    assert.equal((await upload('금지',null)).status,401);
    assert.equal((await upload('금지',member)).status,403);
    assert.equal((await upload('만료','kws_'+'c'.repeat(40))).status,403);
    assert.equal((await upload('가짜',admin,Buffer.alloc(50))).data.code,'INVALID_AUDIO');
    assert.equal((await upload('초과',admin,Buffer.alloc(6291457))).status,413);
    assert.equal(putCalls,0);
    const first=(await upload('첫 곡')).data.track;
    const second=(await upload('다음 곡')).data.track;
    assert.equal(objects.size,2);
    assert.deepEqual((await get()).map(row=>row.title),['첫 곡','다음 곡']);
    assert.deepEqual(Object.keys((await get())[0]).sort(),['extension','hasLyrics','id','title']);
    assert.equal((await request('lyrics&id='+first.id,null)).data.lyrics,null);
    const lrc='[00:00.00]<00:00.00>첫 <00:02.00>가사\n[00:04.00]다음 가사';
    const lyric={body:JSON.stringify({id:first.id,lyrics:lrc})};
    assert.equal((await request('update-lyrics',null,lyric)).status,401);
    assert.equal((await request('update-lyrics',member,lyric)).status,403);
    assert.equal((await request('update-lyrics',admin,{body:JSON.stringify({id:first.id,lyrics:'시간 없는 가사'})})).data.code,'INVALID_LYRICS');
    assert.equal((await request('update-lyrics',admin,{body:JSON.stringify({id:first.id,lyrics:'[00:01]'+ '가'.repeat(8192)})})).data.code,'INVALID_LYRICS');
    assert.equal((await request('update-lyrics',admin,lyric)).status,200);
    assert.equal((await get())[0].hasLyrics,true);
    assert.equal((await request('lyrics&id='+first.id,null)).data.lyrics,lrc);
    assert.ok(!(await request('list')).data.tracks.some(track=>Object.hasOwn(track,'lyrics_lrc')));
    assert.equal((await request('update-lyrics',admin,{body:JSON.stringify({id:first.id,lyrics:''})})).status,200);
    assert.equal((await get())[0].hasLyrics,false);
    const update={body:JSON.stringify({id:second.id,title:'순서 이동',sort_order:0})};
    assert.equal((await request('update',member,update)).status,403);
    assert.equal((await request('update',admin,update)).status,200);
    assert.deepEqual((await get()).map(row=>row.title),['순서 이동','첫 곡']);
    failPut=true;
    assert.equal((await upload('실패')).status,502);
    assert.equal((await get()).length,2);
    let pending=(await request('list')).data.tracks.find(t=>t.state==='UPLOADING');
    assert.equal(pending.canDelete,false);
    await db.query("update private.kinojo_home_bgm set created_at=now()-interval '6 minutes' where id=$1",[pending.id]);
    assert.equal((await request('delete',admin,{body:JSON.stringify({id:pending.id})})).status,200);
    const del={body:JSON.stringify({id:first.id})};
    failDelete=true;
    assert.equal((await request('delete',member,del)).status,403);
    assert.equal((await request('delete',admin,del)).status,502);
    assert.equal((await get()).length,1);
    assert.equal((await request('lyrics&id='+first.id,null)).data.code,'TRACK_UNAVAILABLE');
    assert.equal(objects.size,2);
    failDelete=false;
    assert.equal((await request('delete',admin,del)).status,200);
    assert.equal(objects.size,1);
    const badOrigin=await request('list',admin,{headers:{origin:'https://other.test'}});
    assert.equal(badOrigin.status,403);
    await db.exec(`insert into private.kinojo_home_bgm(id,extension,title,bytes,sort_order,state)
      select gen_random_uuid(),'mp3','fixture',100,99,'READY' from generate_series(1,19)`);
    failPut=false;
    const oldCalls=putCalls;
    assert.equal((await upload('상한')).data.code,'TRACK_LIMIT');
    assert.equal(putCalls,oldCalls);
    await request('update-lyrics',admin,{body:JSON.stringify({id:second.id,lyrics:lrc})});
    await db.exec(rollback);
    assert.equal((await get()).some(t=>Object.hasOwn(t,'hasLyrics')),false);
    assert.equal((await db.query('select lyrics_lrc from private.kinojo_home_bgm where id=$1',[second.id])).rows[0].lyrics_lrc,lrc);
  } finally { await db.close(); }
});
