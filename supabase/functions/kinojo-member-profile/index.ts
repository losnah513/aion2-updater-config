const S = "kinojo-member-profile",
  V = "2.7",
  DB = "375",
  AUTH = "320",
  LIST = "334",
  ACCESS = "336",
  MASTER = "337",
  BOOT = "338",
  BATCH = "375",
  PREP = "1",
  COMP = "339",
  REPL = "340",
  RESET = "341",
  REF_PREP = "1",
  REF_COMP = "357",
  REF_REPL = "351",
  REF_DEL = "354",
  REF_STATE = "357",
  ADMIN_LIST = "367",
  ADMIN_PREVIEW = "371",
  ADMIN_REVIEW = "392",
  ADMIN_REQUEST = "405",
  ADMIN_WORK_QUEUE = "406",
  REQUEST = "404",
  PIX = "B3";
const MAX_REQ = 4096,
  MAX_IMG = 5 * 1024 * 1024,
  TTL = 7200,
  PREVIEW_TTL = 60,
  PB = "kinojo-member-profile",
  RB = "kinojo-member-reference";
const MIMES = ["image/jpeg", "image/png", "image/webp"],
  EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  SLOTS = ["FRONT", "BACK", "UPPER_BODY"];
const PIXELS = {
  PROFILE: [512, 512],
  FRONT: [800, 1200],
  BACK: [800, 1200],
  UPPER_BODY: [800, 1000],
};
const TOKEN = /^kws_[A-Za-z0-9_-]{40,80}$/,
  REQUEST_KEY = /^[A-Za-z0-9_-]{16,96}$/,
  REQUEST_STYLES = [
    "SHONEN_MANGA",
    "ROMANCE_MANGA",
    "ANIMATION",
    "REALISTIC",
    "CUSTOM",
  ],
  enc = new TextEncoder(),
  origins = new Set(["https://kinojo.info", "https://www.kinojo.info"]);
const rec = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null),
  txt = (v, n = 500) =>
    String(v ?? "")
      .trim()
      .slice(0, n),
  num = (v) =>
    v === null || v === undefined || v === ""
      ? null
      : Number.isFinite(Number(v))
        ? Number(v)
        : null,
  pos = (v) => (Number.isInteger(num(v)) && num(v) > 0 ? num(v) : null);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k),
  has = (o, ks) => ks.some((k) => own(o, k));
