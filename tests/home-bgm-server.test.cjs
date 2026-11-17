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
const likesMigration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261116024338_home_bgm_likes.sql'),'utf8');
const likesRollback = fs.readFileSync(path.join(__dirname,'../supabase/rollbacks/20261116024338_home_bgm_likes.sql'),'utf8');
const coverMigration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261117005315_home_bgm_cover_images.sql'),'utf8');
const coverRollback = fs.readFileSync(path.join(__dirname,'../supabase/rollbacks/20261117005315_home_bgm_cover_images.sql'),'utf8');
const playMigration = fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261117021000_home_bgm_play_count.sql'),'utf8');
const playRollback = fs.readFileSync(path.join(__dirname,'../supabase/rollbacks/20261117021000_home_bgm_play_count.sql'),'utf8');
const webp=Buffer.from('UklGRjQAAABXRUJQVlA4ICgAAACwAQCdASoIAAgAAUAmJZgCdLoABGaAAP7wxAv7gzPq7HDzXxAtwAAA','base64');
// A still WebP with an embedded ICC profile uses a VP8X container.
const extendedWebp = Buffer.from('UklGRi4CAABXRUJQVlA4WAoAAAAgAAAABwAABwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggQAAAAPABAJ0BKggACAABQCYlnAJ0ARd+j1gzAADOP86e7X6tC3/soe75tH4q/tmL2Rrw1WRNjwkAY7ta6u8xMneIAAA=', 'base64');
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
    await db.exec(likesMigration);
    await db.exec(coverMigration);
    const grants = await db.query(`select has_function_privilege('anon','public.kinojo_home_bgm_v1(text,text,jsonb)','execute') as anon,
      has_function_privilege('authenticated','public.kinojo_home_bgm_v1(text,text,jsonb)','execute') as authenticated,
      has_function_privilege('service_role','public.kinojo_home_bgm_v1(text,text,jsonb)','execute') as service`);
    assert.deepEqual(grants.rows[0],{anon:false,authenticated:false,service:true});
    let handler, failPut = false, failDelete = false, putCalls = 0;
    const objects = new Map();
    vm.runInNewContext(stripTypeScriptTypes(edge,{mode:'transform'}), {
      Deno:{serve(fn){handler=fn},env:{get(name){return name==='SUPABASE_URL'?'https://storage.test':'local-fixture'}}},
      Request,Response,Headers,URL,TextEncoder,TextDecoder,Uint8Array,AbortSignal,crypto,btoa,atob,
      fetch:async (url,opts) => {
        if(url.includes('/rpc/')){
          const body=JSON.parse(opts.body);
          if(url.endsWith('/kinojo_home_bgm_covers_v1')){
            const {rows}=await db.query('select public.kinojo_home_bgm_covers_v1($1,$2,$3,$4,$5) as data',
              [body.p_action,body.p_id,body.p_version,body.p_session_token,body.p_image]);
            return Response.json(rows[0].data);
          }
          if(url.endsWith('/kinojo_home_bgm_likes_v1')){
            assert.ok(body.p_ip_key === null || /^[a-f0-9]{64}$/.test(body.p_ip_key));
            const {rows}=await db.query('select public.kinojo_home_bgm_likes_v1($1,$2,$3) as data',
              [body.p_id,body.p_ip_key,body.p_vote]);
            return Response.json(rows[0].data);
          }
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
        method:extra.method || (/^(playlist|lyrics&|covers$)/.test(action)?'GET':'POST'),body:extra.body,
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
    await db.exec(playMigration);
    assert.deepEqual((await get()).map(track=>track.playCount),[0,0]);
    const recordPlay = (id, headers={}, method='POST') => request('record-play&id='+id+'&count=99',null,{headers,method});
    assert.equal((await recordPlay(first.id,{origin:'https://other.test'})).status,403);
    assert.equal((await recordPlay(first.id,{origin:''})).status,403);
    assert.equal((await recordPlay(first.id,{},'GET')).status,405);
    assert.equal((await recordPlay('not-an-id')).status,400);
    assert.equal((await recordPlay(crypto.randomUUID())).status,404);
    const plays=await Promise.all([recordPlay(first.id),recordPlay(first.id),recordPlay(second.id)]);
    assert.deepEqual(plays.slice(0,2).map(play=>play.data.playCount).sort(),[1,2]);
    assert.equal(plays[2].data.playCount,1);
    assert.deepEqual((await get()).map(track=>track.playCount),[2,1]);
    assert.deepEqual((await db.query("select has_function_privilege('anon','public.kinojo_home_bgm_v1(text,text,jsonb)','execute') as anon, has_function_privilege('authenticated','public.kinojo_home_bgm_v1(text,text,jsonb)','execute') as authenticated")).rows[0],{anon:false,authenticated:false});
    await db.exec(playRollback);
    assert.equal((await recordPlay(second.id)).status,403);
    assert.equal(Object.hasOwn((await get())[0],'playCount'),false);
    await db.exec(playMigration);
    assert.deepEqual((await get()).map(track=>track.playCount),[2,1]);
    const putCover = (token,body=webp) => request('cover-upload&id='+first.id,token,{
      headers:{'content-type':'image/webp'},body
    });
    const coverCatalog=async()=> (await request('covers',null)).data.covers;
    assert.deepEqual(await coverCatalog(),{});
    assert.equal((await putCover(null)).status,401);
    assert.equal((await putCover(member)).status,403);
    assert.equal((await putCover(admin,Buffer.alloc(40))).status,400);
    assert.equal((await putCover(admin,Buffer.alloc(131073))).status,413);
    const firstCover=(await putCover(admin)).data.version;
    const animated=Buffer.from(extendedWebp);
    animated[20] |= 0x02;
    assert.equal((await putCover(admin,animated)).data.code,'INVALID_COVER');
    const oversized=Buffer.from(extendedWebp);
    oversized.writeUIntLE(640,24,3);
    assert.equal((await putCover(admin,oversized)).data.code,'INVALID_COVER');
    const truncated=extendedWebp.subarray(0,-2);
    const badChunk=Buffer.from(truncated);
    badChunk.writeUInt32LE(badChunk.length-8,4);
    assert.equal((await putCover(admin,badChunk)).data.code,'INVALID_COVER');
    const savedExtended=await putCover(admin,extendedWebp);
    assert.equal(savedExtended.status,200);
    const nextCover=savedExtended.data.version;
    assert.notEqual(firstCover,nextCover);
    assert.deepEqual(await coverCatalog(),{[first.id]:nextCover});
    const imageResponse=await handler(new Request(base+'cover&id='+first.id+'&v='+nextCover));
    assert.equal(imageResponse.headers.get('content-type'),'image/webp');
    assert.deepEqual(Buffer.from(await imageResponse.arrayBuffer()),extendedWebp);
    assert.equal((await handler(new Request(base+'cover&id='+first.id+'&v='+firstCover))).status,404);
    const signature='public.kinojo_home_bgm_covers_v1(text,uuid,uuid,text,text)';
    const permissions=(await db.query("select has_function_privilege('anon',$1,'execute') as anon, has_function_privilege('authenticated',$1,'execute') as authenticated, has_function_privilege('service_role',$1,'execute') as service",[signature])).rows[0];
    assert.deepEqual(permissions,{anon:false,authenticated:false,service:true});
    assert.deepEqual((await get()).map(row=>row.title),['첫 곡','다음 곡']);
    assert.deepEqual(Object.keys((await get())[0]).sort(),['extension','hasLyrics','id','playCount','title']);
    assert.equal((await request('lyrics&id='+first.id,null)).data.lyrics,null);
    const lrc='[00:00.00]<00:00.00>첫 <00:02.00>가사\n[00:04.00]다음 가사';
    const lyric={body:JSON.stringify({id:first.id,lyrics:lrc})};
    assert.equal((await request('update-lyrics',null,lyric)).status,401);
    assert.equal((await request('update-lyrics',member,lyric)).status,403);
    const plainLyrics = '시간 없는 가사\n\n다음 연';
    assert.equal((await request('update-lyrics',admin,{body:JSON.stringify({id:first.id,lyrics:plainLyrics})})).status,200);
    assert.equal((await request('lyrics&id='+first.id,null)).data.lyrics,plainLyrics);
    assert.equal((await request('update-lyrics',admin,{body:JSON.stringify({id:first.id,lyrics:'[00:01]'})})).data.code,'INVALID_LYRICS');
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
    const vote = (id, ip, token=null, method='POST', headers={}) => request('likes&id='+id,token,{
      method,headers:{...(ip?{'cf-connecting-ip':ip}:{}),...headers}
    });
    const ip='192.0.2.10';
    assert.equal((await vote(first.id, null, null, 'POST', {'x-forwarded-for':ip})).status,503);
    const initial=(await vote(first.id,ip,null,'GET')).data;
    assert.equal(initial.count,0);
    assert.equal(initial.liked,false);
    assert.equal(new Date(initial.resetsAt).getUTCHours(),15);
    assert.ok(initial.resetAfterMs>0 && initial.resetAfterMs<=86400000);
    const duplicates=await Promise.all([
      vote(first.id,ip),vote(first.id,ip,admin,'POST',{'x-forwarded-for':'198.51.100.2'}),
      vote(first.id,'::ffff:c000:20a',member),vote(first.id,ip)
    ]);
    assert.ok(duplicates.every(r=>r.status===200 && r.data.count===1 && r.data.liked));
    assert.equal((await vote(first.id,'192.0.2.11',null,'GET')).data.liked,false);
    assert.equal((await vote(first.id,'192.0.2.11')).data.count,2);
    assert.equal((await vote(second.id,ip)).data.count,1);
    const unavailable=(await vote(first.id,'not-an-ip',null,'GET')).data;
    assert.deepEqual([unavailable.count,unavailable.available,unavailable.liked],[2,false,false]);
    assert.equal((await vote(first.id,ip,null,'POST',{origin:'https://other.test'})).status,403);
    await db.exec(`update private.kinojo_home_bgm_daily_like set like_day=like_day-2 where track_id='${first.id}'`);
    assert.equal((await vote(first.id,ip,null,'GET')).data.liked,false);
    assert.equal((await vote(first.id,ip)).data.count,3);
    assert.equal((await db.query('select count(*)::int as count from private.kinojo_home_bgm_daily_like where track_id=$1',[first.id])).rows[0].count,1);
    const likeGrants=(await db.query(`select
      has_function_privilege('anon','public.kinojo_home_bgm_likes_v1(uuid,text,boolean)','execute') as anon,
      has_function_privilege('authenticated','public.kinojo_home_bgm_likes_v1(uuid,text,boolean)','execute') as authenticated,
      has_function_privilege('service_role','public.kinojo_home_bgm_likes_v1(uuid,text,boolean)','execute') as service,
      has_table_privilege('anon','private.kinojo_home_bgm_daily_like','select') as raw`)).rows[0];
    assert.deepEqual(likeGrants,{anon:false,authenticated:false,service:true,raw:false});
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
    assert.equal((await recordPlay(first.id)).status,404);
    assert.equal((await request('lyrics&id='+first.id,null)).data.code,'TRACK_UNAVAILABLE');
    assert.equal(objects.size,2);
    failDelete=false;
    assert.equal((await request('delete',admin,del)).status,200);
    assert.equal(objects.size,1);
    assert.equal((await vote(first.id,ip)).status,404);
    assert.equal((await db.query('select count(*)::int as count from private.kinojo_home_bgm_daily_like where track_id=$1',[first.id])).rows[0].count,0);
    assert.deepEqual(await coverCatalog(),{});
    assert.equal((await db.query('select count(*)::int as count from private.kinojo_home_bgm_covers')).rows[0].count,0);
    await db.exec(coverRollback);
    assert.equal((await db.query("select has_function_privilege('service_role',$1,'execute') as access",[signature])).rows[0].access,false);
    await db.exec(likesRollback);
    assert.equal((await db.query('select like_count::int from private.kinojo_home_bgm where id=$1',[second.id])).rows[0].like_count,1);
    assert.equal((await db.query(`select has_function_privilege('service_role','public.kinojo_home_bgm_likes_v1(uuid,text,boolean)','execute') as access`)).rows[0].access,false);
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
