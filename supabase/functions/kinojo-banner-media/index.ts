const S = "kinojo-banner-media",
  V = "2.0",
  DB = "400",
  EVENT = "400",
  UPLOAD = "394",
  MASTER = "337",
  STORAGE = "382",
  B = "kinojo-site-banners",
  MAX = 5242880,
  TTL = 7200,
  REQ = 65536;
const M = ["image/jpeg", "image/png", "image/webp"],
  F = ["MAIN_16_9", "SIDE_300_715"],
  T = /^kws_[A-Za-z0-9_-]{40,80}$/,
  O = new Set(["https://kinojo.info", "https://www.kinojo.info"]),
  E = new TextEncoder();
const K =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MUT = new Set([
  "upload-prepare",
  "upload-complete",
  "asset-update",
  "asset-archive",
  "asset-restore",
  "asset-delete",
  "campaign-create",
  "campaign-update",
  "campaign-publish",
  "campaign-pause",
  "campaign-archive",
  "campaign-restore",
  "campaign-delete",
  "event-save",
  "event-publish",
  "event-move",
  "event-playback",
  "event-pause",
  "event-delete",
  "overlay-upload-prepare",
  "overlay-upload-complete",
  "composite-upload-prepare",
  "composite-upload-complete",
]);
const ERR: Record<string, string> = {
  METHOD_NOT_ALLOWED: "허용되지 않은 요청 방식입니다.",
  ORIGIN_NOT_ALLOWED: "허용되지 않은 요청 출처입니다.",
  JSON_REQUIRED: "JSON 요청만 허용됩니다.",
  REQUEST_TOO_LARGE: "요청 데이터가 너무 큽니다.",
  RAW_CREDENTIAL_FORBIDDEN: "원문 PASS KEY는 전송할 수 없습니다.",
  SESSION_TOKEN_INVALID: "로그인 세션 형식이 올바르지 않습니다.",
  BANNER_IDEMPOTENCY_KEY_REQUIRED: "중복 요청 방지 키가 필요합니다.",
  BANNER_IDEMPOTENCY_KEY_INVALID: "중복 요청 방지 키 형식이 올바르지 않습니다.",
  BANNER_IDEMPOTENCY_KEY_REUSED:
    "같은 중복 요청 방지 키를 다른 요청에 재사용할 수 없습니다.",
  BANNER_IDEMPOTENCY_IN_PROGRESS: "같은 요청이 이미 처리 중입니다.",
  BANNER_IDEMPOTENCY_ACTION_INVALID:
    "서버가 이 업로드 작업을 허용하지 않습니다. 관리자 화면을 새로고침한 뒤 다시 시도해 주세요.",
  BANNER_CAMPAIGN_DELETE_PAUSE_REQUIRED:
    "게시 중인 캠페인은 먼저 일시정지해야 영구 삭제할 수 있습니다.",
  BANNER_CAMPAIGN_DELETE_CONFIRMATION_MISMATCH:
    "영구 삭제 확인을 위해 캠페인 이름을 정확히 입력해 주세요.",
  BANNER_EVENT_GROUP_ID_REQUIRED: "이미지 이벤트를 먼저 선택해 주세요.",
  BANNER_EVENT_GROUP_ID_INVALID: "이미지 이벤트 식별자가 올바르지 않습니다.",
  BANNER_EVENT_PAYLOAD_INVALID: "이미지 이벤트 설정을 확인해 주세요.",
  BANNER_EVENT_ITEMS_REQUIRED: "게시할 활성 이미지를 한 장 이상 선택해 주세요.",
  BANNER_EVENT_MOVE_DIRECTION_INVALID: "이벤트 이동 방향이 올바르지 않습니다.",
  BANNER_EVENT_PLAYBACK_MODE_INVALID: "노출 순서는 순차 또는 랜덤만 선택할 수 있습니다.",
  BANNER_EVENT_DELETE_PAUSE_REQUIRED:
    "게시 중인 이벤트는 먼저 게시를 중지해야 영구 삭제할 수 있습니다.",
  BANNER_EVENT_DELETE_CONFIRMATION_MISMATCH:
    "영구 삭제 확인을 위해 이벤트 이름을 정확히 입력해 주세요.",
  BANNER_TEXT_OVERLAY_WIDTH_FIXED: "문구 영역의 폭은 배너 전체로 고정됩니다.",
  BANNER_CONTENT_TEXT_REQUIRED: "노출할 문구 내용을 입력해 주세요.",
  BANNER_CONTENT_EMOJI_REQUIRED: "노출할 이모지를 선택해 주세요.",
  BANNER_CONTENT_ASSET_REQUIRED: "노출할 스티커 또는 뱃지를 선택해 주세요.",
  BANNER_COMPOSITE_REQUIRED: "콘텐츠가 합쳐진 게시용 이미지를 먼저 만들어 주세요.",
  BANNER_SERVER_ERROR: "배너 요청을 처리하는 중 서버 오류가 발생했습니다.",
};
const rec = (v: any) =>
    v && typeof v === "object" && !Array.isArray(v) ? v : null,
  txt = (v: any, n = 500) =>
    String(v ?? "")
      .trim()
      .slice(0, n),
  num = (v: any) =>
    v == null || v === ""
      ? null
      : Number.isFinite(Number(v))
        ? Number(v)
        : null,
  pos = (v: any) =>
    Number.isInteger(num(v)) && Number(v) > 0 ? Number(v) : null,
  has = (o: any, ks: string[]) =>
    ks.some((k) => Object.prototype.hasOwnProperty.call(o, k));
