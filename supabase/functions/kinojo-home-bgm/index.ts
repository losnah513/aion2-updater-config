const bucket = "kinojo-home-bgm";
const maxBytes = 6 * 1024 * 1024;
const maxLyricsBytes = 24 * 1024;
const origins = new Set(["https://kinojo.info", "https://www.kinojo.info"]);
const mime = { mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg" } as const;
type Extension = keyof typeof mime;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const errors: Record<string, string> = {
  ADMIN_ACCESS_REQUIRED: "관리자 로그인과 권한을 확인해 주세요.",
  LIKE_IP_UNAVAILABLE: "접속 IP를 확인할 수 없어 좋아요를 저장할 수 없습니다.",
  TRACK_LIMIT: "최대 20곡까지 등록할 수 있습니다. 기존 곡을 먼저 삭제해 주세요.",
  TRACK_UNAVAILABLE: "곡을 찾을 수 없거나 아직 업로드 중입니다. 목록을 다시 불러와 주세요.",
  INVALID_INPUT: "곡 제목, 파일 형식 또는 재생 순서를 확인해 주세요.",
  SIZE_LIMIT: "음원 한 곡은 최대 6 MiB입니다.",
  INVALID_AUDIO: "MP3, M4A 또는 OGG 음원 파일을 선택해 주세요.",
  INVALID_LYRICS: "24 KiB 이하의 UTF-8 LRC 가사를 입력해 주세요. 예: [00:12.50] 가사",
  UPLOAD_FAILED: "업로드를 완료하지 못했습니다. 목록을 확인한 뒤 다시 시도해 주세요.",
  DELETE_FAILED: "파일 삭제를 완료하지 못했습니다. 목록에서 삭제를 다시 시도해 주세요.",
  SERVER_ERROR: "BGM 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
};
class BgmError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code); }
}
function reply(request: Request, data: unknown, status = 200) {
  const origin = request.headers.get("origin") || "";
  const headers = new Headers({
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "apikey, authorization, content-type, x-client-info, x-kinojo-session, x-bgm-title, x-bgm-extension",
    vary: "Origin",
  });
  if (origins.has(origin)) headers.set("access-control-allow-origin", origin);
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}
async function bytes(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(request.headers.get("content-length")) > limit) throw new BgmError("SIZE_LIMIT", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new BgmError("INVALID_INPUT");
  let size = 0;
  const parts: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw new BgmError("SIZE_LIMIT", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
function matchesAudio(data: Uint8Array, ext: Extension) {
  const at = (offset: number, word: string) =>
    [...word].every((letter, i) => data[offset + i] === letter.charCodeAt(0));
  if (data.length < 16) return false;
  if (ext === "mp3") return at(0, "ID3") || (data[0] === 255 && (data[1] & 224) === 224 && (data[1] & 6) !== 0);
  if (ext === "ogg") return at(0, "OggS") && data[4] === 0;
  return at(4, "ftyp") && ["M4A ", "M4B ", "isom", "mp42", "mp41"].some((brand) => at(8, brand));
}
function title(value: unknown) {
  if (typeof value !== "string" || !value.trim() || [...value.trim()].length > 100 || /[\x00-\x1f\x7f]/.test(value)) {
    throw new BgmError("INVALID_INPUT");
  }
  return value.trim();
}

async function likeIpKey(request: Request, secret: string) {
  // The hosted Cloudflare gateway sets this header. Forwarded-For and client data are never used.
  const address = request.headers.get("cf-connecting-ip")?.trim() || "";
  if (!/^(?:[\da-f:.]+)$/i.test(address) || address.length > 45) return null;
  try {
    let normalized: string;
    if (address.includes(":")) {
      normalized = new URL("http://[" + address + "]/").hostname;
      const mapped = normalized.match(/^\[::ffff:([\da-f]+):([\da-f]+)\]$/);
      if (mapped) {
        const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
        normalized = [high >>> 8, high & 255, low >>> 8, low & 255].join(".");
      }
    } else {
      if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) return null;
      const parts = address.split(".").map(Number);
      if (parts.some(part => part > 255)) return null;
      normalized = parts.join(".");
    }
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hash = await crypto.subtle.sign("HMAC", key, encoder.encode("kinojo-bgm-like:v1:" + normalized));
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

Deno.serve(async (request: Request) => {
  try {
    const origin = request.headers.get("origin");
    if (origin && !origins.has(origin)) return reply(request, { ok: false }, 403);
    if (request.method === "OPTIONS") return reply(request, null, 204);
    const base = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!base || !key) throw new BgmError("SERVER_ERROR", 503);
    const service = { apikey: key, authorization: "Bearer " + key };
    const session = request.headers.get("x-kinojo-session");
    const rpc = async (action: string, track: Record<string, unknown> = {}) => {
      const response = await fetch(base + "/rest/v1/rpc/kinojo_home_bgm_v1", {
        method: "POST", signal: AbortSignal.timeout(8000),
        headers: { ...service, "content-type": "application/json" },
        body: JSON.stringify({ p_action: action, p_session_token: ["playlist", "lyrics"].includes(action) ? null : session, p_track: track }),
      });
      const result = await response.json();
      if (!response.ok) throw new BgmError("SERVER_ERROR", 502);
      if (!result.ok) throw new BgmError(result.code, result.code === "ADMIN_ACCESS_REQUIRED" ? 403 : 409);
      return result;
    };
    const params = new URL(request.url).searchParams;
    const action = params.get("action");
    if (action === "likes" && (request.method === "GET" || request.method === "POST")) {
      const id = params.get("id") || "";
      if (!uuid.test(id)) throw new BgmError("INVALID_INPUT");
      const vote = request.method === "POST";
      const ipKey = await likeIpKey(request, key);
      if (vote && !ipKey) throw new BgmError("LIKE_IP_UNAVAILABLE", 503);
      const response = await fetch(base + "/rest/v1/rpc/kinojo_home_bgm_likes_v1", {
        method: "POST", signal: AbortSignal.timeout(8000),
        headers: { ...service, "content-type": "application/json" },
        body: JSON.stringify({ p_id: id, p_ip_key: ipKey, p_vote: vote }),
      });
      if (!response.ok) throw new BgmError("SERVER_ERROR", 502);
      const result = await response.json();
      if (!result.ok) throw new BgmError(result.code, result.code === "TRACK_UNAVAILABLE" ? 404 : 400);
      return reply(request, result);
    }
    if (request.method === "GET" && action === "playlist") return reply(request, await rpc("playlist"));
    if (request.method === "GET" && action === "lyrics") {
      const id = new URL(request.url).searchParams.get("id") || "";
      if (!uuid.test(id)) throw new BgmError("INVALID_INPUT");
      return reply(request, await rpc("lyrics", { id }));
    }
    if (request.method !== "POST" || !["list", "upload", "update", "update-lyrics", "delete"].includes(action || "")) {
      throw new BgmError("INVALID_INPUT", 405);
    }
    if (!session || !/^kws_[A-Za-z0-9_-]{40,80}$/.test(session)) throw new BgmError("ADMIN_ACCESS_REQUIRED", 401);
    if (action === "list") return reply(request, await rpc("list"));
    if (action === "upload") {
      await rpc("authorize");
      const ext = request.headers.get("x-bgm-extension") as Extension;
      if (!Object.hasOwn(mime, ext) || request.headers.get("content-type") !== mime[ext]) {
        throw new BgmError("INVALID_AUDIO");
      }
      let name: string;
      try { name = title(decodeURIComponent(request.headers.get("x-bgm-title") || "")); }
      catch { throw new BgmError("INVALID_INPUT"); }
      const data = await bytes(request, maxBytes);
      if (!matchesAudio(data, ext)) throw new BgmError("INVALID_AUDIO");
      const id = crypto.randomUUID();
      await rpc("reserve", { id, extension: ext, title: name, bytes: data.length });
      try {
        const uploaded = await fetch(base + "/storage/v1/object/" + bucket + "/" + id + "." + ext, {
          method: "POST", signal: AbortSignal.timeout(25000),
          headers: { ...service, "content-type": mime[ext], "cache-control": "max-age=60" },
          body: data,
        });
        if (!uploaded.ok) throw new BgmError("UPLOAD_FAILED", 502);
        return reply(request, await rpc("publish", { id }));
      } catch {
        // Keep the reservation recoverable if Storage or DB committed before a connection failure.
        throw new BgmError("UPLOAD_FAILED", 502);
      }
    }
    let track;
    try { track = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await bytes(request, action === "update-lyrics" ? 65536 : 4096))); }
    catch { throw new BgmError(action === "update-lyrics" ? "INVALID_LYRICS" : "INVALID_INPUT"); }
    if (!track || typeof track.id !== "string" || !uuid.test(track.id)) throw new BgmError("INVALID_INPUT");
    if (action === "update") {
      if (!Number.isInteger(track.sort_order) || track.sort_order < 0 || track.sort_order > 9999) {
        throw new BgmError("INVALID_INPUT");
      }
      return reply(request, await rpc("update", { id: track.id, title: title(track.title), sort_order: track.sort_order }));
    }
    if (action === "update-lyrics") {
      if (typeof track.lyrics !== "string" || new TextEncoder().encode(track.lyrics).length > maxLyricsBytes ||
          /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(track.lyrics)) throw new BgmError("INVALID_LYRICS");
      const lyrics: string = track.lyrics.replace(/\r\n?/g, "\n").trim();
      const timed = lyrics.split("\n").some((line) => {
        const prefix = line.match(/^\s*(?:\[\d{1,3}:[0-5]\d(?:\.\d{1,3})?\])+/)?.[0];
        return prefix && line.slice(prefix.length).replace(/<\d{1,3}:[0-5]\d(?:\.\d{1,3})?>/g, "").trim();
      });
      if (lyrics && !timed) throw new BgmError("INVALID_LYRICS");
      return reply(request, await rpc("update-lyrics", { id: track.id, lyrics }));
    }
    const { track: deleting } = await rpc("begin-delete", { id: track.id });
    try {
      const removed = await fetch(base + "/storage/v1/object/" + bucket, {
        method: "DELETE", signal: AbortSignal.timeout(15000), headers: { ...service, "content-type": "application/json" },
        body: JSON.stringify({ prefixes: [deleting.id + "." + deleting.extension] }),
      });
      if (!removed.ok) throw new BgmError("DELETE_FAILED", 502);
      return reply(request, await rpc("finish-delete", { id: track.id }));
    } catch { throw new BgmError("DELETE_FAILED", 502); }
  } catch (error) {
    const failure = error instanceof BgmError ? error : new BgmError("SERVER_ERROR", 500);
    return reply(request, { ok: false, code: failure.code, message: errors[failure.code] || errors.SERVER_ERROR }, failure.status);
  }
});
