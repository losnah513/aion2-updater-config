const headers={
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "x-content-type-options":"nosniff"
};

// Stage 7 retirement tombstone: this slug is deliberately kept non-mutating so
// stale WEB bundles and delayed external calls fail closed. Common list/lookup
// Sheet functions continue through their separate lookup-* Edge Functions.
Deno.serve((request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  return new Response(JSON.stringify({
    ok:false,
    code:"SANCTUARY_SHEET_BRIDGE_RETIRED",
    message:"성역 시트 동기화는 종료되었습니다.",
    replacement:"/sanctuary/",
    retiredAt:"2026-08-29"
  }),{status:410,headers});
});