function ctx() {
  const url = txt(Deno.env.get("SUPABASE_URL"), 500).replace(/\/$/, "");
  let key = txt(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 2200);
  if (!key)
    try {
      key = txt(
        JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}")?.default,
        2200,
      );
    } catch {}
  if (!url || !key) throw Error("BANNER_SERVER_NOT_CONFIGURED");
  return { url, key };
}
function corsOrigin(r: Request) {
  return txt(r.headers.get("origin"), 300);
}
function originOk(r: Request) {
  const o = corsOrigin(r);
  return !o || O.has(o);
}
function hdr(r: Request, extra: Record<string, string> = {}) {
  const o = corsOrigin(r),
    h: Record<string, string> = {
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers":
        "authorization, apikey, content-type, x-client-info, if-none-match, idempotency-key",
      "access-control-expose-headers":
        "ETag, Cache-Control, X-Kinojo-Request-Id, X-Kinojo-Idempotency, X-Kinojo-Banner-Event-Contract, X-Kinojo-Banner-Upload-Contract",
      "access-control-max-age": "600",
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store",
      vary: "Origin",
      "x-content-type-options": "nosniff",
      "x-kinojo-banner-boundary": "KINOJO_BANNER_MEDIA_EDGE_V5",
      "x-kinojo-banner-db-contract": DB,
      "x-kinojo-banner-event-contract": EVENT,
      "x-kinojo-banner-upload-contract": UPLOAD,
      "x-kinojo-banner-storage-contract": STORAGE,
      "x-kinojo-master-boundary-contract": MASTER,
    };
  if (o && O.has(o)) h["access-control-allow-origin"] = o;
  for (const [k, v] of Object.entries(extra)) h[k.toLowerCase()] = v;
  return h;
}
function out(r: Request, b: any, s = 200, extra: Record<string, string> = {}) {
  let body = b;
  if (s >= 400 || b?.ok === false) {
    const c = txt(b?.code, 100) || "BANNER_REQUEST_FAILED",
      m = txt(b?.message, 300) || ERR[c] || "요청을 처리하지 못했습니다.";
    body = {
      ...b,
      ok: false,
      code: c,
      message: m,
      service: S,
      apiVersion: V,
      databaseContract: DB,
    };
  }
  const h = hdr(r, extra);
  h["x-kinojo-request-id"] = crypto.randomUUID();
  return new Response(JSON.stringify(body), { status: s, headers: h });
}
async function rpc(n: string, b: any) {
  const { url, key } = ctx(),
    x = await fetch(`${url}/rest/v1/rpc/${n}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "x-client-info": `${S}/${V}`,
      },
      body: JSON.stringify(b),
    }),
    raw = await x.text();
  let d: any = {};
  try {
    d = raw ? JSON.parse(raw) : {};
  } catch {}
  if (!x.ok) throw Error(`RPC_FAILED:${n}`);
  return rec(d) || {};
}
function stable(v: any): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return (
    "{" +
    Object.keys(v)
      .sort()
      .filter(
        (k) =>
          ![
            "sessionToken",
            "session_token",
            "idempotencyKey",
            "idempotency_key",
            "passKey",
            "pass_key",
            "passCode",
            "pass_code",
          ].includes(k),
      )
      .map((k) => JSON.stringify(k) + ":" + stable(v[k]))
      .join(",") +
    "}"
  );
}
async function hashRequest(a: string, b: any) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    E.encode(a + "|" + stable(b)),
  );
  return Array.from(new Uint8Array(bytes))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
function idemKey(r: Request, b: any) {
  return txt(
    r.headers.get("idempotency-key") ?? b.idempotencyKey ?? b.idempotency_key,
    80,
  );
}
function needsIdem(a: string, b: any) {
  return MUT.has(a) || (a === "orphan-cleanup" && b.confirm === true);
}
function withHeader(resp: Response, k: string, v: string) {
  const h = new Headers(resp.headers);
  h.set(k, v);
  return new Response(resp.body, {
    status: resp.status,
    statusText: resp.statusText,
    headers: h,
  });
}
async function idem(
  r: Request,
  b: any,
  t: string,
  a: string,
  fn: () => Promise<Response>,
) {
  const key = idemKey(r, b);
  if (!key)
    return out(r, { ok: false, code: "BANNER_IDEMPOTENCY_KEY_REQUIRED" }, 400);
  if (!K.test(key))
    return out(r, { ok: false, code: "BANNER_IDEMPOTENCY_KEY_INVALID" }, 400);
  const q = await hashRequest(a, b),
    ttl = a === "upload-prepare" ? 7200 : 86400,
    c = await rpc("kinojo_banner_idempotency_claim_v388", {
      p_session_token: t,
      p_action: a,
      p_idempotency_key: key,
      p_request_hash: q,
      p_ttl_seconds: ttl,
    });
  if (c.ok !== true) return out(r, c, stat(txt(c.code, 80)));
  const d = txt(c.disposition, 30);
  if (d === "REPLAY") {
    const rb = rec(c.responseBody) ?? {
        ok: false,
        code: "BANNER_IDEMPOTENCY_REPLAY_INVALID",
      },
      rs = Math.max(
        200,
        Math.min(599, Math.floor(num(c.responseStatus) ?? 500)),
      );
    return out(r, rb, rs, { "x-kinojo-idempotency": "replay" });
  }
  if (d === "IN_PROGRESS")
    return out(r, { ok: false, code: "BANNER_IDEMPOTENCY_IN_PROGRESS" }, 409, {
      "x-kinojo-idempotency": "in-progress",
    });
  if (d !== "CLAIMED")
    return out(r, { ok: false, code: "BANNER_IDEMPOTENCY_LEDGER_ERROR" }, 500);
  let resp: Response;
  try {
    resp = await fn();
  } catch (e) {
    console.error(e);
    resp = out(r, { ok: false, code: "BANNER_SERVER_ERROR" }, 500);
  }
  let rb: any;
  try {
    rb = await resp.clone().json();
  } catch {
    rb = { ok: false, code: "BANNER_RESPONSE_INVALID" };
  }
  let finalized = false;
  try {
    const f = await rpc("kinojo_banner_idempotency_finalize_v388", {
      p_session_token: t,
      p_action: a,
      p_idempotency_key: key,
      p_request_hash: q,
      p_response_status: resp.status,
      p_response_body: rb,
    });
    finalized = f.ok === true;
  } catch (e) {
    console.error("idempotency finalize failed", e);
  }
  if (finalized && a === "campaign-delete" && resp.ok && rb?.ok === true) {
    const cid = pos(rb.campaignId);
    if (cid !== null)
      try {
        await rpc("kinojo_banner_campaign_ledger_forget_v390", {
          p_session_token: t,
          p_campaign_id: cid,
        });
      } catch (e) {
        console.error("campaign ledger forget failed", e);
      }
  }
  return withHeader(resp, "x-kinojo-idempotency", "stored");
}
function stat(c: string) {
  if (
    [
      "SESSION_TOKEN_REQUIRED",
      "SESSION_TOKEN_INVALID",
      "SESSION_INVALID",
      "SESSION_NOT_FOUND",
      "SESSION_EXPIRED",
      "SESSION_REVOKED",
      "SESSION_MEMBER_INVALID",
    ].includes(c)
  )
    return 401;
  if (c === "MASTER_REQUIRED") return 403;
  if (
    [
      "BANNER_ASSET_NOT_FOUND",
      "BANNER_CAMPAIGN_NOT_FOUND",
      "BANNER_EVENT_NOT_FOUND",
    ].includes(c)
  )
    return 404;
  if (
    [
      "BANNER_IDEMPOTENCY_KEY_REUSED",
      "BANNER_IDEMPOTENCY_IN_PROGRESS",
    ].includes(c) ||
    c.includes("PAUSE_REQUIRED") ||
    c.includes("CONFLICT") ||
    c.includes("STILL_REFERENCED") ||
    c.includes("DELETE_IN_PROGRESS") ||
    c.includes("NO_ACTIVE_ITEMS") ||
    c.includes("SCHEDULE_ENDED") ||
    c.includes("NOT_PUBLISHABLE") ||
    c.includes("STATE_INVALID") ||
    c === "BANNER_IMAGE_ASPECT_INVALID" ||
    c === "BANNER_UPLOAD_OBJECT_NOT_FOUND"
  )
    return 409;
  return 400;
}
function file(b: any) {
  const mime = txt(b.mimeType ?? b.mime_type, 120).toLowerCase(),
    size = pos(b.sizeBytes ?? b.size_bytes),
    format = txt(b.formatCode ?? b.format_code, 40).toUpperCase();
  if (!M.includes(mime))
    return { ok: false, code: "BANNER_IMAGE_MIME_INVALID" };
  if (size === null || size > MAX)
    return { ok: false, code: "BANNER_IMAGE_SIZE_INVALID" };
  if (!F.includes(format))
    return { ok: false, code: "BANNER_FORMAT_CODE_INVALID" };
  return { ok: true, mime, size, format };
}
function mediaFile(b: any) {
  const mime = txt(b.mimeType ?? b.mime_type, 120).toLowerCase(),
    size = pos(b.sizeBytes ?? b.size_bytes);
  if (!M.includes(mime)) return { ok: false, code: "BANNER_IMAGE_MIME_INVALID" };
  if (size === null || size > MAX)
    return { ok: false, code: "BANNER_IMAGE_SIZE_INVALID" };
  return { ok: true, mime, size };
}
const token = (b: any) => txt(b.sessionToken ?? b.session_token, 120),
  rawCred = (b: any) =>
    has(b, ["passKey", "pass_key", "passCode", "pass_code"]),
  badSel = (b: any) =>
    has(b, [
      "memberId",
      "member_id",
      "targetMemberId",
      "target_member_id",
      "bucket",
      "bucketId",
      "bucket_id",
      "uploadUrl",
      "upload_url",
      "upsert",
    ]);
async function sign(p: string) {
  const { url, key } = ctx(),
    e = p.split("/").map(encodeURIComponent).join("/"),
    r = await fetch(`${url}/storage/v1/object/upload/sign/${B}/${e}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: '{"upsert":false}',
    }),
    d = rec(await r.json());
  if (!r.ok || !d) throw Error("BANNER_SIGNED_UPLOAD_CREATE_FAILED");
  let u = txt(d.url ?? d.signedURL ?? d.signedUrl, 4000);
  if (u.startsWith("/object/")) u = `/storage/v1${u}`;
  const x = new URL(u, url);
  if (
    x.origin !== new URL(url).origin ||
    !x.pathname.startsWith(`/storage/v1/object/upload/sign/${B}/`)
  )
    throw Error("BANNER_SIGNED_UPLOAD_URL_INVALID");
  return x.toString();
}
async function obj(p: string) {
  const { url, key } = ctx(),
    e = p.split("/").map(encodeURIComponent).join("/"),
    r = await fetch(`${url}/storage/v1/object/${B}/${e}`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
  if (!r.ok)
    return r.status === 400 || r.status === 404
      ? { ok: false, code: "BANNER_UPLOAD_OBJECT_NOT_FOUND" }
      : Promise.reject(Error("BANNER_UPLOAD_OBJECT_READ_FAILED"));
  const bytes = new Uint8Array(await r.arrayBuffer());
  return {
    ok: true,
    bytes,
    mime: txt(r.headers.get("content-type"), 120).split(";")[0].toLowerCase(),
    size: bytes.length,
  };
}
async function del(p: string) {
  if (!p) return true;
  const { url, key } = ctx(),
    e = p.split("/").map(encodeURIComponent).join("/"),
    r = await fetch(`${url}/storage/v1/object/${B}/${e}`, {
      method: "DELETE",
      headers: { apikey: key, authorization: `Bearer ${key}` },
    });
  return r.ok || r.status === 400 || r.status === 404;
}
const tag = (b: Uint8Array, o: number) =>
    String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]),
  u16 = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1],
  u32b = (b: Uint8Array, o: number) =>
    ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0,
  u32l = (b: Uint8Array, o: number) =>
    (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0,
  u24 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
function info(b: Uint8Array) {
  const ps = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length >= 24 && ps.every((v, i) => b[i] === v) && tag(b, 12) === "IHDR")
    return { mime: "image/png", w: u32b(b, 16), h: u32b(b, 20) };
  if (b.length >= 4 && b[0] === 255 && b[1] === 216) {
    const sof = new Set([
      192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
    ]);
    for (let i = 2; i + 3 < b.length; ) {
      if (b[i++] !== 255) continue;
      while (i < b.length && b[i] === 255) i++;
      const m = b[i++];
      if (m === 217 || m === 218) break;
      if (m === 216 || m === 1) continue;
      if (i + 1 >= b.length) break;
      const l = u16(b, i);
      if (l < 2 || i + l > b.length) break;
      if (sof.has(m) && l >= 7)
        return { mime: "image/jpeg", w: u16(b, i + 5), h: u16(b, i + 3) };
      i += l;
    }
  }
  if (b.length >= 20 && tag(b, 0) === "RIFF" && tag(b, 8) === "WEBP")
    for (let o = 12; o + 8 <= b.length; ) {
      const k = tag(b, o),
        z = u32l(b, o + 4),
        d = o + 8;
      if (d + z > b.length) break;
      if (k === "VP8X" && z >= 10)
        return {
          mime: "image/webp",
          w: 1 + u24(b, d + 4),
          h: 1 + u24(b, d + 7),
        };
      if (k === "VP8L" && z >= 5 && b[d] === 47) {
        const x = u32l(b, d + 1);
        return {
          mime: "image/webp",
          w: (x & 16383) + 1,
          h: ((x >>> 14) & 16383) + 1,
        };
      }
      if (
        k === "VP8 " &&
        z >= 10 &&
        b[d + 3] === 157 &&
        b[d + 4] === 1 &&
        b[d + 5] === 42
      )
        return {
          mime: "image/webp",
          w: (b[d + 6] | (b[d + 7] << 8)) & 16383,
          h: (b[d + 8] | (b[d + 9] << 8)) & 16383,
        };
      o = d + z + (z & 1);
    }
  return null;
}
const ratio = (f: string, w: number, h: number) =>
  f === "MAIN_16_9" ? w * 9 === h * 16 : w * 715 === h * 300;