function ctx() {
  const url = txt(Deno.env.get("SUPABASE_URL"), 500).replace(/\/$/, "");
  let key = txt(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 2200);
  if (!key) {
    try {
      key = txt(
        rec(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"))?.default,
        2200,
      );
    } catch {
      key = "";
    }
  }
  if (!url || !key) throw Error("PROFILE_SERVER_NOT_CONFIGURED");
  return { url, key };
}
function hdr(r) {
  const o = txt(r.headers.get("origin"), 300);
  return {
    "access-control-allow-origin": origins.has(o) ? o : "https://kinojo.info",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers":
      "authorization, apikey, content-type, x-client-info",
    "access-control-max-age": "600",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    vary: "Origin",
    "x-content-type-options": "nosniff",
    "x-kinojo-profile-boundary": "KINOJO_MEMBER_PROFILE_EDGE_V1",
    "x-kinojo-profile-contract": DB,
    "x-kinojo-auth-contract": AUTH,
    "x-kinojo-character-list-contract": LIST,
    "x-kinojo-character-access-contract": ACCESS,
    "x-kinojo-master-boundary-contract": MASTER,
    "x-kinojo-profile-bootstrap-contract": BOOT,
    "x-kinojo-image-batch-bootstrap-contract": BATCH,
    "x-kinojo-profile-upload-prepare-contract": PREP,
    "x-kinojo-profile-upload-complete-contract": COMP,
    "x-kinojo-profile-upload-replace-contract": REPL,
    "x-kinojo-profile-reset-contract": RESET,
    "x-kinojo-reference-upload-prepare-contract": REF_PREP,
    "x-kinojo-reference-upload-complete-contract": REF_COMP,
    "x-kinojo-reference-upload-replace-contract": REF_REPL,
    "x-kinojo-reference-delete-contract": REF_DEL,
    "x-kinojo-reference-state-contract": REF_STATE,
    "x-kinojo-admin-image-preview-contract": ADMIN_PREVIEW,
    "x-kinojo-admin-image-review-contract": ADMIN_REVIEW,
    "x-kinojo-admin-image-request-contract": ADMIN_REQUEST,
    "x-kinojo-admin-image-work-queue-contract": ADMIN_WORK_QUEUE,
    "x-kinojo-image-request-contract": REQUEST,
    "x-kinojo-edited-image-pixel-contract": PIX,
  };
}
const out = (r, b, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: hdr(r) });
async function rpc(n, b) {
  const { url, key } = ctx(),
    res = await fetch(`${url}/rest/v1/rpc/${n}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "x-client-info": `${S}/${V}`,
      },
      body: JSON.stringify(b),
    }),
    raw = await res.text();
  let d = {};
  try {
    d = raw ? JSON.parse(raw) : {};
  } catch {}
  if (!res.ok) throw Error(`RPC_FAILED:${n}`);
  return rec(d) || {};
}
const token = (b) => txt(b.sessionToken ?? b.session_token, 120),
  cid = (b) => pos(b.characterId ?? b.character_id),
  referenceSlot = (b) => {
    const s = txt(b.slot ?? b.referenceSlot ?? b.reference_slot, 40);
    return SLOTS.includes(s) ? s : "";
  },
  adminPreviewSlot = (b) => {
    const s = txt(b.slot ?? b.imageSlot ?? b.image_slot, 40).toUpperCase();
    return s === "PROFILE" || SLOTS.includes(s) ? s : "";
  };
const rawCred = (b) => has(b, ["passKey", "pass_key", "passCode", "pass_code"]),
  memberSel = (b) =>
    has(b, ["memberId", "member_id", "targetMemberId", "target_member_id"]),
  adminMid = (b) => pos(b.memberId ?? b.member_id),
  charAlias = (b) =>
    has(b, [
      "targetCharacterId",
      "target_character_id",
      "serverId",
      "server_id",
      "characterName",
      "character_name",
      "serverName",
      "server_name",
    ]);
const prepStorage = (b) =>
    has(b, [
      "bucket",
      "bucketId",
      "bucket_id",
      "objectPath",
      "object_path",
      "uploadUrl",
      "upload_url",
      "upsert",
    ]),
  compStorage = (b) =>
    has(b, [
      "bucket",
      "bucketId",
      "bucket_id",
      "uploadUrl",
      "upload_url",
      "upsert",
    ]);
function member(v) {
  const x = rec(v) || {};
  return {
    id: num(x.id),
    mainCharacterName: txt(x.mainCharacterName ?? x.main_character_name, 120),
    role: txt(x.role, 40),
    roleLabel: txt(x.roleLabel ?? x.role_label, 80),
    level: num(x.level) ?? 0,
  };
}
function ch(v) {
  const x = { ...(rec(v) || {}) };
  x.characterId = num(x.characterId);
  x.serverId = num(x.serverId);
  x.mainCharacterId = num(x.mainCharacterId);
  x.listRow = num(x.listRow);
  x.latestPveItemLevel = num(x.latestPveItemLevel);
  x.latestPveCombatPower = num(x.latestPveCombatPower);
  x.latestPvpItemLevel = num(x.latestPvpItemLevel);
  x.latestPvpCombatPower = num(x.latestPvpCombatPower);
  x.latestItemLevelTotal = num(x.latestItemLevelTotal);
  x.latestPowerTotal = num(x.latestPowerTotal);
  x.displayItemLevel = x.latestPveItemLevel;
  x.displayCombatPower = x.latestPveCombatPower;
  x.displayStatBasis = "PVE";
  return x;
}
function profile(v, c) {
  const x = rec(v) || {},
    o = rec(x.override),
    official = txt(
      x.officialProfileImageUrl ?? c?.officialProfileImageUrl,
      1000,
    ),
    ov =
      x.hasOverride === true && o
        ? {
            objectPath: txt(o.objectPath, 1000),
            mimeType: txt(o.mimeType, 120),
            sizeBytes: num(o.sizeBytes),
            uploadedAt: txt(o.uploadedAt, 80),
          }
        : null,
    src =
      txt(x.effectiveSource, 40) === "USER_OVERRIDE" && ov?.objectPath
        ? "USER_OVERRIDE"
        : "OFFICIAL";
  return {
    officialProfileImageUrl: official,
    hasOverride: src === "USER_OVERRIDE",
    override: src === "USER_OVERRIDE" ? ov : null,
    effectiveSource: src,
    effectiveProfileImageUrl:
      src === "USER_OVERRIDE"
        ? `${ctx().url}/storage/v1/object/public/${PB}/${ov.objectPath.split("/").map(encodeURIComponent).join("/")}`
        : official,
    canResetToOfficial: src === "USER_OVERRIDE",
  };
}
function status(c) {
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
  if (
    ["CHARACTER_NOT_OWNED", "TARGET_CHARACTER_NOT_OWNED", "MASTER_REQUIRED"].includes(
      c,
    )
  )
    return 403;
  if (
    [
      "TARGET_MEMBER_NOT_FOUND",
      "REQUEST_NOT_FOUND",
      "REQUEST_IMAGE_NOT_FOUND",
      "REQUEST_IMAGE_EXPIRED",
    ].includes(c)
  )
    return 404;
  if (
    [
      "OWNER_NOT_RESOLVED",
      "OWNER_AMBIGUOUS",
      "MEMBER_BINDING_MISMATCH",
      "CHARACTER_LIST_FAILED",
      "PROFILE_OVERRIDE_EXISTS",
      "PROFILE_OVERRIDE_NOT_FOUND",
      "PROFILE_REPLACEMENT_SAME_OBJECT",
      "PROFILE_OBJECT_PATH_CONFLICT",
      "PROFILE_UPLOAD_OBJECT_NOT_FOUND",
      "PROFILE_UPLOAD_MIME_MISMATCH",
      "PROFILE_UPLOAD_SIZE_MISMATCH",
      "PROFILE_UPLOAD_PIXELS_MISMATCH",
      "REFERENCE_SLOT_EXISTS",
      "REFERENCE_SLOT_NOT_FOUND",
      "REFERENCE_REPLACEMENT_SAME_OBJECT",
      "REFERENCE_OBJECT_PATH_CONFLICT",
      "REFERENCE_UPLOAD_OBJECT_NOT_FOUND",
      "REFERENCE_UPLOAD_MIME_MISMATCH",
      "REFERENCE_UPLOAD_SIZE_MISMATCH",
      "REFERENCE_UPLOAD_PIXELS_MISMATCH",
      "REFERENCE_DELETE_OBJECT_INVALID",
      "REFERENCE_DELETE_CONFLICT",
      "REFERENCE_EXPIRED_OBJECT_REUSE_FORBIDDEN",
      "REQUEST_IDEMPOTENCY_CONFLICT",
      "REQUEST_CONCURRENT_RETRY",
      "REQUEST_DRAFT_EXPIRED",
      "REQUEST_STATUS_CONFLICT",
      "REQUEST_REFERENCE_CONFLICT",
      "REQUEST_VERIFICATION_INCOMPLETE",
      "REQUEST_VERIFICATION_MISMATCH",
      "REQUEST_STATUS_TRANSITION_INVALID",
    ].includes(c)
  )
    return 409;
  return 400;
}
function file(b) {
  const m = txt(b.mimeType ?? b.mime_type, 120).toLowerCase(),
    z = pos(b.sizeBytes ?? b.size_bytes);
  if (m !== "image/webp")
    return {
      ok: false,
      code: "EDITED_WEBP_REQUIRED",
      message: "편집 완료된 WebP 결과만 업로드할 수 있습니다.",
    };
  if (z === null || z > MAX_IMG)
    return {
      ok: false,
      code: "IMAGE_SIZE_INVALID",
      message: "프로필 이미지는 5MB 이하만 업로드할 수 있습니다.",
    };
  return { ok: true, mimeType: m, sizeBytes: z, ext: "webp" };
}
function referenceFile(b) {
  const f = file(b);
  if (!f.ok && f.code === "IMAGE_SIZE_INVALID")
    return {
      ...f,
      message: "참고 이미지는 장당 5MB 이하만 업로드할 수 있습니다.",
    };
  return f;
}
function imageRequestInput(b) {
  const c = cid(b),
    key = String(b.idempotencyKey ?? b.idempotency_key ?? "").trim(),
    rawStyle = b.styleCode ?? b.style_code,
    style =
      rawStyle === null ||
      rawStyle === undefined ||
      String(rawStyle).trim() === ""
        ? null
        : String(rawStyle).trim().toUpperCase(),
    note = String(b.requestNote ?? b.request_note ?? "").trim(),
    rows = Array.isArray(b.items) ? b.items : null;
  if (c === null) return { ok: false, code: "CHARACTER_ID_REQUIRED" };
  if (!REQUEST_KEY.test(key))
    return { ok: false, code: "REQUEST_IDEMPOTENCY_KEY_INVALID" };
  if (style !== null && !REQUEST_STYLES.includes(style))
    return { ok: false, code: "REQUEST_STYLE_INVALID" };
  if (note.length > 300) return { ok: false, code: "REQUEST_NOTE_TOO_LONG" };
  if (style === "CUSTOM" && !note)
    return { ok: false, code: "REQUEST_CUSTOM_NOTE_REQUIRED" };
  if (!rows || rows.length < 1 || rows.length > 3)
    return { ok: false, code: "REQUEST_IMAGE_COUNT_INVALID" };
  const seen = new Set(),
    items = [];
  for (const row of rows) {
    const x = rec(row);
    if (
      !x ||
      has(x, [
        "bucket",
        "bucketId",
        "bucket_id",
        "objectPath",
        "object_path",
        "uploadUrl",
        "upload_url",
        "upsert",
      ])
    )
      return { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" };
    const slot = txt(x.slot, 40),
      f = referenceFile(x);
    if (!SLOTS.includes(slot))
      return { ok: false, code: "REQUEST_SLOT_INVALID" };
    if (seen.has(slot)) return { ok: false, code: "REQUEST_SLOT_DUPLICATE" };
    if (!f.ok) return { ok: false, code: f.code, message: f.message, slot };
    seen.add(slot);
    items.push({ slot, mimeType: f.mimeType, sizeBytes: f.sizeBytes });
  }
  return {
    ok: true,
    characterId: c,
    idempotencyKey: key,
    styleCode: style,
    requestNote: note,
    items,
  };
}
function imageRequestPublic(d, fallbackSlots = []) {
  const slots = (Array.isArray(d.slots) ? d.slots : fallbackSlots)
    .map((x) => txt(x, 40))
    .filter((x) => SLOTS.includes(x));
  return {
    requestId: pos(d.requestId),
    status: txt(d.status, 40),
    styleCode: d.styleCode === null ? null : txt(d.styleCode, 40),
    requestNote: txt(d.requestNote, 300),
    submittedAt: txt(d.submittedAt, 80) || null,
    imageExpiresAt: txt(d.imageExpiresAt, 80),
    metadataExpiresAt: txt(d.metadataExpiresAt, 80),
    slots,
  };
}
const pathFor = (c, e) =>
  `characters/${c}/${crypto.randomUUID().replaceAll("-", "")}.${e}`;
const referencePathFor = (c, s, e) =>
  `characters/${c}/${s}/${crypto.randomUUID().replaceAll("-", "")}.${e}`;
function validPath(c, p, m) {
  const q = /^characters\/(\d+)\/([0-9a-f]{32})\.(jpg|png|webp)$/.exec(
    txt(p, 1024),
  );
  return !!q && Number(q[1]) === c && q[3] === EXT[m];
}
function validReferencePath(c, s, p, m) {
  const q =
    /^characters\/(\d+)\/(FRONT|BACK|UPPER_BODY)\/([0-9a-f]{32})\.(jpg|png|webp)$/.exec(
      txt(p, 1024),
    );
  return !!q && Number(q[1]) === c && q[2] === s && q[4] === EXT[m];
}
async function owned(t, c) {
  const d = await rpc("kinojo_member_character_access_v336", {
    p_session_token: t,
    p_character_id: c,
  });
  if (d.ok !== true) return { ok: false, d };
  const m = member(d.member),
    k = ch(d.character);
  if (k.characterId !== c || m.id !== num(d.memberId))
    throw Error("CHARACTER_ACCESS_BINDING_MISMATCH");
  return { ok: true, d, m, k };
}
async function sign(bucket, p, prefix = "PROFILE") {
  const { url, key } = ctx(),
    e = p.split("/").map(encodeURIComponent).join("/"),
    r = await fetch(`${url}/storage/v1/object/upload/sign/${bucket}/${e}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "x-client-info": `${S}/${V}`,
      },
      body: JSON.stringify({ upsert: false }),
    }),
    raw = await r.text();
  let d = null;
  try {
    d = rec(raw ? JSON.parse(raw) : {});
  } catch {}
  if (!r.ok || !d) throw Error(`${prefix}_SIGNED_UPLOAD_CREATE_FAILED`);
  let u = txt(d.url ?? d.signedURL ?? d.signedUrl, 3000);
  if (!u) throw Error(`${prefix}_SIGNED_UPLOAD_URL_MISSING`);
  u = u.startsWith("/object/")
    ? `/storage/v1${u}`
    : u.startsWith("object/")
      ? `/storage/v1/${u}`
      : u;
  const x = new URL(u, url);
  if (
    x.origin !== new URL(url).origin ||
    !x.pathname.startsWith(`/storage/v1/object/upload/sign/${bucket}/`)
  )
    throw Error(`${prefix}_SIGNED_UPLOAD_URL_INVALID`);
  return x.toString();
}
async function signPreview(bucket, p, seconds) {
  const ttl = Math.max(
      1,
      Math.min(PREVIEW_TTL, Math.floor(Number(seconds) || 0)),
    ),
    { url, key } = ctx(),
    e = p.split("/").map(encodeURIComponent).join("/"),
    r = await fetch(`${url}/storage/v1/object/sign/${bucket}/${e}`, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "x-client-info": `${S}/${V}`,
      },
      body: JSON.stringify({ expiresIn: ttl }),
    }),
    raw = await r.text();
  let d = null;
  try {
    d = rec(raw ? JSON.parse(raw) : {});
  } catch {}
  if (!r.ok || !d) throw Error("ADMIN_IMAGE_PREVIEW_SIGN_FAILED");
  let u = txt(d.signedURL ?? d.signedUrl ?? d.url, 4000);
  if (!u) throw Error("ADMIN_IMAGE_PREVIEW_URL_MISSING");
  u = u.startsWith("/object/")
    ? `/storage/v1${u}`
    : u.startsWith("object/")
      ? `/storage/v1/${u}`
      : u;
  const x = new URL(u, url);
  if (
    x.origin !== new URL(url).origin ||
    !x.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`) ||
    !x.searchParams.get("token") ||
    x.searchParams.has("download")
  )
    throw Error("ADMIN_IMAGE_PREVIEW_URL_INVALID");
  return { url: x.toString(), expiresInSeconds: ttl };
}
async function signDownload(bucket, p, seconds, filename) {
  const ttl = Math.max(
      1,
      Math.min(PREVIEW_TTL, Math.floor(Number(seconds) || 0)),
    ),
    name = txt(filename, 180),
    { url, key } = ctx();
  if (!/^[A-Za-z0-9._-]{1,180}$/.test(name))
    throw Error("ADMIN_IMAGE_REQUEST_DOWNLOAD_FILENAME_INVALID");
  const e = p.split("/").map(encodeURIComponent).join("/"),
    r = await fetch(url + "/storage/v1/object/sign/" + bucket + "/" + e, {
      method: "POST",
      headers: {
        apikey: key,
        authorization: "Bearer " + key,
        "content-type": "application/json",
        "x-client-info": S + "/" + V,
      },
      body: JSON.stringify({ expiresIn: ttl }),
    }),
    raw = await r.text();
  let d = null;
  try {
    d = rec(raw ? JSON.parse(raw) : {});
  } catch {}
  if (!r.ok || !d) throw Error("ADMIN_IMAGE_REQUEST_DOWNLOAD_SIGN_FAILED");
  let u = txt(d.signedURL ?? d.signedUrl ?? d.url, 4000);
  if (!u) throw Error("ADMIN_IMAGE_REQUEST_DOWNLOAD_URL_MISSING");
  u = u.startsWith("/object/")
    ? "/storage/v1" + u
    : u.startsWith("object/")
      ? "/storage/v1/" + u
      : u;
  const x = new URL(u, url);
  if (
    x.origin !== new URL(url).origin ||
    !x.pathname.startsWith("/storage/v1/object/sign/" + bucket + "/") ||
    !x.searchParams.get("token")
  )
    throw Error("ADMIN_IMAGE_REQUEST_DOWNLOAD_URL_INVALID");
  x.searchParams.set("download", name);
  if (x.searchParams.get("download") !== name)
    throw Error("ADMIN_IMAGE_REQUEST_DOWNLOAD_URL_INVALID");
  return { url: x.toString(), expiresInSeconds: ttl, filename: name };
}
function webpPixels(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0),
    u32 = (o) =>
      (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0,
    u24 = (o) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16),
    tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 20 || tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  for (let o = 12; o + 8 <= b.length; ) {
    const kind = tag(o),
      size = u32(o + 4),
      d = o + 8;
    if (d + size > b.length) return null;
    if (kind === "VP8X" && size >= 10)
      return { width: 1 + u24(d + 4), height: 1 + u24(d + 7), format: kind };
    if (kind === "VP8L" && size >= 5 && b[d] === 47) {
      const bits =
        (b[d + 1] | (b[d + 2] << 8) | (b[d + 3] << 16) | (b[d + 4] << 24)) >>>
        0;
      return {
        width: (bits & 16383) + 1,
        height: ((bits >>> 14) & 16383) + 1,
        format: kind,
      };
    }
    if (
      kind === "VP8 " &&
      size >= 10 &&
      b[d + 3] === 157 &&
      b[d + 4] === 1 &&
      b[d + 5] === 42
    )
      return {
        width: (b[d + 6] | (b[d + 7] << 8)) & 16383,
        height: (b[d + 8] | (b[d + 9] << 8)) & 16383,
        format: "VP8",
      };
    o = d + size + (size & 1);
  }
  return null;
}
function pixelResult(bytes, slot) {
  const expected = PIXELS[slot],
    actual = webpPixels(bytes);
  return {
    ok:
      !!actual && actual.width === expected[0] && actual.height === expected[1],
    slot,
    expectedWidth: expected[0],
    expectedHeight: expected[1],
    width: actual?.width ?? null,
    height: actual?.height ?? null,
    format: actual?.format ?? null,
  };
}
async function readStorageObj(bucket, p, prefix, message) {
  const { url, key } = ctx(),
    e = p.split("/").map(encodeURIComponent).join("/"),
    r = await fetch(`${url}/storage/v1/object/${bucket}/${e}`, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "x-client-info": `${S}/${V}`,
      },
    });
  if (!r.ok) {
    if (r.status === 400 || r.status === 404)
      return { ok: false, code: `${prefix}_UPLOAD_OBJECT_NOT_FOUND`, message };
    throw Error(`${prefix}_UPLOAD_OBJECT_READ_FAILED`);
  }
  const raw = await r.arrayBuffer(),
    bytes = new Uint8Array(raw);
  return {
    ok: true,
    mimeType: txt(r.headers.get("content-type"), 120)
      .split(";", 1)[0]
      .trim()
      .toLowerCase(),
    sizeBytes: bytes.byteLength,
    bytes,
  };
}
const readObj = (p) =>
  readStorageObj(
    PB,
    p,
    "PROFILE",
    "업로드된 프로필 이미지를 확인하지 못했습니다.",
  );
const readReferenceObj = (p) =>
  readStorageObj(
    RB,
    p,
    "REFERENCE",
    "업로드된 참고 이미지를 확인하지 못했습니다.",
  );
async function delStorageObj(bucket, p) {
  if (!txt(p, 1024)) return true;
  const { url, key } = ctx(),
    e = p.split("/").map(encodeURIComponent).join("/"),
    r = await fetch(`${url}/storage/v1/object/${bucket}/${e}`, {
      method: "DELETE",
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "x-client-info": `${S}/${V}`,
      },
    });
  return r.ok || r.status === 400 || r.status === 404;
}
const delObj = (p) => delStorageObj(PB, p);
const delReferenceObj = (p) => delStorageObj(RB, p);
async function delOld(p) {
  for (let i = 0; i < 2; i++) {
    if (await delObj(p)) return true;
    if (i === 0) await new Promise((x) => setTimeout(x, 120));
  }
  return false;
}
async function delOldReference(p) {
  for (let i = 0; i < 2; i++) {
    if (await delReferenceObj(p)) return true;
    if (i === 0) await new Promise((x) => setTimeout(x, 120));
  }
  return false;
}
async function adminImagePreview(r, b, t) {
  if (has(b, ["targetMemberId", "target_member_id"]))
    return out(r, { ok: false, code: "CLIENT_MEMBER_SELECTOR_FORBIDDEN" }, 400);
  if (charAlias(b) || prepStorage(b) || compStorage(b))
    return out(
      r,
      {
        ok: false,
        code: charAlias(b)
          ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
          : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  if (
    has(b, [
      "mimeType",
      "mime_type",
      "sizeBytes",
      "size_bytes",
      "expiresAt",
      "expires_at",
    ])
  )
    return out(r, { ok: false, code: "CLIENT_IMAGE_METADATA_FORBIDDEN" }, 400);
  const m = adminMid(b),
    c = cid(b),
    slot = adminPreviewSlot(b);
  if (m === null)
    return out(
      r,
      {
        ok: false,
        code: "TARGET_MEMBER_ID_REQUIRED",
        message: "조회할 회원 식별값이 필요합니다.",
      },
      400,
    );
  if (c === null)
    return out(
      r,
      {
        ok: false,
        code: "TARGET_CHARACTER_ID_REQUIRED",
        message: "조회할 캐릭터 식별값이 필요합니다.",
      },
      400,
    );
  if (!slot)
    return out(
      r,
      {
        ok: false,
        code: "TARGET_IMAGE_SLOT_INVALID",
        message:
          "PROFILE, FRONT, BACK, UPPER_BODY 이미지만 미리볼 수 있습니다.",
      },
      400,
    );
  const d = await rpc("kinojo_admin_member_image_preview_v371", {
    p_session_token: t,
    p_member_id: m,
    p_character_id: c,
    p_slot: slot,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "ADMIN_MEMBER_IMAGE_PREVIEW_FAILED",
      st = [
        "SESSION_TOKEN_REQUIRED",
        "SESSION_TOKEN_INVALID",
        "SESSION_INVALID",
        "SESSION_NOT_FOUND",
        "SESSION_EXPIRED",
        "SESSION_REVOKED",
        "SESSION_MEMBER_INVALID",
      ].includes(x)
        ? 401
        : ["MASTER_REQUIRED", "TARGET_CHARACTER_NOT_OWNED"].includes(x)
          ? 403
          : [
                "TARGET_MEMBER_NOT_FOUND",
                "PROFILE_OVERRIDE_NOT_FOUND",
                "REFERENCE_SLOT_NOT_FOUND",
              ].includes(x)
            ? 404
            : 400;
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        databaseContract: DB,
        masterBoundaryContract: MASTER,
        adminImagePreviewContract: ADMIN_PREVIEW,
        contract: "admin-member-image-preview-api-v1",
        code: x,
        message: txt(d.message, 300),
      },
      st,
    );
  }
  if (
    num(d.targetMemberId) !== m ||
    num(d.characterId) !== c ||
    txt(d.slot, 40) !== slot
  )
    throw Error("ADMIN_MEMBER_IMAGE_PREVIEW_BINDING_MISMATCH");
  const bucket = txt(d.bucket, 120),
    path = txt(d.objectPath, 1024),
    mime = txt(d.mimeType, 120).toLowerCase();
  if (!MIMES.includes(mime))
    throw Error("ADMIN_MEMBER_IMAGE_PREVIEW_MIME_INVALID");
  if (slot === "PROFILE") {
    if (bucket !== PB || !validPath(c, path, mime))
      throw Error("ADMIN_MEMBER_IMAGE_PREVIEW_PATH_INVALID");
  } else {
    if (bucket !== RB || !validReferencePath(c, slot, path, mime))
      throw Error("ADMIN_MEMBER_IMAGE_PREVIEW_PATH_INVALID");
  }
  let ttl = PREVIEW_TTL,
    expiresAt = txt(d.expiresAt, 80);
  if (slot !== "PROFILE") {
    const remaining = Math.floor(
      (new Date(expiresAt).getTime() - Date.now()) / 1000,
    );
    if (!Number.isFinite(remaining) || remaining <= 0)
      return out(
        r,
        {
          ok: false,
          service: S,
          apiVersion: V,
          databaseContract: DB,
          adminImagePreviewContract: ADMIN_PREVIEW,
          contract: "admin-member-image-preview-api-v1",
          code: "REFERENCE_SLOT_NOT_FOUND",
          message: "현재 활성 상태인 참고 이미지가 없습니다.",
        },
        404,
      );
    ttl = Math.min(PREVIEW_TTL, remaining);
  }
  const signed = await signPreview(bucket, path, ttl);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    characterListContract: LIST,
    adminImagePreviewContract: ADMIN_PREVIEW,
    contract: "admin-member-image-preview-api-v1",
    privacy: "SIGNED_PREVIEW_URL_ONLY_NO_OBJECT_PATH",
    purpose: "INLINE_PREVIEW_ONLY",
    targetMemberId: m,
    characterId: c,
    slot,
    mimeType: mime,
    sizeBytes: num(d.sizeBytes),
    uploadedAt: txt(d.uploadedAt, 80),
    expiresAt: expiresAt || null,
    preview: {
      url: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
      download: false,
    },
  });
}
async function adminImageList(r, b, t) {
  if (has(b, ["targetMemberId", "target_member_id"]))
    return out(r, { ok: false, code: "CLIENT_MEMBER_SELECTOR_FORBIDDEN" }, 400);
  if (charAlias(b) || prepStorage(b) || compStorage(b))
    return out(
      r,
      {
        ok: false,
        code: charAlias(b)
          ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
          : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  const m = adminMid(b);
  if (m === null)
    return out(
      r,
      {
        ok: false,
        code: "TARGET_MEMBER_ID_REQUIRED",
        message: "조회할 회원 식별값이 필요합니다.",
      },
      400,
    );
  const d = await rpc("kinojo_admin_member_image_list_v367", {
    p_session_token: t,
    p_member_id: m,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "ADMIN_MEMBER_IMAGE_LIST_FAILED";
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        databaseContract: DB,
        masterBoundaryContract: MASTER,
        adminImageListContract: ADMIN_LIST,
        contract: "admin-member-image-list-api-v1",
        code: x,
        message: txt(d.message, 300),
      },
      status(x),
    );
  }
  if (num(d.targetMember?.id) !== m)
    throw Error("ADMIN_MEMBER_IMAGE_LIST_BINDING_MISMATCH");
  const cs = (Array.isArray(d.characters) ? d.characters : [])
    .map((v) => {
      const x = rec(v) || {},
        p = rec(x.profile) || {},
        o = rec(p.override),
        refs = (Array.isArray(x.references) ? x.references : [])
          .map((z) => {
            const q = rec(z) || {},
              slot = txt(q.slot, 40);
            return SLOTS.includes(slot)
              ? {
                  slot,
                  mimeType: txt(q.mimeType, 120),
                  sizeBytes: num(q.sizeBytes),
                  uploadedAt: txt(q.uploadedAt, 80),
                  expiresAt: txt(q.expiresAt, 80),
                  retentionDays: num(q.retentionDays) ?? 7,
                  active: q.active === true,
                }
              : null;
          })
          .filter(Boolean)
          .slice(0, 3);
      return {
        characterId: num(x.characterId),
        serverId: num(x.serverId),
        serverName: txt(x.serverName, 120),
        characterName: txt(x.characterName, 120),
        className: txt(x.className, 80),
        isMain: x.isMain === true,
        mainCharacterId: num(x.mainCharacterId),
        profile: {
          officialProfileImageUrl: txt(p.officialProfileImageUrl, 1000),
          hasOverride: p.hasOverride === true,
          effectiveSource:
            txt(p.effectiveSource, 40) === "USER_OVERRIDE"
              ? "USER_OVERRIDE"
              : "OFFICIAL",
          override:
            p.hasOverride === true && o
              ? {
                  mimeType: txt(o.mimeType, 120),
                  sizeBytes: num(o.sizeBytes),
                  uploadedAt: txt(o.uploadedAt, 80),
                }
              : null,
        },
        referenceCount: refs.length,
        references: refs,
      };
    })
    .filter((x) => Number.isInteger(x.characterId) && x.characterId > 0);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    characterListContract: LIST,
    adminImageListContract: ADMIN_LIST,
    contract: "admin-member-image-list-api-v1",
    logicalExpiry: "EXPIRES_AT_GT_NOW_ONLY",
    privacy: "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS",
    targetMember: d.targetMember ?? null,
    ownerResolved: d.ownerResolved === true,
    code: txt(d.code, 80),
    owner: d.owner ?? null,
    characterCount: cs.length,
    profileOverrideCount: num(d.profileOverrideCount) ?? 0,
    referenceCount: cs.reduce((n, x) => n + x.referenceCount, 0),
    characters: cs,
  });
}
function adminImageWorkQueueItemPublic(v) {
  const x = rec(v) || {},
    itemType = txt(x.itemType, 40).toUpperCase(),
    memberId = pos(x.memberId),
    characterNames = (
      Array.isArray(x.characterNames) ? x.characterNames : []
    )
      .map((name) => txt(name, 120))
      .filter(Boolean)
      .slice(0, 50);
  if (memberId === null) return null;
  if (itemType === "IMAGE_REVIEW") {
    const latest = rec(x.latestImage) || {};
    return {
      itemType,
      memberId,
      mainCharacterName: txt(x.mainCharacterName, 120),
      role: txt(x.role, 40),
      roleLabel: txt(x.roleLabel, 80),
      level: num(x.level) ?? 0,
      isActive: x.isActive === true,
      imageCount: Math.max(0, num(x.imageCount) ?? 0),
      profileImageCount: Math.max(0, num(x.profileImageCount) ?? 0),
      referenceImageCount: Math.max(0, num(x.referenceImageCount) ?? 0),
      characterCount: Math.max(0, num(x.characterCount) ?? 0),
      characterNames,
      latestUploadedAt: txt(x.latestUploadedAt, 80),
      activityAt: txt(x.activityAt, 80),
      latestImage: {
        kind: txt(latest.kind, 20),
        characterId: pos(latest.characterId),
        characterName: txt(latest.characterName, 120),
        slot: txt(latest.slot, 40),
        uploadedAt: txt(latest.uploadedAt, 80),
      },
      reviewedThrough: txt(x.reviewedThrough, 80) || null,
      reviewedAt: txt(x.reviewedAt, 80) || null,
      pending: x.pending === true,
    };
  }
  if (itemType !== "PRODUCTION_REQUEST") return null;
  const requestId = pos(x.requestId),
    characterId = pos(x.characterId),
    statusValue = txt(x.status, 40).toUpperCase(),
    slots = (Array.isArray(x.slots) ? x.slots : [])
      .map((slot) => txt(slot, 40).toUpperCase())
      .filter((slot) => SLOTS.includes(slot));
  if (
    requestId === null ||
    characterId === null ||
    !["SUBMITTED", "IN_PROGRESS", "COMPLETED", "REJECTED"].includes(
      statusValue,
    )
  )
    return null;
  return {
    itemType,
    memberId,
    mainCharacterName: txt(x.mainCharacterName, 120),
    role: txt(x.role, 40),
    roleLabel: txt(x.roleLabel, 80),
    level: num(x.level) ?? 0,
    isActive: x.isActive === true,
    characterId,
    characterName: txt(x.characterName, 120),
    serverName: txt(x.serverName, 120),
    className: txt(x.className, 120),
    requestId,
    styleCode: REQUEST_STYLES.includes(txt(x.styleCode, 40).toUpperCase())
      ? txt(x.styleCode, 40).toUpperCase()
      : null,
    status: statusValue,
    submittedAt: txt(x.submittedAt, 80) || null,
    updatedAt: txt(x.updatedAt, 80) || null,
    activityAt: txt(x.activityAt, 80) || null,
    imageExpiresAt: txt(x.imageExpiresAt, 80) || null,
    metadataExpiresAt: txt(x.metadataExpiresAt, 80) || null,
    itemCount: Math.max(0, num(x.itemCount) ?? slots.length),
    availableImageCount: Math.max(0, num(x.availableImageCount) ?? 0),
    slots,
  };
}
async function adminImageWorkQueueList(r, b, t) {
  if (memberSel(b) || charAlias(b) || prepStorage(b) || compStorage(b))
    return out(
      r,
      {
        ok: false,
        code: memberSel(b)
          ? "CLIENT_MEMBER_SELECTOR_FORBIDDEN"
          : charAlias(b)
            ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
            : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  const queueFilter =
    txt(b.filter ?? b.queueFilter ?? b.queue_filter, 40).toUpperCase() ||
    "ACTION_REQUIRED";
  if (
    ![
      "ACTION_REQUIRED",
      "IMAGE_REVIEW",
      "PRODUCTION_REQUEST",
      "COMPLETED",
      "ALL",
    ].includes(queueFilter)
  )
    return out(
      r,
      {
        ok: false,
        code: "WORK_QUEUE_FILTER_INVALID",
        message: "지원하지 않는 이미지 작업 필터입니다.",
      },
      400,
    );
  const search = txt(b.search ?? b.query, 120) || null,
    limit = Math.max(1, Math.min(200, Math.floor(Number(b.limit) || 100)));
  const d = await rpc("kinojo_admin_member_image_work_queue_v406", {
    p_session_token: t,
    p_filter: queueFilter,
    p_search: search,
    p_limit: limit,
  });
  if (d.ok !== true) {
    const code = txt(d.code, 80) || "ADMIN_MEMBER_IMAGE_WORK_QUEUE_FAILED";
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        databaseContract: DB,
        masterBoundaryContract: MASTER,
        adminImageWorkQueueContract: ADMIN_WORK_QUEUE,
        contract: "admin-member-image-work-queue-api-v1",
        code,
        message: txt(d.message, 300),
      },
      status(code),
    );
  }
  if (
    txt(d.contract, 120) !== "admin-member-image-work-queue-v406" ||
    txt(d.privacy, 120) !== "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS" ||
    txt(d.filter, 40) !== queueFilter
  )
    throw Error("ADMIN_MEMBER_IMAGE_WORK_QUEUE_CONTRACT_MISMATCH");
  const items = (Array.isArray(d.items) ? d.items : [])
    .map(adminImageWorkQueueItemPublic)
    .filter(Boolean);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    adminImageWorkQueueContract: ADMIN_WORK_QUEUE,
    contract: "admin-member-image-work-queue-api-v1",
    privacy: "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS",
    filter: queueFilter,
    pendingUploadCount: Math.max(0, num(d.pendingUploadCount) ?? 0),
    activeRequestCount: Math.max(0, num(d.activeRequestCount) ?? 0),
    actionRequiredCount: Math.max(0, num(d.actionRequiredCount) ?? 0),
    totalUploaderCount: Math.max(0, num(d.totalUploaderCount) ?? 0),
    rowCount: items.length,
    items,
  });
}
async function adminImageReviewList(r, b, t) {
  if (memberSel(b) || charAlias(b) || prepStorage(b) || compStorage(b))
    return out(
      r,
      {
        ok: false,
        code: memberSel(b)
          ? "CLIENT_MEMBER_SELECTOR_FORBIDDEN"
          : charAlias(b)
            ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
            : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  const reviewStatus =
    txt(b.status ?? b.reviewStatus ?? b.review_status, 20).toUpperCase() ||
    "PENDING";
  if (!["PENDING", "REVIEWED", "ALL"].includes(reviewStatus))
    return out(
      r,
      {
        ok: false,
        code: "REVIEW_STATUS_INVALID",
        message: "PENDING, REVIEWED, ALL 상태만 조회할 수 있습니다.",
      },
      400,
    );
  const search = txt(b.search ?? b.query, 120) || null,
    limit = Math.max(1, Math.min(200, Math.floor(Number(b.limit) || 100)));
  const d = await rpc("kinojo_admin_member_image_review_list_v392", {
    p_session_token: t,
    p_status: reviewStatus,
    p_search: search,
    p_limit: limit,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "ADMIN_MEMBER_IMAGE_REVIEW_LIST_FAILED";
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        databaseContract: DB,
        masterBoundaryContract: MASTER,
        adminImageReviewContract: ADMIN_REVIEW,
        contract: "admin-member-image-review-list-api-v1",
        code: x,
        message: txt(d.message, 300),
      },
      status(x),
    );
  }
  if (txt(d.privacy, 120) !== "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS")
    throw Error("ADMIN_MEMBER_IMAGE_REVIEW_PRIVACY_MISMATCH");
  const items = (Array.isArray(d.items) ? d.items : [])
    .map((v) => {
      const x = rec(v) || {},
        latest = rec(x.latestImage) || {},
        memberId = num(x.memberId),
        characterNames = (
          Array.isArray(x.characterNames) ? x.characterNames : []
        )
          .map((name) => txt(name, 120))
          .filter(Boolean)
          .slice(0, 50);
      return Number.isInteger(memberId) && memberId > 0
        ? {
            memberId,
            mainCharacterName: txt(x.mainCharacterName, 120),
            role: txt(x.role, 40),
            roleLabel: txt(x.roleLabel, 80),
            level: num(x.level) ?? 0,
            isActive: x.isActive === true,
            imageCount: num(x.imageCount) ?? 0,
            profileImageCount: num(x.profileImageCount) ?? 0,
            referenceImageCount: num(x.referenceImageCount) ?? 0,
            characterCount: num(x.characterCount) ?? 0,
            characterNames,
            latestUploadedAt: txt(x.latestUploadedAt, 80),
            latestImage: {
              kind: txt(latest.kind, 20),
              characterId: num(latest.characterId),
              characterName: txt(latest.characterName, 120),
              slot: txt(latest.slot, 40),
              uploadedAt: txt(latest.uploadedAt, 80),
            },
            reviewedThrough: txt(x.reviewedThrough, 80) || null,
            reviewedAt: txt(x.reviewedAt, 80) || null,
            pending: x.pending === true,
          }
        : null;
    })
    .filter(Boolean);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    adminImageReviewContract: ADMIN_REVIEW,
    contract: "admin-member-image-review-list-api-v1",
    privacy: "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS",
    status: reviewStatus,
    pendingCount: num(d.pendingCount) ?? 0,
    totalUploaderCount: num(d.totalUploaderCount) ?? 0,
    rowCount: items.length,
    items,
  });
}
async function adminImageReviewAck(r, b, t) {
  if (has(b, ["targetMemberId", "target_member_id"]))
    return out(r, { ok: false, code: "CLIENT_MEMBER_SELECTOR_FORBIDDEN" }, 400);
  if (charAlias(b) || prepStorage(b) || compStorage(b))
    return out(
      r,
      {
        ok: false,
        code: charAlias(b)
          ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
          : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  const m = adminMid(b);
  if (m === null)
    return out(
      r,
      {
        ok: false,
        code: "TARGET_MEMBER_ID_REQUIRED",
        message: "확인 처리할 회원 식별값이 필요합니다.",
      },
      400,
    );
  const reviewed = txt(b.reviewedThrough ?? b.reviewed_through, 80);
  if (reviewed && !Number.isFinite(Date.parse(reviewed)))
    return out(
      r,
      {
        ok: false,
        code: "REVIEWED_THROUGH_INVALID",
        message: "확인 기준 시간이 올바르지 않습니다.",
      },
      400,
    );
  const d = await rpc("kinojo_admin_member_image_review_ack_v392", {
    p_session_token: t,
    p_member_id: m,
    p_reviewed_through: reviewed || null,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "ADMIN_MEMBER_IMAGE_REVIEW_ACK_FAILED";
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        databaseContract: DB,
        masterBoundaryContract: MASTER,
        adminImageReviewContract: ADMIN_REVIEW,
        contract: "admin-member-image-review-ack-api-v1",
        code: x,
        message: txt(d.message, 300),
      },
      status(x),
    );
  }
  if (num(d.memberId) !== m)
    throw Error("ADMIN_MEMBER_IMAGE_REVIEW_ACK_BINDING_MISMATCH");
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    adminImageReviewContract: ADMIN_REVIEW,
    contract: "admin-member-image-review-ack-api-v1",
    memberId: m,
    reviewedThrough: txt(d.reviewedThrough, 80),
    reviewedAt: txt(d.reviewedAt, 80),
    latestUploadedAt: txt(d.latestUploadedAt, 80),
    pending: d.pending === true,
  });
}
function adminImageRequestIds(b, requireRequest = false) {
  if (
    prepStorage(b) ||
    compStorage(b) ||
    has(b, [
      "mimeType",
      "mime_type",
      "sizeBytes",
      "size_bytes",
      "expiresAt",
      "expires_at",
      "filename",
      "fileName",
      "download",
      "downloadName",
    ])
  )
    return { ok: false, code: "CLIENT_STORAGE_OR_METADATA_SELECTOR_FORBIDDEN" };
  const memberId = adminMid(b),
    characterId = cid(b),
    requestId = pos(b.requestId ?? b.request_id);
  if (memberId === null)
    return {
      ok: false,
      code: "TARGET_MEMBER_ID_REQUIRED",
      message: "조회할 회원 식별값이 필요합니다.",
    };
  if (characterId === null)
    return {
      ok: false,
      code: "TARGET_CHARACTER_ID_REQUIRED",
      message: "조회할 캐릭터 식별값이 필요합니다.",
    };
  if (requireRequest && requestId === null)
    return {
      ok: false,
      code: "REQUEST_ID_REQUIRED",
      message: "확인할 제작 요청 식별값이 필요합니다.",
    };
  return { ok: true, memberId, characterId, requestId };
}
function adminImageRequestPublic(v) {
  const x = rec(v) || {},
    slots = (Array.isArray(x.slots) ? x.slots : [])
      .map((slot) => txt(slot, 40).toUpperCase())
      .filter((slot) => SLOTS.includes(slot)),
    style = x.styleCode === null ? null : txt(x.styleCode, 40).toUpperCase();
  return {
    requestId: pos(x.requestId),
    styleCode: REQUEST_STYLES.includes(style) ? style : null,
    requestNote: txt(x.requestNote, 300),
    status: txt(x.status, 40).toUpperCase(),
    submittedAt: txt(x.submittedAt, 80) || null,
    createdAt: txt(x.createdAt, 80) || null,
    updatedAt: txt(x.updatedAt, 80) || null,
    imageExpiresAt: txt(x.imageExpiresAt, 80) || null,
    metadataExpiresAt: txt(x.metadataExpiresAt, 80) || null,
    itemCount: Math.max(0, num(x.itemCount) ?? slots.length),
    availableImageCount: Math.max(0, num(x.availableImageCount) ?? 0),
    imageAvailable: x.imageAvailable === true,
    slots,
  };
}
async function adminImageRequestList(r, b, t) {
  const input = adminImageRequestIds(b);
  if (!input.ok) return out(r, input, 400);
  const requestStatus =
      txt(b.requestStatus ?? b.request_status, 30).toUpperCase() || "ALL",
    limit = Math.max(1, Math.min(100, Math.floor(Number(b.limit) || 50)));
  if (
    !["ALL", "SUBMITTED", "IN_PROGRESS", "COMPLETED", "REJECTED"].includes(
      requestStatus,
    )
  )
    return out(
      r,
      {
        ok: false,
        code: "REQUEST_STATUS_FILTER_INVALID",
        message: "지원하지 않는 제작 요청 상태 필터입니다.",
      },
      400,
    );
  const d = await rpc("kinojo_admin_member_image_request_list_v405", {
    p_session_token: t,
    p_member_id: input.memberId,
    p_character_id: input.characterId,
    p_status: requestStatus,
    p_limit: limit,
  });
  if (d.ok !== true) {
    const code = txt(d.code, 80) || "ADMIN_IMAGE_REQUEST_LIST_FAILED";
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        adminImageRequestContract: ADMIN_REQUEST,
        contract: "admin-member-image-request-list-api-v1",
        code,
        message: txt(d.message, 300),
      },
      status(code),
    );
  }
  if (
    num(d.targetMemberId) !== input.memberId ||
    num(d.characterId) !== input.characterId ||
    txt(d.privacy, 120) !== "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS"
  )
    throw Error("ADMIN_IMAGE_REQUEST_LIST_BINDING_MISMATCH");
  const requests = (Array.isArray(d.requests) ? d.requests : [])
    .map(adminImageRequestPublic)
    .filter((request) => request.requestId !== null);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    adminImageRequestContract: ADMIN_REQUEST,
    contract: "admin-member-image-request-list-api-v1",
    privacy: "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS",
    targetMemberId: input.memberId,
    characterId: input.characterId,
    status: requestStatus,
    rowCount: requests.length,
    requests,
  });
}
async function adminImageRequestDetail(r, b, t) {
  const input = adminImageRequestIds(b, true);
  if (!input.ok) return out(r, input, 400);
  const d = await rpc("kinojo_admin_member_image_request_detail_v405", {
    p_session_token: t,
    p_member_id: input.memberId,
    p_character_id: input.characterId,
    p_request_id: input.requestId,
  });
  if (d.ok !== true) {
    const code = txt(d.code, 80) || "ADMIN_IMAGE_REQUEST_DETAIL_FAILED";
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        adminImageRequestContract: ADMIN_REQUEST,
        contract: "admin-member-image-request-detail-api-v1",
        code,
        message: txt(d.message, 300),
      },
      status(code),
    );
  }
  if (
    num(d.targetMemberId) !== input.memberId ||
    num(d.characterId) !== input.characterId ||
    num(d.requestId) !== input.requestId ||
    txt(d.privacy, 120) !== "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS"
  )
    throw Error("ADMIN_IMAGE_REQUEST_DETAIL_BINDING_MISMATCH");
  const base = adminImageRequestPublic(d),
    allowed = (
      Array.isArray(d.allowedNextStatuses) ? d.allowedNextStatuses : []
    )
      .map((value) => txt(value, 40).toUpperCase())
      .filter((value) =>
        ["IN_PROGRESS", "COMPLETED", "REJECTED"].includes(value)
      ),
    items = (Array.isArray(d.items) ? d.items : [])
      .map((value) => {
        const x = rec(value) || {},
          slot = txt(x.slot, 40).toUpperCase();
        return SLOTS.includes(slot)
          ? {
              slot,
              mimeType: txt(x.mimeType, 120).toLowerCase(),
              sizeBytes: num(x.sizeBytes),
              createdAt: txt(x.createdAt, 80) || null,
              storageVerifiedAt: txt(x.storageVerifiedAt, 80) || null,
              available: x.available === true,
            }
          : null;
      })
      .filter(Boolean),
    history = (Array.isArray(d.history) ? d.history : [])
      .map((value) => {
        const x = rec(value) || {};
        return {
          previousStatus: txt(x.previousStatus, 40).toUpperCase() || null,
          newStatus: txt(x.newStatus, 40).toUpperCase(),
          actorKind: txt(x.actorKind, 30).toUpperCase(),
          createdAt: txt(x.createdAt, 80) || null,
        };
      })
      .filter((value) => value.newStatus);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    adminImageRequestContract: ADMIN_REQUEST,
    contract: "admin-member-image-request-detail-api-v1",
    privacy: "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS",
    targetMemberId: input.memberId,
    characterId: input.characterId,
    ...base,
    itemCount: items.length,
    availableImageCount: items.filter((item) => item.available).length,
    imageAvailable: items.some((item) => item.available),
    allowedNextStatuses: allowed,
    items,
    history,
  });
}
async function adminImageRequestStatus(r, b, t) {
  const input = adminImageRequestIds(b, true);
  if (!input.ok) return out(r, input, 400);
  const nextStatus = txt(
    b.nextStatus ?? b.next_status,
    40,
  ).toUpperCase();
  if (!["IN_PROGRESS", "COMPLETED", "REJECTED"].includes(nextStatus))
    return out(
      r,
      {
        ok: false,
        code: "REQUEST_STATUS_INVALID",
        message: "지원하지 않는 제작 요청 상태입니다.",
      },
      400,
    );
  const d = await rpc("kinojo_admin_member_image_request_status_v405", {
    p_session_token: t,
    p_member_id: input.memberId,
    p_character_id: input.characterId,
    p_request_id: input.requestId,
    p_status: nextStatus,
  });
  if (d.ok !== true) {
    const code = txt(d.code, 80) || "ADMIN_IMAGE_REQUEST_STATUS_FAILED";
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        adminImageRequestContract: ADMIN_REQUEST,
        contract: "admin-member-image-request-status-api-v1",
        code,
        message: txt(d.message, 300),
        requestId: input.requestId,
        status: txt(d.status, 40).toUpperCase() || null,
      },
      status(code),
    );
  }
  if (
    num(d.targetMemberId) !== input.memberId ||
    num(d.characterId) !== input.characterId ||
    num(d.requestId) !== input.requestId
  )
    throw Error("ADMIN_IMAGE_REQUEST_STATUS_BINDING_MISMATCH");
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    adminImageRequestContract: ADMIN_REQUEST,
    contract: "admin-member-image-request-status-api-v1",
    targetMemberId: input.memberId,
    characterId: input.characterId,
    requestId: input.requestId,
    previousStatus: txt(d.previousStatus, 40).toUpperCase() || null,
    status: txt(d.status, 40).toUpperCase(),
    updatedAt: txt(d.updatedAt, 80) || null,
    allowedNextStatuses: (
      Array.isArray(d.allowedNextStatuses) ? d.allowedNextStatuses : []
    )
      .map((value) => txt(value, 40).toUpperCase())
      .filter((value) =>
        ["IN_PROGRESS", "COMPLETED", "REJECTED"].includes(value)
      ),
    idempotent: d.idempotent === true,
  });
}
async function adminImageRequestAsset(r, b, t, purpose) {
  const input = adminImageRequestIds(b, true);
  if (!input.ok) return out(r, input, 400);
  const slot = txt(b.slot, 40).toUpperCase();
  if (!SLOTS.includes(slot))
    return out(
      r,
      {
        ok: false,
        code: "REQUEST_SLOT_INVALID",
        message: "FRONT, BACK, UPPER_BODY 이미지만 확인할 수 있습니다.",
      },
      400,
    );
  const d = await rpc("kinojo_admin_member_image_request_asset_v405", {
    p_session_token: t,
    p_member_id: input.memberId,
    p_character_id: input.characterId,
    p_request_id: input.requestId,
    p_slot: slot,
  });
  if (d.ok !== true) {
    const code = txt(d.code, 80) || "ADMIN_IMAGE_REQUEST_ASSET_FAILED";
    return out(
      r,
      {
        ok: false,
        service: S,
        apiVersion: V,
        adminImageRequestContract: ADMIN_REQUEST,
        contract: "admin-member-image-request-asset-api-v1",
        code,
        message: txt(d.message, 300),
      },
      status(code),
    );
  }
  if (
    num(d.targetMemberId) !== input.memberId ||
    num(d.characterId) !== input.characterId ||
    num(d.requestId) !== input.requestId ||
    txt(d.slot, 40).toUpperCase() !== slot
  )
    throw Error("ADMIN_IMAGE_REQUEST_ASSET_BINDING_MISMATCH");
  const bucket = txt(d.bucket, 120),
    path = txt(d.objectPath, 1024),
    mime = txt(d.mimeType, 120).toLowerCase(),
    expiresAt = txt(d.expiresAt, 80);
  if (
    bucket !== RB ||
    mime !== "image/webp" ||
    !validReferencePath(input.characterId, slot, path, mime)
  )
    throw Error("ADMIN_IMAGE_REQUEST_ASSET_PATH_INVALID");
  const remaining = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / 1000,
  );
  if (!Number.isFinite(remaining) || remaining <= 0)
    return out(
      r,
      {
        ok: false,
        code: "REQUEST_IMAGE_EXPIRED",
        message: "참고 이미지 보존 기간이 끝났습니다.",
      },
      404,
    );
  const ttl = Math.min(PREVIEW_TTL, remaining);
  if (purpose === "DOWNLOAD") {
    const filename =
        "kinojo-request-" +
        input.requestId +
        "-" +
        slot.toLowerCase() +
        ".webp",
      signed = await signDownload(bucket, path, ttl, filename);
    return out(r, {
      ok: true,
      service: S,
      apiVersion: V,
      databaseContract: DB,
      masterBoundaryContract: MASTER,
      adminImageRequestContract: ADMIN_REQUEST,
      contract: "admin-member-image-request-download-api-v1",
      privacy: "SIGNED_DOWNLOAD_URL_ONLY_NO_OBJECT_PATH",
      purpose: "EXPLICIT_DOWNLOAD_ONLY",
      targetMemberId: input.memberId,
      characterId: input.characterId,
      requestId: input.requestId,
      slot,
      mimeType: mime,
      sizeBytes: num(d.sizeBytes),
      expiresAt,
      download: {
        url: signed.url,
        expiresInSeconds: signed.expiresInSeconds,
        filename: signed.filename,
        attachment: true,
      },
    });
  }
  const signed = await signPreview(bucket, path, ttl);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    masterBoundaryContract: MASTER,
    adminImageRequestContract: ADMIN_REQUEST,
    contract: "admin-member-image-request-preview-api-v1",
    privacy: "SIGNED_PREVIEW_URL_ONLY_NO_OBJECT_PATH",
    purpose: "INLINE_PREVIEW_ONLY",
    targetMemberId: input.memberId,
    characterId: input.characterId,
    requestId: input.requestId,
    slot,
    mimeType: mime,
    sizeBytes: num(d.sizeBytes),
    expiresAt,
    preview: {
      url: signed.url,
      expiresInSeconds: signed.expiresInSeconds,
      download: false,
    },
  });
}
async function characters(r, b, t) {
  if (charAlias(b) || has(b, ["characterId", "character_id"]))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  const a = await rpc("kinojo_web_session_validate_v320", {
    p_session_token: t,
    p_touch: false,
  });
  if (a.ok !== true)
    return out(
      r,
      {
        ok: false,
        code: txt(a.code, 80) || "SESSION_INVALID",
        message: txt(a.message, 300),
      },
      401,
    );
  const m = member(a.profile);
  if (!Number.isInteger(m.id) || m.id <= 0)
    return out(r, { ok: false, code: "SESSION_MEMBER_INVALID" }, 401);
  const d = await rpc("kinojo_member_character_list_v334", {
    p_member_id: m.id,
  });
  if (d.ok !== true)
    return out(
      r,
      {
        ok: false,
        code: txt(d.code, 80) || "CHARACTER_LIST_FAILED",
        message: txt(d.message, 300),
      },
      409,
    );
  if (num(d.memberId) !== m.id) throw Error("MEMBER_BINDING_MISMATCH");
  const cs = Array.isArray(d.characters)
    ? d.characters.map(ch).filter((x) => x.characterId !== null)
    : [];
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterListContract: LIST,
    characterAccessContract: ACCESS,
    contract: "member-character-api-v1",
    displayStatBasis: "PVE",
    member: m,
    ownerResolved: d.ownerResolved === true,
    code: txt(d.code, 80),
    owner: d.owner ?? null,
    characterCount: cs.length,
    characters: cs,
  });
}
async function batchBootstrap(r, b, t) {
  if (charAlias(b) || has(b, ["characterId", "character_id"]))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (prepStorage(b) || compStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const d = await rpc("kinojo_member_image_batch_bootstrap_v375", {
    p_session_token: t,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "IMAGE_BATCH_BOOTSTRAP_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(d.message, 300) },
      status(x),
    );
  }
  const m = member(d.member),
    memberId = num(d.memberId);
  if (!Number.isInteger(memberId) || memberId <= 0 || m.id !== memberId)
    throw Error("IMAGE_BATCH_MEMBER_BINDING_MISMATCH");
  const seen = new Set(),
    items = (Array.isArray(d.items) ? d.items : []).map((v) => {
      const x = rec(v) || {},
        characterId = num(x.characterId),
        k = ch(x.character);
      if (
        !Number.isInteger(characterId) ||
        characterId <= 0 ||
        k.characterId !== characterId ||
        seen.has(characterId)
      )
        throw Error("IMAGE_BATCH_CHARACTER_BINDING_MISMATCH");
      seen.add(characterId);
      const state = rec(x.referenceState) || {},
        refs = (Array.isArray(state.references) ? state.references : [])
          .map((v) => {
            const q = rec(v) || {},
              slot = txt(q.slot, 40);
            return SLOTS.includes(slot)
              ? {
                  slot,
                  mimeType: txt(q.mimeType, 120),
                  sizeBytes: num(q.sizeBytes),
                  uploadedAt: txt(q.uploadedAt, 80),
                  expiresAt: txt(q.expiresAt, 80),
                  retentionDays: num(q.retentionDays) ?? 7,
                  active: q.active === true,
                }
              : null;
          })
          .filter(Boolean)
          .slice(0, 3);
      return {
        characterId,
        isMain: x.isMain === true,
        mainCharacterId: num(x.mainCharacterId),
        character: k,
        profile: profile(x.profile, k),
        referenceState: {
          retentionDays: num(state.retentionDays) ?? 7,
          activeCount: refs.length,
          references: refs,
          logicalExpiry: "SERVER_FILTER_EXPIRES_AT_GT_NOW",
        },
      };
    });
  if (num(d.characterCount) !== items.length)
    throw Error("IMAGE_BATCH_COUNT_MISMATCH");
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterListContract: LIST,
    characterAccessContract: ACCESS,
    profileBootstrapContract: BOOT,
    referenceStateContract: REF_STATE,
    batchBootstrapContract: BATCH,
    contract: "member-image-batch-bootstrap-api-v1",
    member: m,
    ownerResolved: d.ownerResolved === true,
    code: txt(d.code, 80),
    owner: d.owner ?? null,
    characterCount: items.length,
    imageStateCount: items.length,
    characters: items.map((x) => x.character),
    items,
    bootstrapTransport: "ONE_EDGE_REQUEST_ONE_RPC",
    privacy: "PRIVATE_REFERENCE_METADATA_ONLY_NO_OBJECT_PATHS_OR_SIGNED_URLS",
  });
}
async function access(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const a = await owned(t, c);
  if (!a.ok) {
    const x = txt(a.d.code, 80) || "CHARACTER_ACCESS_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(a.d.message, 300) },
      status(x),
    );
  }
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    contract: "member-character-access-api-v1",
    member: a.m,
    owner: a.d.owner ?? null,
    characterId: c,
    isMain: a.d.isMain === true,
    mainCharacterId: num(a.d.mainCharacterId),
    character: a.k,
  });
}
async function bootstrap(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const d = await rpc("kinojo_member_profile_bootstrap_v338", {
    p_session_token: t,
    p_character_id: c,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "PROFILE_BOOTSTRAP_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(d.message, 300) },
      status(x),
    );
  }
  const m = member(d.member),
    k = ch(d.character);
  if (k.characterId !== c || m.id !== num(d.memberId))
    throw Error("PROFILE_BOOTSTRAP_BINDING_MISMATCH");
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    profileBootstrapContract: BOOT,
    contract: "member-profile-bootstrap-api-v1",
    member: m,
    owner: d.owner ?? null,
    characterId: c,
    isMain: d.isMain === true,
    mainCharacterId: num(d.mainCharacterId),
    character: k,
    profile: profile(d.profile, k),
  });
}
async function prepare(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (prepStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const f = file(b);
  if (!f.ok)
    return out(r, { ok: false, code: f.code, message: f.message }, 400);
  const a = await owned(t, c);
  if (!a.ok) {
    const x = txt(a.d.code, 80) || "CHARACTER_ACCESS_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(a.d.message, 300) },
      status(x),
    );
  }
  const p = pathFor(c, f.ext),
    u = await sign(PB, p);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    profileUploadPrepareContract: PREP,
    contract: "member-profile-upload-prepare-api-v1",
    member: a.m,
    owner: a.d.owner ?? null,
    characterId: c,
    isMain: a.d.isMain === true,
    mainCharacterId: num(a.d.mainCharacterId),
    character: a.k,
    upload: {
      bucket: PB,
      objectPath: p,
      uploadUrl: u,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      upsert: false,
      expiresInSeconds: TTL,
      activation: "PROFILE_UPLOAD_COMPLETE_REQUIRED",
    },
  });
}
async function imageRequestPrepare(r, b, t) {
  if (charAlias(b) || prepStorage(b) || compStorage(b))
    return out(
      r,
      {
        ok: false,
        code: charAlias(b)
          ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
          : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  const input = imageRequestInput(b);
  if (!input.ok)
    return out(
      r,
      { ok: false, code: input.code, message: input.message, slot: input.slot },
      status(input.code),
    );
  const dbItems = input.items.map((x) => ({
    ...x,
    objectPath: referencePathFor(input.characterId, x.slot, "webp"),
  }));
  const d = await rpc("kinojo_member_image_request_prepare_v404", {
    p_session_token: t,
    p_character_id: input.characterId,
    p_idempotency_key: input.idempotencyKey,
    p_style_code: input.styleCode,
    p_request_note: input.requestNote,
    p_items: dbItems,
  });
  if (d.ok !== true) {
    const code = txt(d.code, 80) || "IMAGE_REQUEST_PREPARE_FAILED";
    return out(
      r,
      { ok: false, code, message: txt(d.message, 300) },
      status(code),
    );
  }
  const request = imageRequestPublic(
    d,
    input.items.map((x) => x.slot),
  );
  if (request.requestId === null || num(d.characterId) !== input.characterId)
    throw Error("IMAGE_REQUEST_PREPARE_BINDING_MISMATCH");
  if (request.status !== "DRAFT")
    return out(r, {
      ok: true,
      service: S,
      apiVersion: V,
      databaseContract: DB,
      imageRequestContract: REQUEST,
      contract: "member-image-request-prepare-api-v1",
      idempotent: true,
      characterId: input.characterId,
      request,
      uploads: [],
    });
  const rows = Array.isArray(d.items) ? d.items : [];
  if (rows.length !== input.items.length)
    throw Error("IMAGE_REQUEST_PREPARE_COUNT_MISMATCH");
  const uploads = await Promise.all(
    rows.map(async (v) => {
      const x = rec(v) || {},
        slot = txt(x.slot, 40),
        mimeType = txt(x.mimeType, 120).toLowerCase(),
        sizeBytes = pos(x.sizeBytes),
        objectPath = txt(x.objectPath, 1024);
      if (
        !SLOTS.includes(slot) ||
        mimeType !== "image/webp" ||
        sizeBytes === null ||
        !validReferencePath(input.characterId, slot, objectPath, mimeType)
      )
        throw Error("IMAGE_REQUEST_PREPARE_ITEM_INVALID");
      return {
        slot,
        uploadUrl: await sign(RB, objectPath, "IMAGE_REQUEST"),
        mimeType,
        sizeBytes,
        upsert: false,
        expiresInSeconds: TTL,
      };
    }),
  );
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    imageRequestContract: REQUEST,
    contract: "member-image-request-prepare-api-v1",
    idempotent: d.idempotent === true,
    characterId: input.characterId,
    request: { ...request, draftExpiresAt: txt(d.draftExpiresAt, 80) },
    uploads,
    privacy: "SIGNED_UPLOAD_URL_ONLY_NO_OBJECT_PATH_FIELD",
    activation: "IMAGE_REQUEST_FINALIZE_REQUIRED",
  });
}
async function imageRequestFinalize(r, b, t) {
  if (
    memberSel(b) ||
    charAlias(b) ||
    prepStorage(b) ||
    compStorage(b) ||
    has(b, ["items", "verifiedItems", "verified_items"])
  )
    return out(
      r,
      {
        ok: false,
        code: memberSel(b)
          ? "CLIENT_MEMBER_SELECTOR_FORBIDDEN"
          : charAlias(b)
            ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
            : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  const requestId = pos(b.requestId ?? b.request_id),
    key = String(b.idempotencyKey ?? b.idempotency_key ?? "").trim();
  if (requestId === null)
    return out(r, { ok: false, code: "REQUEST_ID_REQUIRED" }, 400);
  if (!REQUEST_KEY.test(key))
    return out(r, { ok: false, code: "REQUEST_IDEMPOTENCY_KEY_INVALID" }, 400);
  const draft = await rpc("kinojo_member_image_request_draft_v404", {
    p_session_token: t,
    p_request_id: requestId,
    p_idempotency_key: key,
  });
  if (draft.ok !== true) {
    const code = txt(draft.code, 80) || "IMAGE_REQUEST_DRAFT_FAILED";
    return out(
      r,
      { ok: false, code, message: txt(draft.message, 300) },
      status(code),
    );
  }
  const characterId = pos(draft.characterId);
  if (characterId === null) throw Error("IMAGE_REQUEST_DRAFT_BINDING_MISMATCH");
  if (txt(draft.status, 40) === "SUBMITTED") {
    const submitted = await rpc("kinojo_member_image_request_finalize_v404", {
      p_session_token: t,
      p_request_id: requestId,
      p_idempotency_key: key,
      p_verified_items: [],
    });
    return imageRequestFinalizeResponse(r, submitted, requestId, characterId);
  }
  const rows = Array.isArray(draft.items) ? draft.items : [];
  if (rows.length < 1 || rows.length > 3)
    throw Error("IMAGE_REQUEST_DRAFT_BINDING_MISMATCH");
  const verified = [];
  for (const value of rows) {
    const x = rec(value) || {},
      slot = txt(x.slot, 40),
      objectPath = txt(x.objectPath, 1024),
      mimeType = txt(x.mimeType, 120).toLowerCase(),
      sizeBytes = pos(x.sizeBytes);
    if (
      !SLOTS.includes(slot) ||
      mimeType !== "image/webp" ||
      sizeBytes === null ||
      !validReferencePath(characterId, slot, objectPath, mimeType)
    )
      throw Error("IMAGE_REQUEST_DRAFT_ITEM_INVALID");
    const stored = await readReferenceObj(objectPath);
    if (!stored.ok)
      return out(
        r,
        {
          ok: false,
          code: stored.code,
          message: stored.message,
          requestId,
          slot,
        },
        409,
      );
    if (stored.mimeType !== mimeType || stored.sizeBytes !== sizeBytes) {
      await delReferenceObj(objectPath);
      return out(
        r,
        {
          ok: false,
          code:
            stored.mimeType !== mimeType
              ? "REFERENCE_UPLOAD_MIME_MISMATCH"
              : "REFERENCE_UPLOAD_SIZE_MISMATCH",
          message: "업로드된 참고 이미지가 요청 정보와 일치하지 않습니다.",
          requestId,
          slot,
        },
        409,
      );
    }
    const px = pixelResult(stored.bytes, slot);
    if (!px.ok) {
      await delReferenceObj(objectPath);
      return out(
        r,
        {
          ok: false,
          code: "REFERENCE_UPLOAD_PIXELS_MISMATCH",
          message:
            "참고 이미지 편집 결과의 실제 픽셀이 슬롯 규격과 일치해야 합니다.",
          requestId,
          slot,
          pixelValidation: px,
        },
        409,
      );
    }
    verified.push({
      slot,
      objectPath,
      mimeType,
      sizeBytes,
      storageVerified: true,
      pixelVerified: true,
    });
  }
  const d = await rpc("kinojo_member_image_request_finalize_v404", {
    p_session_token: t,
    p_request_id: requestId,
    p_idempotency_key: key,
    p_verified_items: verified,
  });
  return imageRequestFinalizeResponse(r, d, requestId, characterId);
}
function imageRequestFinalizeResponse(r, d, requestId, characterId) {
  if (d.ok !== true) {
    const code = txt(d.code, 80) || "IMAGE_REQUEST_FINALIZE_FAILED";
    return out(
      r,
      {
        ok: false,
        code,
        message: txt(d.message, 300),
        requestId,
        slot: txt(d.slot, 40) || null,
      },
      status(code),
    );
  }
  const request = imageRequestPublic(d);
  if (request.requestId !== requestId || num(d.characterId) !== characterId)
    throw Error("IMAGE_REQUEST_FINALIZE_BINDING_MISMATCH");
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    imageRequestContract: REQUEST,
    contract: "member-image-request-finalize-api-v1",
    idempotent: d.idempotent === true,
    characterId,
    request,
    privacy: "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS",
    notification: "REQUEST_ID_SCOPED_STAGE3_CONSUMER",
  });
}
async function imageRequestState(r, b, t) {
  if (charAlias(b) || prepStorage(b) || compStorage(b))
    return out(
      r,
      {
        ok: false,
        code: charAlias(b)
          ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
          : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const d = await rpc("kinojo_member_image_request_state_v404", {
    p_session_token: t,
    p_character_id: c,
  });
  if (d.ok !== true) {
    const code = txt(d.code, 80) || "IMAGE_REQUEST_STATE_FAILED";
    return out(
      r,
      { ok: false, code, message: txt(d.message, 300) },
      status(code),
    );
  }
  if (num(d.characterId) !== c)
    throw Error("IMAGE_REQUEST_STATE_BINDING_MISMATCH");
  const requests = (Array.isArray(d.requests) ? d.requests : [])
    .map(imageRequestPublic)
    .filter((x) => x.requestId !== null);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    imageRequestContract: REQUEST,
    contract: "member-image-request-state-api-v1",
    characterId: c,
    imageRetentionDays: 7,
    metadataRetentionDays: 30,
    requestCount: requests.length,
    requests,
    privacy: "NO_PRIVATE_OBJECT_PATHS_OR_SIGNED_URLS",
  });
}
async function referenceState(r, b, t) {
  if (charAlias(b) || prepStorage(b) || compStorage(b))
    return out(
      r,
      {
        ok: false,
        code: charAlias(b)
          ? "CLIENT_CHARACTER_SELECTOR_FORBIDDEN"
          : "CLIENT_STORAGE_SELECTOR_FORBIDDEN",
      },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const d = await rpc("kinojo_member_reference_state_v357", {
    p_session_token: t,
    p_character_id: c,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "REFERENCE_STATE_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(d.message, 300) },
      status(x),
    );
  }
  const m = member(d.member),
    k = ch(d.character);
  if (k.characterId !== c || m.id !== num(d.memberId))
    throw Error("REFERENCE_STATE_RESULT_MISMATCH");
  const refs = (Array.isArray(d.references) ? d.references : [])
    .map((v) => {
      const x = rec(v) || {},
        slot = txt(x.slot, 40);
      return SLOTS.includes(slot)
        ? {
            slot,
            mimeType: txt(x.mimeType, 120),
            sizeBytes: num(x.sizeBytes),
            uploadedAt: txt(x.uploadedAt, 80),
            expiresAt: txt(x.expiresAt, 80),
            retentionDays: num(x.retentionDays) ?? 7,
            active: x.active === true,
          }
        : null;
    })
    .filter(Boolean)
    .slice(0, 3);
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    referenceStateContract: REF_STATE,
    contract: "member-reference-state-api-v1",
    member: m,
    owner: d.owner ?? null,
    characterId: c,
    isMain: d.isMain === true,
    mainCharacterId: num(d.mainCharacterId),
    character: k,
    retentionDays: num(d.retentionDays) ?? 7,
    activeCount: refs.length,
    references: refs,
    logicalExpiry: "SERVER_FILTER_EXPIRES_AT_GT_NOW",
  });
}
async function referencePrepare(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (prepStorage(b) || compStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const rawSlot = txt(b.slot ?? b.referenceSlot ?? b.reference_slot, 40);
  if (!rawSlot)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_SLOT_REQUIRED",
        message: "참고 이미지 슬롯이 필요합니다.",
      },
      400,
    );
  const s = referenceSlot(b);
  if (!s)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_SLOT_INVALID",
        message: "FRONT, BACK, UPPER_BODY 슬롯만 사용할 수 있습니다.",
      },
      400,
    );
  const f = referenceFile(b);
  if (!f.ok)
    return out(r, { ok: false, code: f.code, message: f.message }, 400);
  const a = await owned(t, c);
  if (!a.ok) {
    const x = txt(a.d.code, 80) || "CHARACTER_ACCESS_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(a.d.message, 300) },
      status(x),
    );
  }
  const p = referencePathFor(c, s, f.ext),
    u = await sign(RB, p, "REFERENCE");
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    referenceUploadPrepareContract: REF_PREP,
    contract: "member-reference-upload-prepare-api-v1",
    member: a.m,
    owner: a.d.owner ?? null,
    characterId: c,
    isMain: a.d.isMain === true,
    mainCharacterId: num(a.d.mainCharacterId),
    character: a.k,
    reference: { slot: s, retentionDays: 7 },
    upload: {
      bucket: RB,
      objectPath: p,
      uploadUrl: u,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      upsert: false,
      expiresInSeconds: TTL,
      activation: "REFERENCE_UPLOAD_COMPLETE_REQUIRED",
    },
  });
}
async function referenceComplete(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (compStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const rawSlot = txt(b.slot ?? b.referenceSlot ?? b.reference_slot, 40);
  if (!rawSlot)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_SLOT_REQUIRED",
        message: "참고 이미지 슬롯이 필요합니다.",
      },
      400,
    );
  const slot = referenceSlot(b);
  if (!slot)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_SLOT_INVALID",
        message: "FRONT, BACK, UPPER_BODY 슬롯만 사용할 수 있습니다.",
      },
      400,
    );
  const f = referenceFile(b);
  if (!f.ok)
    return out(r, { ok: false, code: f.code, message: f.message }, 400);
  const p = txt(b.objectPath ?? b.object_path, 1024);
  if (!validReferencePath(c, slot, p, f.mimeType))
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_OBJECT_PATH_INVALID",
        message:
          "참고 이미지 object path가 캐릭터/슬롯 업로드 계약과 일치하지 않습니다.",
      },
      400,
    );
  const a = await owned(t, c);
  if (!a.ok) {
    const x = txt(a.d.code, 80) || "CHARACTER_ACCESS_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(a.d.message, 300) },
      status(x),
    );
  }
  const stored = await readReferenceObj(p);
  if (!stored.ok)
    return out(
      r,
      { ok: false, code: stored.code, message: stored.message },
      409,
    );
  if (!MIMES.includes(stored.mimeType) || stored.mimeType !== f.mimeType) {
    await delReferenceObj(p);
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_UPLOAD_MIME_MISMATCH",
        message: "업로드된 참고 이미지 형식이 요청과 일치하지 않습니다.",
      },
      409,
    );
  }
  if (
    stored.sizeBytes !== f.sizeBytes ||
    stored.sizeBytes < 1 ||
    stored.sizeBytes > MAX_IMG
  ) {
    await delReferenceObj(p);
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_UPLOAD_SIZE_MISMATCH",
        message: "업로드된 참고 이미지 크기가 요청과 일치하지 않습니다.",
      },
      409,
    );
  }
  const px = pixelResult(stored.bytes, slot);
  if (!px.ok) {
    await delReferenceObj(p);
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_UPLOAD_PIXELS_MISMATCH",
        message:
          "참고 이미지 편집 결과의 실제 픽셀이 슬롯 규격과 일치해야 합니다.",
        pixelValidation: px,
      },
      409,
    );
  }
  const d = await rpc("kinojo_member_reference_complete_v357", {
    p_session_token: t,
    p_character_id: c,
    p_slot: slot,
    p_object_path: p,
    p_mime_type: stored.mimeType,
    p_size_bytes: stored.sizeBytes,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "REFERENCE_UPLOAD_COMPLETE_FAILED";
    if (
      [
        "REFERENCE_SLOT_EXISTS",
        "REFERENCE_SLOT_NOT_FOUND",
        "REFERENCE_REPLACEMENT_SAME_OBJECT",
        "REFERENCE_OBJECT_PATH_CONFLICT",
        "REFERENCE_OBJECT_PATH_INVALID",
        "IMAGE_MIME_TYPE_INVALID",
        "IMAGE_SIZE_INVALID",
      ].includes(x)
    )
      await delReferenceObj(p);
    return out(
      r,
      { ok: false, code: x, message: txt(d.message, 300) },
      status(x),
    );
  }
  const m = member(d.member),
    k = ch(d.character),
    ref = rec(d.reference) || {},
    prev = rec(d.previousReference),
    expiry = rec(d.expiry) || {};
  if (
    k.characterId !== c ||
    m.id !== a.m.id ||
    txt(ref.slot, 40) !== slot ||
    txt(ref.objectPath, 1024) !== p
  )
    throw Error("REFERENCE_UPLOAD_COMPLETE_RESULT_MISMATCH");
  const pp = txt(prev?.objectPath, 1024),
    pm = txt(prev?.mimeType, 120).toLowerCase();
  let expiredObjectDeleted = true;
  if (expiry.reclaimedExpiredSlot === true && pp && pp !== p) {
    expiredObjectDeleted = validReferencePath(c, slot, pp, pm)
      ? await delOldReference(pp)
      : false;
    if (!expiredObjectDeleted)
      console.warn("KINOJO expired reference object cleanup pending", {
        characterId: c,
        slot,
        previousObjectPath: pp,
      });
  }
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    referenceUploadPrepareContract: REF_PREP,
    referenceUploadCompleteContract: REF_COMP,
    referenceStateContract: REF_STATE,
    contract: "member-reference-upload-complete-api-v1",
    member: m,
    owner: d.owner ?? null,
    characterId: c,
    isMain: d.isMain === true,
    mainCharacterId: num(d.mainCharacterId),
    character: k,
    reference: {
      slot,
      objectPath: p,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      uploadedAt: txt(ref.uploadedAt, 80),
      expiresAt: txt(ref.expiresAt, 80),
      retentionDays: num(ref.retentionDays) ?? 7,
      active: ref.active === true,
    },
    upload: {
      bucket: RB,
      objectPath: p,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      storageVerified: true,
      pixelVerified: true,
      pixelWidth: px.width,
      pixelHeight: px.height,
      pixelContract: PIX,
      activated: true,
    },
    expiry: {
      reclaimedExpiredSlot: expiry.reclaimedExpiredSlot === true,
      expiredObjectDeleted,
      cleanupRequired:
        expiry.reclaimedExpiredSlot === true && !expiredObjectDeleted,
    },
  });
}
async function referenceReplaceComplete(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (compStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const rawSlot = txt(b.slot ?? b.referenceSlot ?? b.reference_slot, 40);
  if (!rawSlot)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_SLOT_REQUIRED",
        message: "참고 이미지 슬롯이 필요합니다.",
      },
      400,
    );
  const slot = referenceSlot(b);
  if (!slot)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_SLOT_INVALID",
        message: "FRONT, BACK, UPPER_BODY 슬롯만 사용할 수 있습니다.",
      },
      400,
    );
  const f = referenceFile(b);
  if (!f.ok)
    return out(r, { ok: false, code: f.code, message: f.message }, 400);
  const p = txt(b.objectPath ?? b.object_path, 1024);
  if (!validReferencePath(c, slot, p, f.mimeType))
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_OBJECT_PATH_INVALID",
        message:
          "참고 이미지 object path가 캐릭터/슬롯 업로드 계약과 일치하지 않습니다.",
      },
      400,
    );
  const a = await owned(t, c);
  if (!a.ok) {
    const x = txt(a.d.code, 80) || "CHARACTER_ACCESS_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(a.d.message, 300) },
      status(x),
    );
  }
  const stored = await readReferenceObj(p);
  if (!stored.ok)
    return out(
      r,
      { ok: false, code: stored.code, message: stored.message },
      409,
    );
  if (!MIMES.includes(stored.mimeType) || stored.mimeType !== f.mimeType) {
    await delReferenceObj(p);
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_UPLOAD_MIME_MISMATCH",
        message: "업로드된 참고 이미지 형식이 요청과 일치하지 않습니다.",
      },
      409,
    );
  }
  if (
    stored.sizeBytes !== f.sizeBytes ||
    stored.sizeBytes < 1 ||
    stored.sizeBytes > MAX_IMG
  ) {
    await delReferenceObj(p);
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_UPLOAD_SIZE_MISMATCH",
        message: "업로드된 참고 이미지 크기가 요청과 일치하지 않습니다.",
      },
      409,
    );
  }
  const px = pixelResult(stored.bytes, slot);
  if (!px.ok) {
    await delReferenceObj(p);
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_UPLOAD_PIXELS_MISMATCH",
        message:
          "참고 이미지 편집 결과의 실제 픽셀이 슬롯 규격과 일치해야 합니다.",
        pixelValidation: px,
      },
      409,
    );
  }
  const d = await rpc("kinojo_member_reference_replace_v351", {
    p_session_token: t,
    p_character_id: c,
    p_slot: slot,
    p_object_path: p,
    p_mime_type: stored.mimeType,
    p_size_bytes: stored.sizeBytes,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "REFERENCE_UPLOAD_REPLACE_FAILED";
    await delReferenceObj(p);
    return out(
      r,
      { ok: false, code: x, message: txt(d.message, 300) },
      status(x),
    );
  }
  const m = member(d.member),
    k = ch(d.character),
    ref = rec(d.reference) || {},
    prev = rec(d.previousReference),
    replacement = rec(d.replacement) || {};
  if (
    k.characterId !== c ||
    m.id !== a.m.id ||
    txt(ref.slot, 40) !== slot ||
    txt(ref.objectPath, 1024) !== p
  )
    throw Error("REFERENCE_UPLOAD_REPLACE_RESULT_MISMATCH");
  const pp = txt(prev?.objectPath, 1024),
    pm = txt(prev?.mimeType, 120).toLowerCase();
  let oldDeleted = true;
  if (pp && pp !== p) {
    oldDeleted = validReferencePath(c, slot, pp, pm)
      ? await delOldReference(pp)
      : false;
    if (!oldDeleted)
      console.warn("KINOJO reference old object cleanup pending", {
        characterId: c,
        slot,
        previousObjectPath: pp,
      });
  }
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    referenceUploadPrepareContract: REF_PREP,
    referenceUploadCompleteContract: REF_COMP,
    referenceUploadReplaceContract: REF_REPL,
    contract: "member-reference-upload-replace-api-v1",
    member: m,
    owner: d.owner ?? null,
    characterId: c,
    isMain: d.isMain === true,
    mainCharacterId: num(d.mainCharacterId),
    character: k,
    reference: {
      slot,
      objectPath: p,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      uploadedAt: txt(ref.uploadedAt, 80),
      expiresAt: txt(ref.expiresAt, 80),
      retentionDays: num(ref.retentionDays) ?? 7,
      active: ref.active === true,
      idempotent: ref.idempotent === true,
    },
    upload: {
      bucket: RB,
      objectPath: p,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      storageVerified: true,
      pixelVerified: true,
      pixelWidth: px.width,
      pixelHeight: px.height,
      pixelContract: PIX,
      activated: true,
    },
    replacement: {
      replaced: replacement.replaced === true,
      idempotent: replacement.idempotent === true,
      previousObjectPath: pp || null,
      newObjectPath: p,
      oldObjectDeleted: oldDeleted,
      cleanupRequired: !!pp && !oldDeleted,
    },
  });
}
async function referenceDelete(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (prepStorage(b) || compStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const rawSlot = txt(b.slot ?? b.referenceSlot ?? b.reference_slot, 40);
  if (!rawSlot)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_SLOT_REQUIRED",
        message: "참고 이미지 슬롯이 필요합니다.",
      },
      400,
    );
  const slot = referenceSlot(b);
  if (!slot)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_SLOT_INVALID",
        message: "FRONT, BACK, UPPER_BODY 슬롯만 삭제할 수 있습니다.",
      },
      400,
    );
  const a = await owned(t, c);
  if (!a.ok) {
    const x = txt(a.d.code, 80) || "CHARACTER_ACCESS_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(a.d.message, 300) },
      status(x),
    );
  }
  const prepared = await rpc("kinojo_member_reference_delete_prepare_v354", {
    p_session_token: t,
    p_character_id: c,
    p_slot: slot,
  });
  if (prepared.ok !== true) {
    const x = txt(prepared.code, 80) || "REFERENCE_DELETE_PREPARE_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(prepared.message, 300) },
      status(x),
    );
  }
  const pd = rec(prepared.delete) || {},
    ref = rec(prepared.reference);
  if (pd.alreadyDeleted === true || !ref) {
    return out(r, {
      ok: true,
      service: S,
      apiVersion: V,
      databaseContract: DB,
      authContract: AUTH,
      characterAccessContract: ACCESS,
      referenceDeleteContract: REF_DEL,
      contract: "member-reference-delete-api-v1",
      member: a.m,
      owner: prepared.owner ?? a.d.owner ?? null,
      characterId: c,
      isMain: prepared.isMain === true,
      mainCharacterId: num(prepared.mainCharacterId),
      character: a.k,
      deleted: {
        slot,
        deleted: true,
        alreadyDeleted: true,
        objectPath: null,
        storageObjectDeleted: true,
        metadataDeleted: true,
      },
    });
  }
  const p = txt(ref.objectPath, 1024),
    m = txt(ref.mimeType, 120).toLowerCase();
  if (!validReferencePath(c, slot, p, m))
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_DELETE_OBJECT_INVALID",
        message:
          "현재 참고 이미지 경로가 캐릭터/슬롯 계약과 일치하지 않습니다.",
      },
      409,
    );
  const storageDeleted = await delOldReference(p);
  if (!storageDeleted)
    return out(
      r,
      {
        ok: false,
        code: "REFERENCE_STORAGE_DELETE_FAILED",
        message:
          "참고 이미지 파일 삭제에 실패했습니다. 기존 기록은 보존했으며 다시 시도할 수 있습니다.",
        characterId: c,
        slot,
        delete: {
          storageObjectDeleted: false,
          metadataDeleted: false,
          metadataPreserved: true,
        },
      },
      502,
    );
  const d = await rpc("kinojo_member_reference_delete_finalize_v354", {
    p_session_token: t,
    p_character_id: c,
    p_slot: slot,
    p_expected_object_path: p,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "REFERENCE_DELETE_FINALIZE_FAILED";
    return out(
      r,
      {
        ok: false,
        code: x,
        message: txt(d.message, 300),
        characterId: c,
        slot,
        delete: {
          storageObjectDeleted: true,
          metadataDeleted: false,
          conflict: x === "REFERENCE_DELETE_CONFLICT",
        },
      },
      status(x),
    );
  }
  const mbr = member(d.member),
    k = ch(d.character),
    deleted = rec(d.delete) || {};
  if (k.characterId !== c || mbr.id !== a.m.id)
    throw Error("REFERENCE_DELETE_RESULT_MISMATCH");
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    referenceDeleteContract: REF_DEL,
    contract: "member-reference-delete-api-v1",
    member: mbr,
    owner: d.owner ?? null,
    characterId: c,
    isMain: d.isMain === true,
    mainCharacterId: num(d.mainCharacterId),
    character: k,
    deleted: {
      slot,
      deleted: deleted.deleted === true,
      alreadyDeleted: deleted.alreadyDeleted === true,
      objectPath: p,
      storageObjectDeleted: true,
      metadataDeleted: true,
    },
  });
}
async function complete(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (compStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const f = file(b);
  if (!f.ok)
    return out(r, { ok: false, code: f.code, message: f.message }, 400);
  const p = txt(b.objectPath ?? b.object_path, 1024);
  if (!validPath(c, p, f.mimeType))
    return out(r, { ok: false, code: "PROFILE_OBJECT_PATH_INVALID" }, 400);
  const a = await owned(t, c);
  if (!a.ok) {
    const x = txt(a.d.code, 80) || "CHARACTER_ACCESS_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(a.d.message, 300) },
      status(x),
    );
  }
  const s = await readObj(p);
  if (!s.ok)
    return out(r, { ok: false, code: s.code, message: s.message }, 409);
  if (!MIMES.includes(s.mimeType) || s.mimeType !== f.mimeType) {
    await delObj(p);
    return out(r, { ok: false, code: "PROFILE_UPLOAD_MIME_MISMATCH" }, 409);
  }
  if (s.sizeBytes !== f.sizeBytes || s.sizeBytes < 1 || s.sizeBytes > MAX_IMG) {
    await delObj(p);
    return out(r, { ok: false, code: "PROFILE_UPLOAD_SIZE_MISMATCH" }, 409);
  }
  const px = pixelResult(s.bytes, "PROFILE");
  if (!px.ok) {
    await delObj(p);
    return out(
      r,
      {
        ok: false,
        code: "PROFILE_UPLOAD_PIXELS_MISMATCH",
        message: "프로필 편집 결과는 실제 512×512 WebP 픽셀이어야 합니다.",
        pixelValidation: px,
      },
      409,
    );
  }
  const d = await rpc("kinojo_member_profile_override_complete_v339", {
    p_session_token: t,
    p_character_id: c,
    p_object_path: p,
    p_mime_type: s.mimeType,
    p_size_bytes: s.sizeBytes,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "PROFILE_UPLOAD_COMPLETE_FAILED";
    if (
      [
        "PROFILE_OVERRIDE_EXISTS",
        "PROFILE_OBJECT_PATH_CONFLICT",
        "PROFILE_OBJECT_PATH_INVALID",
        "IMAGE_MIME_TYPE_INVALID",
        "IMAGE_SIZE_INVALID",
      ].includes(x)
    )
      await delObj(p);
    return out(
      r,
      { ok: false, code: x, message: txt(d.message, 300) },
      status(x),
    );
  }
  const m = member(d.member),
    k = ch(d.character);
  if (k.characterId !== c || m.id !== a.m.id)
    throw Error("PROFILE_UPLOAD_COMPLETE_RESULT_MISMATCH");
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    profileUploadPrepareContract: PREP,
    profileUploadCompleteContract: COMP,
    contract: "member-profile-upload-complete-api-v1",
    member: m,
    owner: d.owner ?? null,
    characterId: c,
    isMain: d.isMain === true,
    mainCharacterId: num(d.mainCharacterId),
    character: k,
    profile: profile(d.profile, k),
    upload: {
      bucket: PB,
      objectPath: p,
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
      storageVerified: true,
      pixelVerified: true,
      pixelWidth: px.width,
      pixelHeight: px.height,
      pixelContract: PIX,
      activated: true,
    },
  });
}
async function replaceComplete(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (compStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const f = file(b);
  if (!f.ok)
    return out(r, { ok: false, code: f.code, message: f.message }, 400);
  const p = txt(b.objectPath ?? b.object_path, 1024);
  if (!validPath(c, p, f.mimeType))
    return out(r, { ok: false, code: "PROFILE_OBJECT_PATH_INVALID" }, 400);
  const a = await owned(t, c);
  if (!a.ok) {
    const x = txt(a.d.code, 80) || "CHARACTER_ACCESS_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(a.d.message, 300) },
      status(x),
    );
  }
  const s = await readObj(p);
  if (!s.ok)
    return out(r, { ok: false, code: s.code, message: s.message }, 409);
  if (!MIMES.includes(s.mimeType) || s.mimeType !== f.mimeType) {
    await delObj(p);
    return out(r, { ok: false, code: "PROFILE_UPLOAD_MIME_MISMATCH" }, 409);
  }
  if (s.sizeBytes !== f.sizeBytes || s.sizeBytes < 1 || s.sizeBytes > MAX_IMG) {
    await delObj(p);
    return out(r, { ok: false, code: "PROFILE_UPLOAD_SIZE_MISMATCH" }, 409);
  }
  const px = pixelResult(s.bytes, "PROFILE");
  if (!px.ok) {
    await delObj(p);
    return out(
      r,
      {
        ok: false,
        code: "PROFILE_UPLOAD_PIXELS_MISMATCH",
        message: "프로필 편집 결과는 실제 512×512 WebP 픽셀이어야 합니다.",
        pixelValidation: px,
      },
      409,
    );
  }
  const d = await rpc("kinojo_member_profile_override_replace_v340", {
    p_session_token: t,
    p_character_id: c,
    p_object_path: p,
    p_mime_type: s.mimeType,
    p_size_bytes: s.sizeBytes,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "PROFILE_UPLOAD_REPLACE_FAILED";
    await delObj(p);
    return out(
      r,
      { ok: false, code: x, message: txt(d.message, 300) },
      status(x),
    );
  }
  const m = member(d.member),
    k = ch(d.character);
  if (k.characterId !== c || m.id !== a.m.id)
    throw Error("PROFILE_UPLOAD_REPLACE_RESULT_MISMATCH");
  const prev = rec(d.previousOverride) || {},
    pp = txt(prev.objectPath, 1024),
    pm = txt(prev.mimeType, 120).toLowerCase();
  let oldDeleted = false;
  if (pp && pp !== p && validPath(c, pp, pm)) oldDeleted = await delOld(pp);
  if (!oldDeleted)
    console.warn("KINOJO profile old object cleanup pending", {
      characterId: c,
      previousObjectPath: pp,
    });
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    profileUploadPrepareContract: PREP,
    profileUploadReplaceContract: REPL,
    contract: "member-profile-upload-replace-api-v1",
    member: m,
    owner: d.owner ?? null,
    characterId: c,
    isMain: d.isMain === true,
    mainCharacterId: num(d.mainCharacterId),
    character: k,
    profile: profile(d.profile, k),
    upload: {
      bucket: PB,
      objectPath: p,
      mimeType: s.mimeType,
      sizeBytes: s.sizeBytes,
      storageVerified: true,
      pixelVerified: true,
      pixelWidth: px.width,
      pixelHeight: px.height,
      pixelContract: PIX,
      activated: true,
    },
    replacement: {
      replaced: true,
      previousObjectPath: pp,
      newObjectPath: p,
      oldObjectDeleted: oldDeleted,
      cleanupRequired: !oldDeleted,
    },
  });
}
async function resetOfficial(r, b, t) {
  if (charAlias(b))
    return out(
      r,
      { ok: false, code: "CLIENT_CHARACTER_SELECTOR_FORBIDDEN" },
      400,
    );
  if (prepStorage(b) || compStorage(b))
    return out(
      r,
      { ok: false, code: "CLIENT_STORAGE_SELECTOR_FORBIDDEN" },
      400,
    );
  const c = cid(b);
  if (c === null)
    return out(r, { ok: false, code: "CHARACTER_ID_REQUIRED" }, 400);
  const d = await rpc("kinojo_member_profile_override_reset_v341", {
    p_session_token: t,
    p_character_id: c,
  });
  if (d.ok !== true) {
    const x = txt(d.code, 80) || "PROFILE_RESET_FAILED";
    return out(
      r,
      { ok: false, code: x, message: txt(d.message, 300) },
      status(x),
    );
  }
  const m = member(d.member),
    k = ch(d.character);
  if (k.characterId !== c || m.id !== num(d.memberId))
    throw Error("PROFILE_RESET_RESULT_MISMATCH");
  const prev = rec(d.previousOverride),
    pp = txt(prev?.objectPath, 1024),
    pm = txt(prev?.mimeType, 120).toLowerCase();
  let oldDeleted = true;
  if (pp) {
    oldDeleted = validPath(c, pp, pm) ? await delOld(pp) : false;
    if (!oldDeleted)
      console.warn("KINOJO profile reset object cleanup pending", {
        characterId: c,
        previousObjectPath: pp,
      });
  }
  const rs = rec(d.reset) || {};
  return out(r, {
    ok: true,
    service: S,
    apiVersion: V,
    databaseContract: DB,
    authContract: AUTH,
    characterAccessContract: ACCESS,
    profileResetContract: RESET,
    contract: "member-profile-reset-official-api-v1",
    member: m,
    owner: d.owner ?? null,
    characterId: c,
    isMain: d.isMain === true,
    mainCharacterId: num(d.mainCharacterId),
    character: k,
    profile: profile(d.profile, k),
    reset: {
      reset: rs.reset === true,
      alreadyOfficial: rs.alreadyOfficial === true,
      previousObjectPath: pp || null,
      oldObjectDeleted: oldDeleted,
      cleanupRequired: !!pp && !oldDeleted,
    },
  });
}
Deno.serve(async (r) => {
  if (r.method === "OPTIONS")
    return new Response(null, { status: 204, headers: hdr(r) });
  if (r.method !== "POST")
    return out(r, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  if (
    !txt(r.headers.get("content-type"), 200)
      .toLowerCase()
      .includes("application/json")
  )
    return out(r, { ok: false, code: "JSON_REQUIRED" }, 415);
  try {
    const raw = await r.text();
    if (enc.encode(raw).byteLength > MAX_REQ)
      return out(r, { ok: false, code: "REQUEST_TOO_LARGE" }, 413);
    const b = rec(raw ? JSON.parse(raw) : {}) || {},
      a = txt(b.action, 40) || "characters";
    if (rawCred(b))
      return out(r, { ok: false, code: "RAW_CREDENTIAL_FORBIDDEN" }, 400);
    if (
      memberSel(b) &&
      ![
        "admin-image-list",
        "admin-image-preview",
        "admin-image-review-ack",
        "admin-image-request-list",
        "admin-image-request-detail",
        "admin-image-request-status",
        "admin-image-request-preview",
        "admin-image-request-download",
      ].includes(a)
    )
      return out(
        r,
        { ok: false, code: "CLIENT_MEMBER_SELECTOR_FORBIDDEN" },
        400,
      );
    if (a === "health")
      return out(r, {
        ok: true,
        service: S,
        apiVersion: V,
        databaseContract: DB,
        authContract: AUTH,
        characterListContract: LIST,
        characterAccessContract: ACCESS,
        masterBoundaryContract: MASTER,
        profileBootstrapContract: BOOT,
        batchBootstrapContract: BATCH,
        profileUploadPrepareContract: PREP,
        profileUploadCompleteContract: COMP,
        profileUploadReplaceContract: REPL,
        profileResetContract: RESET,
        referenceUploadPrepareContract: REF_PREP,
        referenceUploadCompleteContract: REF_COMP,
        referenceUploadReplaceContract: REF_REPL,
        referenceDeleteContract: REF_DEL,
        referenceStateContract: REF_STATE,
        adminImageListContract: ADMIN_LIST,
        adminImagePreviewContract: ADMIN_PREVIEW,
        adminImageReviewContract: ADMIN_REVIEW,
        adminImageRequestContract: ADMIN_REQUEST,
        adminImageWorkQueueContract: ADMIN_WORK_QUEUE,
        imageRequestContract: REQUEST,
        editedImagePixelContract: PIX,
        authBoundary: "KWS_SERVER_SESSION_ONLY",
        memberBinding: "SESSION_PROFILE_ID_ONLY",
        characterBinding: "SERVER_CHARACTER_ID_ONLY",
        displayStatBasis: "PVE",
        bootstrap: {
          transport: "ONE_EDGE_REQUEST_ONE_RPC",
          sessionValidation: "ONCE",
          ownershipResolution: "ONCE",
          includes: ["characters", "profile-state", "reference-state"],
          preloading: "C2_NOT_INCLUDED",
          backgroundLoading: "C2_NOT_INCLUDED",
          retry: "C2_NOT_INCLUDED",
        },
        image: {
          maxBytes: MAX_IMG,
          sourceAcceptedMimeTypes: MIMES,
          editedUploadMimeType: "image/webp",
          exactOutputPixels: PIXELS,
          pixelValidation: "STORAGE_BYTES_BEFORE_ACTIVATION",
          invalidCandidate: "DELETE_BEFORE_METADATA_ACTIVATION",
          profileBucket: PB,
          referenceBucket: RB,
          referenceSlots: SLOTS,
          referenceRetentionDays: 7,
          transport: "SIGNED_UPLOAD_URL",
          metadataActivation: "COMPLETE_ONLY",
          logicalExpiry: "EXPIRES_AT_GT_NOW_HIDDEN_BEFORE_CLEANUP",
          directBrowserServiceRole: false,
          signedUploadExpiresSeconds: TTL,
          signedPreviewMaxExpiresSeconds: PREVIEW_TTL,
        },
        imageRequest: {
          imageCount: { min: 1, max: 3 },
          styles: REQUEST_STYLES,
          styleOptional: true,
          customNoteRequired: true,
          noteMaxCharacters: 300,
          imageRetentionDays: 7,
          metadataRetentionDays: 30,
          lifecycle: ["DRAFT", "SUBMITTED"],
          uploadTransport: "SIGNED_UPLOAD_URL",
          finalize: "ALL_ITEMS_STORAGE_AND_PIXELS_VERIFIED",
          idempotency: "MEMBER_AND_CLIENT_KEY",
          privacy: "NO_PRIVATE_OBJECT_PATH_FIELD",
          admin: {
            lifecycle: [
              "SUBMITTED",
              "IN_PROGRESS",
              "COMPLETED",
              "REJECTED",
            ],
            transitions: {
              SUBMITTED: ["IN_PROGRESS", "REJECTED"],
              IN_PROGRESS: ["COMPLETED", "REJECTED"],
            },
            listAndDetail: "MASTER_ONLY_NO_PRIVATE_PATHS",
            assets: "SHORT_SIGNED_PREVIEW_OR_EXPLICIT_DOWNLOAD",
            notification: "ONE_DURABLE_EVENT_PER_REQUEST_ID",
          },
        },
        actions: [
          "characters",
          "batch-bootstrap",
          "character-access",
          "profile-bootstrap",
          "profile-upload-prepare",
          "profile-upload-complete",
          "profile-upload-replace-complete",
          "profile-reset-official",
          "reference-upload-prepare",
          "reference-upload-complete",
          "reference-upload-replace-complete",
          "reference-delete",
          "reference-state",
          "image-request-prepare",
          "image-request-finalize",
          "image-request-state",
          "admin-image-list",
          "admin-image-preview",
          "admin-image-work-queue-list",
          "admin-image-review-list",
          "admin-image-review-ack",
          "admin-image-request-list",
          "admin-image-request-detail",
          "admin-image-request-status",
          "admin-image-request-preview",
          "admin-image-request-download",
        ],
      });
    if (
      ![
        "characters",
        "batch-bootstrap",
        "character-access",
        "profile-bootstrap",
        "profile-upload-prepare",
        "profile-upload-complete",
        "profile-upload-replace-complete",
        "profile-reset-official",
        "reference-upload-prepare",
        "reference-upload-complete",
        "reference-upload-replace-complete",
        "reference-delete",
        "reference-state",
        "image-request-prepare",
        "image-request-finalize",
        "image-request-state",
        "admin-image-list",
        "admin-image-preview",
        "admin-image-work-queue-list",
        "admin-image-review-list",
        "admin-image-review-ack",
        "admin-image-request-list",
        "admin-image-request-detail",
        "admin-image-request-status",
        "admin-image-request-preview",
        "admin-image-request-download",
      ].includes(a)
    )
      return out(r, { ok: false, code: "UNSUPPORTED_ACTION" }, 400);
    const t = token(b);
    if (!TOKEN.test(t))
      return out(r, { ok: false, code: "SESSION_TOKEN_INVALID" }, 401);
    if (a === "admin-image-list") return await adminImageList(r, b, t);
    if (a === "admin-image-preview") return await adminImagePreview(r, b, t);
    if (a === "admin-image-work-queue-list")
      return await adminImageWorkQueueList(r, b, t);
    if (a === "admin-image-review-list")
      return await adminImageReviewList(r, b, t);
    if (a === "admin-image-review-ack")
      return await adminImageReviewAck(r, b, t);
    if (a === "admin-image-request-list")
      return await adminImageRequestList(r, b, t);
    if (a === "admin-image-request-detail")
      return await adminImageRequestDetail(r, b, t);
    if (a === "admin-image-request-status")
      return await adminImageRequestStatus(r, b, t);
    if (a === "admin-image-request-preview")
      return await adminImageRequestAsset(r, b, t, "PREVIEW");
    if (a === "admin-image-request-download")
      return await adminImageRequestAsset(r, b, t, "DOWNLOAD");
    if (a === "characters") return await characters(r, b, t);
    if (a === "batch-bootstrap") return await batchBootstrap(r, b, t);
    if (a === "character-access") return await access(r, b, t);
    if (a === "profile-bootstrap") return await bootstrap(r, b, t);
    if (a === "profile-upload-prepare") return await prepare(r, b, t);
    if (a === "profile-upload-complete") return await complete(r, b, t);
    if (a === "profile-upload-replace-complete")
      return await replaceComplete(r, b, t);
    if (a === "profile-reset-official") return await resetOfficial(r, b, t);
    if (a === "image-request-prepare")
      return await imageRequestPrepare(r, b, t);
    if (a === "image-request-finalize")
      return await imageRequestFinalize(r, b, t);
    if (a === "image-request-state") return await imageRequestState(r, b, t);
    if (a === "reference-state") return await referenceState(r, b, t);
    if (a === "reference-upload-prepare")
      return await referencePrepare(r, b, t);
    if (a === "reference-upload-complete")
      return await referenceComplete(r, b, t);
    if (a === "reference-upload-replace-complete")
      return await referenceReplaceComplete(r, b, t);
    return await referenceDelete(r, b, t);
  } catch (e) {
    const c = e instanceof Error ? e.message : "PROFILE_SERVER_ERROR";
    return out(
      r,
      {
        ok: false,
        code:
          c === "PROFILE_SERVER_NOT_CONFIGURED" ? c : "PROFILE_SERVER_ERROR",
        message: "회원 캐릭터 정보를 처리하는 중 오류가 발생했습니다.",
      },
      500,
    );
  }
});
