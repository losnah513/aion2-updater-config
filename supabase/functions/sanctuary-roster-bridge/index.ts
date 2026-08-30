const headers={
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};

// Stage 7 retirement tombstone. The new sanctuary-management service owns team,
// force, party, slot, schedule, support, notification, and archive mutations.
Deno.serve((request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  return new Response(JSON.stringify({
    ok:false,
    code:"SANCTUARY_ROSTER_BRIDGE_RETIRED",
    message:"기존 성역 편성 Bridge는 종료되었습니다.",
    replacement:"/sanctuary/",
    retiredAt:"2026-08-29"
  }),{status:410,headers});
});