async function prep(r: Request, b: any, t: string) {
  if (badSel(b) || has(b, ["objectPath", "object_path"]))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const f = file(b);
  if (!f.ok) return out(r, f, 400);
  const g = await rpc("kinojo_banner_upload_prepare_v383", {
    p_session_token: t,
    p_mime_type: f.mime,
    p_size_bytes: f.size,
  });
  if (g.ok !== true)
    return out(r, { ok: false, code: txt(g.code, 80) }, stat(txt(g.code, 80)));
  const p = txt(g.objectPath, 1024);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    contract: "banner-signed-upload-prepare-api-v1",
    formatCode: f.format,
    upload: {
      bucket: B,
      objectPath: p,
      uploadUrl: await sign(p),
      mimeType: f.mime,
      sizeBytes: f.size,
      upsert: false,
      expiresInSeconds: TTL,
      activation: "BANNER_UPLOAD_COMPLETE_REQUIRED",
    },
  });
}
async function complete(r: Request, b: any, t: string) {
  if (badSel(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const f = file(b);
  if (!f.ok) return out(r, f, 400);
  const p = txt(b.objectPath ?? b.object_path, 1024);
  if (!p)
    return out(r, { ok: false, code: "BANNER_OBJECT_PATH_REQUIRED" }, 400);
  const g = await rpc("kinojo_banner_upload_complete_gate_v383", {
    p_session_token: t,
    p_object_path: p,
    p_mime_type: f.mime,
    p_size_bytes: f.size,
  });
  if (g.ok !== true)
    return out(r, { ok: false, code: txt(g.code, 80) }, stat(txt(g.code, 80)));
  const s: any = await obj(p);
  if (!s.ok) return out(r, s, 409);
  if (s.mime !== f.mime || s.size !== f.size || s.size < 1 || s.size > MAX) {
    await del(p);
    return out(
      r,
      {
        ok: false,
        code:
          s.mime !== f.mime
            ? "BANNER_UPLOAD_MIME_MISMATCH"
            : "BANNER_UPLOAD_SIZE_MISMATCH",
        candidateDeleted: true,
      },
      409,
    );
  }
  const i = info(s.bytes);
  if (!i || i.mime !== f.mime) {
    await del(p);
    return out(
      r,
      {
        ok: false,
        code: "BANNER_UPLOAD_SIGNATURE_INVALID",
        candidateDeleted: true,
      },
      409,
    );
  }
  const aspectMatchesTarget = ratio(f.format, i.w, i.h);
  const a = await rpc("kinojo_banner_asset_register_storage_v394", {
    p_session_token: t,
    p_object_path: p,
    p_mime_type: s.mime,
    p_size_bytes: s.size,
    p_width: i.w,
    p_height: i.h,
    p_format_code: f.format,
    p_display_name:
      txt(b.displayName ?? b.display_name, 120) ||
      txt(b.originalFileName ?? b.original_file_name, 120) ||
      "배너 이미지",
    p_original_file_name:
      txt(b.originalFileName ?? b.original_file_name, 255) || null,
    p_default_alt: txt(b.defaultAlt ?? b.default_alt, 300),
  });
  if (a.ok !== true)
    return out(
      r,
      {
        ok: false,
        code: txt(a.code, 80),
        candidateRetainedForCleanup: true,
        cleanupAfterHours: 24,
      },
      stat(txt(a.code, 80)),
    );
  const { url } = ctx();
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    uploadContract: UPLOAD,
    contract: "banner-asset-upload-complete-api-v2",
    asset: a.asset,
    image: {
      bucket: B,
      objectPath: p,
      publicUrl: `${url}/storage/v1/object/public/${B}/${p.split("/").map(encodeURIComponent).join("/")}`,
      mimeType: s.mime,
      sizeBytes: s.size,
      width: i.w,
      height: i.h,
      storageVerified: true,
      signatureVerified: true,
      aspectMatchesTarget,
      fitMode: "COVER",
      cropWarning: !aspectMatchesTarget,
      activation: "ASSET_READY",
    },
  });
}
async function mediaPrep(r: Request, b: any, t: string, purpose: string) {
  if (badSel(b) || has(b, ["objectPath", "object_path"]))
    return out(r, { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" }, 400);
  const f = mediaFile(b);
  if (!f.ok) return out(r, f, 400);
  const g = await rpc("kinojo_banner_upload_prepare_v383", {
    p_session_token: t,
    p_mime_type: f.mime,
    p_size_bytes: f.size,
  });
  if (g.ok !== true)
    return out(r, { ok: false, code: txt(g.code, 80) }, stat(txt(g.code, 80)));
  const p = txt(g.objectPath, 1024);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    contract: `banner-${purpose}-signed-upload-prepare-api-v1`,
    upload: {
      bucket: B,
      objectPath: p,
      uploadUrl: await sign(p),
      mimeType: f.mime,
      sizeBytes: f.size,
      upsert: false,
      expiresInSeconds: TTL,
      activation: `${purpose.toUpperCase()}_UPLOAD_COMPLETE_REQUIRED`,
    },
  });
}
async function verifiedMedia(r: Request, b: any, t: string) {
  if (badSel(b)) return { response: out(r, { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" }, 400) };
  const f = mediaFile(b);
  if (!f.ok) return { response: out(r, f, 400) };
  const p = txt(b.objectPath ?? b.object_path, 1024);
  if (!p) return { response: out(r, { ok: false, code: "BANNER_OBJECT_PATH_REQUIRED" }, 400) };
  const g = await rpc("kinojo_banner_upload_complete_gate_v383", {
    p_session_token: t,
    p_object_path: p,
    p_mime_type: f.mime,
    p_size_bytes: f.size,
  });
  if (g.ok !== true)
    return { response: out(r, { ok: false, code: txt(g.code, 80) }, stat(txt(g.code, 80))) };
  const stored: any = await obj(p);
  if (!stored.ok) return { response: out(r, stored, 409) };
  if (stored.mime !== f.mime || stored.size !== f.size || stored.size < 1 || stored.size > MAX) {
    await del(p);
    return { response: out(r, {
      ok: false,
      code: stored.mime !== f.mime ? "BANNER_UPLOAD_MIME_MISMATCH" : "BANNER_UPLOAD_SIZE_MISMATCH",
      candidateDeleted: true,
    }, 409) };
  }
  const dimensions = info(stored.bytes);
  if (!dimensions || dimensions.mime !== f.mime) {
    await del(p);
    return { response: out(r, { ok: false, code: "BANNER_UPLOAD_SIGNATURE_INVALID", candidateDeleted: true }, 409) };
  }
  return { p, stored, dimensions };
}
async function overlayComplete(r: Request, b: any, t: string) {
  const verified: any = await verifiedMedia(r, b, t);
  if (verified.response) return verified.response;
  const kind = txt(b.assetKind ?? b.asset_kind, 20).toUpperCase(),
    name = txt(b.displayName ?? b.display_name, 80);
  if (!["EMOTICON", "STICKER", "BADGE"].includes(kind))
    return out(r, { ok: false, code: "BANNER_OVERLAY_KIND_INVALID" }, 400);
  if (!name) return out(r, { ok: false, code: "BANNER_OVERLAY_NAME_INVALID" }, 400);
  const a = await rpc("kinojo_banner_overlay_asset_register_v396", {
    p_session_token: t,
    p_object_path: verified.p,
    p_mime_type: verified.stored.mime,
    p_size_bytes: verified.stored.size,
    p_width: verified.dimensions.w,
    p_height: verified.dimensions.h,
    p_asset_kind: kind,
    p_display_name: name,
  });
  if (a.ok !== true)
    return out(r, { ok: false, code: txt(a.code, 80), candidateRetainedForCleanup: true }, stat(txt(a.code, 80)));
  const { url } = ctx();
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    contract: "banner-overlay-upload-complete-api-v1",
    asset: a.asset,
    image: {
      bucket: B,
      objectPath: verified.p,
      publicUrl: `${url}/storage/v1/object/public/${B}/${verified.p.split("/").map(encodeURIComponent).join("/")}`,
      mimeType: verified.stored.mime,
      sizeBytes: verified.stored.size,
      width: verified.dimensions.w,
      height: verified.dimensions.h,
      activation: "OVERLAY_ASSET_READY",
    },
  });
}
async function compositeComplete(r: Request, b: any, t: string) {
  const verified: any = await verifiedMedia(r, b, t);
  if (verified.response) return verified.response;
  const eventGroupId = txt(b.eventGroupId ?? b.event_group_id, 80),
    assetId = pos(b.assetId ?? b.asset_id);
  if (!K.test(eventGroupId) || assetId === null)
    return out(r, { ok: false, code: "BANNER_COMPOSITE_TARGET_INVALID" }, 400);
  const a = await rpc("kinojo_banner_composite_register_v396", {
    p_session_token: t,
    p_event_group_id: eventGroupId,
    p_asset_id: assetId,
    p_object_path: verified.p,
    p_mime_type: verified.stored.mime,
    p_size_bytes: verified.stored.size,
    p_width: verified.dimensions.w,
    p_height: verified.dimensions.h,
  });
  if (a.ok !== true)
    return out(r, { ok: false, code: txt(a.code, 80), candidateRetainedForCleanup: true }, stat(txt(a.code, 80)));
  return out(r, {
    ...a,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    contract: "banner-composite-upload-complete-api-v1",
    image: {
      bucket: B,
      objectPath: verified.p,
      mimeType: verified.stored.mime,
      sizeBytes: verified.stored.size,
      width: verified.dimensions.w,
      height: verified.dimensions.h,
      activation: "COMPOSITE_ATTACHED",
    },
  });
}
async function asset(r: Request, b: any, t: string, a: string) {
  if (a === "asset-list") {
    const d = await rpc("kinojo_banner_asset_list_v384", {
      p_session_token: t,
      p_include_archived: b.includeArchived !== false,
    });
    return d.ok === true
      ? out(r, { ...d, service: S, apiVersion: V, databaseContract: DB })
      : out(r, d, stat(txt(d.code, 80)));
  }
  const id = pos(b.assetId ?? b.asset_id);
  if (id === null)
    return out(r, { ok: false, code: "BANNER_ASSET_ID_REQUIRED" }, 400);
  if (a === "asset-update") {
    const n = txt(b.displayName ?? b.display_name, 120);
    if (!n)
      return out(r, { ok: false, code: "BANNER_DISPLAY_NAME_REQUIRED" }, 400);
    const d = await rpc("kinojo_banner_asset_update_v384", {
      p_session_token: t,
      p_asset_id: id,
      p_display_name: n,
      p_default_alt: txt(b.defaultAlt ?? b.default_alt, 300),
    });
    return d.ok === true ? out(r, d) : out(r, d, stat(txt(d.code, 80)));
  }
  if (a === "asset-archive" || a === "asset-restore") {
    const d = await rpc(
      a === "asset-archive"
        ? "kinojo_banner_asset_archive_v384"
        : "kinojo_banner_asset_restore_v384",
      { p_session_token: t, p_asset_id: id },
    );
    return d.ok === true ? out(r, d) : out(r, d, stat(txt(d.code, 80)));
  }
  const p = await rpc("kinojo_banner_asset_delete_prepare_v385", {
    p_session_token: t,
    p_asset_id: id,
  });
  if (p.ok !== true) return out(r, p, stat(txt(p.code, 80)));
  const k = txt(p.deleteToken, 80),
    src = txt(p.sourceType, 20),
    path = txt(p.objectPath, 1024);
  if (src === "STORAGE" && !(await del(path))) {
    await rpc("kinojo_banner_asset_delete_abort_v385", {
      p_session_token: t,
      p_asset_id: id,
      p_delete_token: k,
    });
    return out(
      r,
      {
        ok: false,
        code: "BANNER_STORAGE_DELETE_FAILED",
        metadataPreserved: true,
      },
      502,
    );
  }
  const f = await rpc("kinojo_banner_asset_delete_finalize_v385", {
    p_session_token: t,
    p_asset_id: id,
    p_delete_token: k,
  });
  return f.ok === true
    ? out(r, {
        ok: true,
        assetId: id,
        sourceType: src,
        storageObjectDeleted: src === "STORAGE",
        metadataDeleted: true,
        staticBytesPreserved: src === "STATIC",
      })
    : out(r, f, stat(txt(f.code, 80)));
}
async function overlayAssets(r: Request, b: any, t: string) {
  const d = await rpc("kinojo_banner_overlay_asset_list_v396", {
    p_session_token: t,
    p_include_archived: b.includeArchived === true,
  });
  if (d.ok !== true) return out(r, d, stat(txt(d.code, 80)));
  const { url } = ctx(), assets = [];
  for (const raw of Array.isArray(d.assets) ? d.assets : []) {
    const item = rec(raw), p = txt(item?.objectPath, 1024);
    if (!item || !/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(p)) continue;
    assets.push({
      overlayAssetId: pos(item.overlayAssetId),
      assetKind: txt(item.assetKind, 20),
      displayName: txt(item.displayName, 80),
      mimeType: txt(item.mimeType, 120),
      sizeBytes: pos(item.sizeBytes),
      width: pos(item.width),
      height: pos(item.height),
      status: txt(item.status, 20),
      imageUrl: `${url}/storage/v1/object/public/${B}/${p.split("/").map(encodeURIComponent).join("/")}`,
    });
  }
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    contract: "banner-overlay-asset-list-api-v1",
    assets,
  });
}
async function orphan(r: Request, b: any, t: string) {
  const h = Math.max(
      3,
      Math.min(
        168,
        Math.floor(num(b.olderThanHours ?? b.older_than_hours) ?? 24),
      ),
    ),
    l = Math.max(1, Math.min(100, Math.floor(num(b.limit) ?? 50))),
    d = await rpc("kinojo_banner_orphan_candidates_v396", {
      p_session_token: t,
      p_older_than_hours: h,
      p_limit: l,
    });
  if (d.ok !== true) return out(r, d, stat(txt(d.code, 80)));
  const xs = Array.isArray(d.items) ? d.items : [];
  if (b.confirm !== true)
    return out(r, {
      ok: true,
      dryRun: true,
      olderThanHours: h,
      candidateCount: xs.length,
      items: xs,
    });
  const deleted = [],
    failed = [];
  for (const x of xs) {
    const p = txt(rec(x)?.objectPath, 1024);
    if (!p) continue;
    ((await del(p)) ? deleted : failed).push(p);
  }
  return out(
    r,
    {
      ok: failed.length === 0,
      dryRun: false,
      deletedCount: deleted.length,
      failedCount: failed.length,
      deleted,
      failed,
    },
    failed.length ? 502 : 200,
  );
}
async function campaign(r: Request, b: any, t: string, a: string) {
  if (a === "campaign-list") {
    const d = await rpc("kinojo_banner_campaign_list_v386", {
      p_session_token: t,
      p_include_archived: b.includeArchived !== false,
    });
    return d.ok === true
      ? out(r, { ...d, service: S, apiVersion: V, databaseContract: DB })
      : out(r, d, stat(txt(d.code, 80)));
  }
  if (a === "campaign-create" || a === "campaign-update") {
    const p = rec(b.campaign ?? b.payload);
    if (!p)
      return out(
        r,
        { ok: false, code: "BANNER_CAMPAIGN_PAYLOAD_REQUIRED" },
        400,
      );
    let d: any;
    if (a === "campaign-create")
      d = await rpc("kinojo_banner_campaign_create_v386", {
        p_session_token: t,
        p_payload: p,
      });
    else {
      const id = pos(b.campaignId ?? b.campaign_id);
      if (id === null)
        return out(r, { ok: false, code: "BANNER_CAMPAIGN_ID_REQUIRED" }, 400);
      d = await rpc("kinojo_banner_campaign_update_v386", {
        p_session_token: t,
        p_campaign_id: id,
        p_payload: p,
      });
    }
    return d.ok === true
      ? out(r, { ...d, service: S, apiVersion: V, databaseContract: DB })
      : out(r, d, stat(txt(d.code, 80)));
  }
  const id = pos(b.campaignId ?? b.campaign_id);
  if (id === null)
    return out(r, { ok: false, code: "BANNER_CAMPAIGN_ID_REQUIRED" }, 400);
  if (a === "campaign-delete") {
    const expected = txt(b.expectedName ?? b.expected_name, 120);
    if (!expected)
      return out(
        r,
        { ok: false, code: "BANNER_CAMPAIGN_DELETE_CONFIRMATION_MISMATCH" },
        400,
      );
    const d = await rpc("kinojo_banner_campaign_delete_v389", {
      p_session_token: t,
      p_campaign_id: id,
      p_expected_name: expected,
    });
    return d.ok === true
      ? out(r, { ...d, service: S, apiVersion: V, databaseContract: DB })
      : out(r, d, stat(txt(d.code, 80)));
  }
  const map: any = {
      "campaign-publish": "kinojo_banner_campaign_publish_v386",
      "campaign-pause": "kinojo_banner_campaign_pause_v386",
      "campaign-archive": "kinojo_banner_campaign_archive_v386",
      "campaign-restore": "kinojo_banner_campaign_restore_v386",
    },
    d = await rpc(map[a], { p_session_token: t, p_campaign_id: id });
  return d.ok === true
    ? out(r, { ...d, service: S, apiVersion: V, databaseContract: DB })
    : out(r, d, stat(txt(d.code, 80)));
}
async function event(r: Request, b: any, t: string, a: string) {
  let d: any;
  if (a === "event-list") {
    d = await rpc("kinojo_banner_event_list_v400", {
      p_session_token: t,
      p_include_archived: b.includeArchived !== false,
    });
  } else if (a === "event-save") {
    const payload = rec(b.event ?? b.payload);
    if (!payload)
      return out(r, { ok: false, code: "BANNER_EVENT_PAYLOAD_INVALID" }, 400);
    const rawId = txt(b.eventGroupId ?? b.event_group_id, 80);
    if (rawId && !K.test(rawId))
      return out(r, { ok: false, code: "BANNER_EVENT_GROUP_ID_INVALID" }, 400);
    d = await rpc("kinojo_banner_event_save_v400", {
      p_session_token: t,
      p_event_group_id: rawId || null,
      p_payload: payload,
    });
  } else if (a === "event-publish") {
    const id = txt(b.eventGroupId ?? b.event_group_id, 80);
    if (!K.test(id))
      return out(r, { ok: false, code: "BANNER_EVENT_GROUP_ID_REQUIRED" }, 400);
    d = await rpc("kinojo_banner_event_publish_v400", {
      p_session_token: t,
      p_event_group_id: id,
    });
  } else {
    const id = txt(b.eventGroupId ?? b.event_group_id, 80);
    if (!K.test(id))
      return out(r, { ok: false, code: "BANNER_EVENT_GROUP_ID_REQUIRED" }, 400);
    if (a === "event-move") {
      const direction = txt(b.direction, 12).toUpperCase();
      if (!["UP", "DOWN"].includes(direction))
        return out(r, { ok: false, code: "BANNER_EVENT_MOVE_DIRECTION_INVALID" }, 400);
      d = await rpc("kinojo_banner_event_move_v398", {
        p_session_token: t,
        p_event_group_id: id,
        p_direction: direction,
      });
    } else if (a === "event-playback") {
      const mode = txt(
        b.playbackMode ?? b.playback_mode ?? b.mode,
        16,
      ).toUpperCase();
      if (!["ORDERED", "RANDOM"].includes(mode))
        return out(r, { ok: false, code: "BANNER_EVENT_PLAYBACK_MODE_INVALID" }, 400);
      d = await rpc("kinojo_banner_event_playback_v400", {
        p_session_token: t,
        p_event_group_id: id,
        p_playback_mode: mode,
      });
    } else if (a === "event-pause") {
      d = await rpc("kinojo_banner_event_pause_v398", {
        p_session_token: t,
        p_event_group_id: id,
      });
    } else {
      const expected = txt(b.expectedName ?? b.expected_name, 120);
      if (!expected)
        return out(
          r,
          { ok: false, code: "BANNER_EVENT_DELETE_CONFIRMATION_MISMATCH" },
          400,
        );
      d = await rpc("kinojo_banner_event_delete_v398", {
        p_session_token: t,
        p_event_group_id: id,
        p_expected_name: expected,
      });
    }
  }
  return d.ok === true
    ? out(r, {
        ...d,
        service: S,
        apiVersion: V,
        databaseContract: DB,
        eventWorkflowContract: EVENT,
      })
    : out(r, d, stat(txt(d.code, 80)));
}
function etagMatch(raw: string, etag: string) {
  return raw
    .split(",")
    .map((x) => x.trim())
    .some(
      (x) => x === etag || x.replace(/^W\//, "") === etag.replace(/^W\//, ""),
    );
}
function manifestCache(validUntil: string) {
  const ms = Date.parse(validUntil) - Date.now(),
    ttl = Math.max(0, Math.min(300, Math.floor(ms / 1000)));
  return `public, max-age=${ttl}, s-maxage=${ttl}, must-revalidate`;
}
function manifestOut(r: Request, p: any) {
  const mv = txt(p.manifestVersion, 80) || "none",
    etag = `W/\"kbm-${V}-${mv}\"`,
    cache = manifestCache(txt(p.validUntil, 40)),
    extra = {
      etag: etag,
      "cache-control": cache,
      vary: "Origin, If-None-Match",
    };
  if (etagMatch(txt(r.headers.get("if-none-match"), 500), etag)) {
    const h = hdr(r, extra);
    h["x-kinojo-request-id"] = crypto.randomUUID();
    return new Response(null, { status: 304, headers: h });
  }
  return out(r, p, 200, extra);
}
function publicOverlay(v: any) {
  const x = rec(v);
  if (!x || x.enabled !== true) return { enabled: false };
  const position = txt(x.verticalPosition, 20).toUpperCase(),
    font = txt(x.fontFamily, 30).toUpperCase(),
    textColor = txt(x.textColor, 7).toUpperCase(),
    backgroundColor = txt(x.backgroundColor, 7).toUpperCase();
  if (
    !["TOP", "MIDDLE", "BOTTOM"].includes(position) ||
    !["SYSTEM_SANS", "SYSTEM_SERIF", "SYSTEM_ROUNDED"].includes(font) ||
    !/^#[0-9A-F]{6}$/.test(textColor) ||
    !/^#[0-9A-F]{6}$/.test(backgroundColor)
  )
    return { enabled: false };
  const text = txt(x.text, 300);
  if (!text) return { enabled: false };
  return {
    enabled: true,
    text,
    verticalPosition: position,
    fontFamily: font,
    fontSizePx: Math.max(10, Math.min(96, Math.floor(num(x.fontSizePx) ?? 18))),
    textColor,
    backgroundColor,
    backgroundOpacity: Math.max(
      0,
      Math.min(100, Math.floor(num(x.backgroundOpacity) ?? 65)),
    ),
    heightPercent: Math.max(
      6,
      Math.min(60, Math.floor(num(x.heightPercent) ?? 18)),
    ),
    widthMode: "FULL",
  };
}
async function manifest(r: Request, b: any) {
  const page = txt(b.pageCode ?? b.page_code, 40).toUpperCase(),
    slot = txt(b.slotCode ?? b.slot_code, 20).toUpperCase();
  if (!page || !slot)
    return out(r, { ok: false, code: "BANNER_MANIFEST_TARGET_REQUIRED" }, 400);
  if (
    has(b, [
      "memberId",
      "member_id",
      "assetId",
      "asset_id",
      "campaignId",
      "campaign_id",
      "objectPath",
      "object_path",
      "bucket",
      "upsert",
    ])
  )
    return out(
      r,
      { ok: false, code: "PUBLIC_MANIFEST_SELECTOR_FORBIDDEN" },
      400,
    );
  const d = await rpc("kinojo_banner_manifest_v400", {
    p_page_code: page,
    p_slot_code: slot,
  });
  if (d.ok !== true)
    return out(r, { ok: false, code: txt(d.code, 80) }, stat(txt(d.code, 80)));
  const { url } = ctx(),
    items = [];
  for (const v of Array.isArray(d.playlist) ? d.playlist : []) {
    const x = rec(v);
    if (!x) continue;
    const src = txt(x.sourceType, 20),
      alt = txt(x.alt, 300),
      cr = txt(x.clickUrl, 2048),
      click =
        cr &&
        (/^https:\/\//i.test(cr) ||
          (cr.startsWith("/") && !cr.startsWith("//")))
          ? cr
          : null;
    let imageUrl = "";
    if (src === "STATIC") {
      const p = txt(x.staticPath, 1024);
      if (!/^\/assets\/images\/[A-Za-z0-9._\/-]+$/.test(p) || p.includes(".."))
        continue;
      imageUrl = `https://kinojo.info${p}`;
    } else if (src === "STORAGE") {
      const p = txt(x.objectPath, 1024);
      if (
        !/^\d{4}\/\d{2}\/[0-9a-f-]{36}\.(?:jpg|jpeg|png|webp)$/i.test(p) ||
        p.includes("..")
      )
        continue;
      imageUrl = `${url}/storage/v1/object/public/${B}/${p.split("/").map(encodeURIComponent).join("/")}`;
    } else continue;
    const effect = txt(x.transitionEffect, 20).toUpperCase(),
      direction = txt(x.transitionDirection, 30).toUpperCase();
    items.push({
      imageUrl,
      alt,
      clickUrl: click,
      fitMode: "COVER",
      slideIntervalMs: Math.max(
        3000,
        Math.min(60000, Math.floor(num(x.slideIntervalMs) ?? 8000)),
      ),
      transitionDurationMs: Math.max(
        0,
        Math.min(5000, Math.floor(num(x.transitionDurationMs) ?? 600)),
      ),
      transitionEffect: [
        "NONE",
        "CROSSFADE",
        "SLIDE",
        "SLIDE_FADE",
        "ZOOM",
      ].includes(effect)
        ? effect
        : "CROSSFADE",
      transitionDirection: [
        "NONE",
        "LEFT_TO_RIGHT",
        "RIGHT_TO_LEFT",
        "TOP_TO_BOTTOM",
        "BOTTOM_TO_TOP",
      ].includes(direction)
        ? direction
        : "NONE",
      textOverlay: publicOverlay(x.textOverlay),
    });
  }
  const q = rec(d.rotation),
    slide = Math.max(
      3000,
      Math.min(60000, Math.floor(num(q?.slideIntervalMs) ?? 8000)),
    ),
    transition = Math.max(
      0,
      Math.min(5000, Math.floor(num(q?.transitionDurationMs) ?? 600)),
    ),
    active = d.active === true && items.length > 0;
  return manifestOut(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    eventWorkflowContract: EVENT,
    contract: "banner-public-manifest-v1",
    manifestVersion: txt(d.manifestVersion, 80),
    generatedAtKst: txt(d.generatedAtKst, 40),
    validUntil: txt(d.validUntil, 40),
    pageCode: page,
    slotCode: slot,
    slotKey: txt(d.slotKey, 80) || `${page}:${slot}`,
    active,
    exposureMode: d.exposureMode === "ALL_ACTIVE" ? "ALL_ACTIVE" : "SELECTED",
    exposureFrequencyMode:
      d.exposureFrequencyMode === "BASE_X1_5_X2" ? "BASE_X1_5_X2" : "BASE",
    activeCampaignCount: Math.max(
      0,
      Math.floor(num(d.activeCampaignCount) ?? 0),
    ),
    reason: active
      ? null
      : d.active === true
        ? "NO_RENDERABLE_ITEMS"
        : txt(d.reason, 80) || "NO_ACTIVE_CAMPAIGN",
    rotation: active
      ? { slideIntervalMs: slide, transitionDurationMs: transition }
      : null,
    playlist: items,
  });
}
Deno.serve(async (r) => {
  if (!originOk(r))
    return out(r, { ok: false, code: "ORIGIN_NOT_ALLOWED" }, 403);
  if (r.method === "OPTIONS")
    return new Response(null, { status: 204, headers: hdr(r) });
  try {
    if (r.method === "GET") {
      const u = new URL(r.url),
        b: any = {
          pageCode:
            u.searchParams.get("pageCode") ?? u.searchParams.get("page_code"),
          slotCode:
            u.searchParams.get("slotCode") ?? u.searchParams.get("slot_code"),
        };
      return await manifest(r, b);
    }
    if (r.method !== "POST")
      return out(r, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
    if (
      !txt(r.headers.get("content-type"), 200)
        .toLowerCase()
        .includes("application/json")
    )
      return out(r, { ok: false, code: "JSON_REQUIRED" }, 415);
    const raw = await r.text();
    if (E.encode(raw).length > REQ)
      return out(r, { ok: false, code: "REQUEST_TOO_LARGE" }, 413);
    const b = rec(raw ? JSON.parse(raw) : {}) || {},
      a = txt(b.action, 40) || "health";
    if (rawCred(b))
      return out(r, { ok: false, code: "RAW_CREDENTIAL_FORBIDDEN" }, 400);
    if (a === "health")
      return out(r, {
        ok: true,
        service: S,
        apiVersion: V,
        databaseContract: DB,
        eventWorkflowContract: EVENT,
        uploadContract: UPLOAD,
        masterBoundaryContract: MASTER,
        storageContract: STORAGE,
        authBoundary: "ADMIN_KWS_MASTER_SESSION_PUBLIC_MANIFEST_ANONYMOUS",
        verifyJwt: false,
        maxRequestBytes: REQ,
        http: {
          methods: ["GET", "POST", "OPTIONS"],
          corsOrigins: Array.from(O),
          manifestEtag: true,
          manifest304: true,
          manifestCacheMaxSeconds: 300,
          idempotencyHeader: "Idempotency-Key",
          errorShape: [
            "ok",
            "code",
            "message",
            "service",
            "apiVersion",
            "databaseContract",
          ],
        },
        campaign: {
          timeAuthority: "ASIA_SEOUL_SERVER",
          playlistAuthority: "SERVER",
          exposureMode: "ALL_ACTIVE_PUBLISHED_ITEMS",
          inactiveItemsExcluded: true,
          publicManifestAnonymous: true,
          internalIdsExposed: false,
          publishedMedia: "FLATTENED_COMPOSITE_WHEN_CONTENT_EXISTS",
          editableSourcesRetained: true,
        },
        publicActions: ["manifest"],
        actions: [
          "asset-list",
          "upload-prepare",
          "upload-complete",
          "asset-update",
          "asset-archive",
          "asset-restore",
          "asset-delete",
          "orphan-cleanup",
          "campaign-list",
          "campaign-create",
          "campaign-update",
          "campaign-publish",
          "campaign-pause",
          "campaign-archive",
          "campaign-restore",
          "campaign-delete",
          "event-list",
          "event-save",
          "event-publish",
          "event-move",
          "event-playback",
          "event-pause",
          "event-delete",
          "overlay-asset-list",
          "overlay-upload-prepare",
          "overlay-upload-complete",
          "composite-upload-prepare",
          "composite-upload-complete",
          "manifest",
        ],
      });
    if (a === "manifest") return await manifest(r, b);
    const aa = [
        "asset-list",
        "asset-update",
        "asset-archive",
        "asset-restore",
        "asset-delete",
      ],
      cc = [
        "campaign-list",
        "campaign-create",
        "campaign-update",
        "campaign-publish",
        "campaign-pause",
        "campaign-archive",
        "campaign-restore",
        "campaign-delete",
      ],
      ee = [
        "event-list",
        "event-save",
        "event-publish",
        "event-move",
        "event-playback",
        "event-pause",
        "event-delete",
      ],
      oo = [
        "overlay-asset-list",
        "overlay-upload-prepare",
        "overlay-upload-complete",
        "composite-upload-prepare",
        "composite-upload-complete",
      ],
      allow = [
        ...aa,
        "upload-prepare",
        "upload-complete",
        "orphan-cleanup",
        ...cc,
        ...ee,
        ...oo,
      ];
    if (!allow.includes(a))
      return out(r, { ok: false, code: "UNSUPPORTED_ACTION" }, 400);
    const t = token(b);
    if (!T.test(t))
      return out(r, { ok: false, code: "SESSION_TOKEN_INVALID" }, 401);
    const run = async () => {
      if (a === "upload-prepare") return await prep(r, b, t);
      if (a === "upload-complete") return await complete(r, b, t);
      if (a === "overlay-upload-prepare") return await mediaPrep(r, b, t, "overlay");
      if (a === "overlay-upload-complete") return await overlayComplete(r, b, t);
      if (a === "composite-upload-prepare") return await mediaPrep(r, b, t, "composite");
      if (a === "composite-upload-complete") return await compositeComplete(r, b, t);
      if (a === "overlay-asset-list") return await overlayAssets(r, b, t);
      if (a === "orphan-cleanup") return await orphan(r, b, t);
      if (aa.includes(a)) return await asset(r, b, t, a);
      if (ee.includes(a)) return await event(r, b, t, a);
      return await campaign(r, b, t, a);
    };
    return needsIdem(a, b) ? await idem(r, b, t, a, run) : await run();
  } catch (e) {
    console.error(e);
    return out(r, { ok: false, code: "BANNER_SERVER_ERROR" }, 500);
  }
});
