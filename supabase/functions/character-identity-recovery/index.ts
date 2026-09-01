/* KINOJO Character Identity Recovery Edge API
 * Contract 295.2 · 2026-09-01
 * - PLAYNC search characterId is decoded exactly once before detail/info lookup.
 * - Search highlight markup is removed before character-name comparison.
 * - Exact persistent charKey and same-race server verification remain mandatory.
 */

/* KINOJO Character Identity Recovery Edge API
 * Contract 294
 * - Official character-name search discovers candidates
 * - Transfer candidates are restricted to the character's existing race
 * - PLAYNC 429/timeouts are retry states, never "candidate not found"
 * - Stored charKey is verification-only; it is never sent as a search keyword
 * - Exact charKey matches are automatic; mismatches require ADMIN review
 * - AppsScript_MASTER list write + readback after ADMIN apply
 */
const CORS = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
};
const API_VERSION = "295.2";
const CONTRACT = "295";
class ProviderError extends Error {
    status;
    retryAfterMs;
    constructor(message, status = 0, retryAfterMs = 0) {
        super(message);
        this.name = "ProviderError";
        this.status = status;
        this.retryAfterMs = retryAfterMs;
    }
}
function response(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: CORS });
}
function text(value, max = 500) {
    return String(value ?? "").trim().slice(0, max);
}
function row(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function int(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : null;
}
function normalizeName(value) {
    return decodeHtml(text(value, 120)).normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, "");
}
function decodePlatformId(value) {
    const source = text(value, 500);
    if (!source)
        return "";
    try {
        return decodeURIComponent(source);
    }
    catch {
        return source;
    }
}
function primitive(value, keys, depth = 0) {
    if (depth > 6 || value === null || value === undefined)
        return null;
    if (Array.isArray(value)) {
        for (const item of value) {
            const found = primitive(item, keys, depth + 1);
            if (found !== null && found !== undefined && text(found) !== "")
                return found;
        }
        return null;
    }
    const current = row(value);
    if (!current)
        return null;
    const wanted = new Set(keys.map((key) => key.toLowerCase()));
    for (const [key, item] of Object.entries(current)) {
        if (wanted.has(key.toLowerCase()) && item !== null && item !== undefined && typeof item !== "object")
            return item;
    }
    for (const item of Object.values(current)) {
        const found = primitive(item, keys, depth + 1);
        if (found !== null && found !== undefined && text(found) !== "")
            return found;
    }
    return null;
}
function list(value, depth = 0) {
    if (depth > 5 || value === null || value === undefined)
        return [];
    if (Array.isArray(value))
        return value;
    const current = row(value);
    if (!current)
        return [];
    for (const [key, item] of Object.entries(current)) {
        if (key.toLowerCase() === "list" && Array.isArray(item))
            return item;
    }
    for (const item of Object.values(current)) {
        const found = list(item, depth + 1);
        if (found.length)
            return found;
    }
    return [];
}
function charKey(value) {
    const source = text(value, 5000);
    if (!source)
        return "";
    for (const pattern of [
        /[?&]charKey=(\d{10,})/i,
        /["']?charKey["']?\s*[:=]\s*["']?(\d{10,})/i,
        /["']?char_key["']?\s*[:=]\s*["']?(\d{10,})/i,
        /profile_images[^\s"']*charKey=(\d{10,})/i,
    ]) {
        const match = source.match(pattern);
        if (match)
            return match[1];
    }
    return /^\d{10,}$/.test(source) ? source : "";
}
function charKeyFromPayload(value) {
    return charKey(primitive(value, ["charKey", "char_key", "gameUserUid", "game_user_uid"]))
        || charKey(primitive(value, ["profileImageUrl", "profile_image_url", "profileImage", "imageUrl", "image"]));
}
function detailKey(value) {
    const source = text(value, 1200);
    if (!source)
        return "";
    const match = source.match(/\/characters\/\d+\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : "";
}
function pathSegment(value) {
    return encodeURIComponent(text(value, 500)).replace(/%3D/gi, "=");
}
function decodeHtml(value) {
    return value.replace(/\\u([0-9a-f]{4})/gi, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ").trim();
}
function nameFromHtml(html) {
    for (const pattern of [
        /["']characterName["']\s*:\s*["']([^"']{1,120})["']/i,
        /["']character_name["']\s*:\s*["']([^"']{1,120})["']/i,
        /profile__info-name[^>]*>([\s\S]*?)<\//i,
        /<title[^>]*>([\s\S]*?)<\/title>/i,
    ]) {
        const match = html.match(pattern);
        if (!match)
            continue;
        const found = decodeHtml(match[1]).replace(/\s*[|｜-]\s*(AION2|아이온2).*$/i, "").trim();
        if (found && !/캐릭터를 찾을 수|존재하지 않|삭제|이전/i.test(found))
            return found;
    }
    return "";
}
function safeCandidate(value) {
    if (!value)
        return null;
    return {
        serverId: value.serverId || null,
        serverName: value.serverName || "",
        characterName: value.characterName || "",
        className: value.className || "",
        detailUrl: value.detailUrl || "",
        profileImageUrl: value.profileImageUrl || "",
        method: value.method || "",
        keyMatched: value.keyMatched === true,
    };
}
function retryAfterMs(value) {
    const raw = text(value, 120);
    if (!raw)
        return 0;
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds >= 0)
        return Math.min(Math.trunc(seconds * 1000), 6 * 60 * 60 * 1000);
    const date = Date.parse(raw);
    return Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 6 * 60 * 60 * 1000)) : 0;
}
function providerFailure(stage, error, serverId = null) {
    const provider = error instanceof ProviderError ? error : null;
    const status = provider?.status || 0;
    return {
        stage,
        serverId,
        status,
        retryable: status === 0 || status === 408 || status === 425 || status === 429 || status >= 500,
        retryAfterSeconds: provider?.retryAfterMs ? Math.ceil(provider.retryAfterMs / 1000) : 0,
        message: text(error instanceof Error ? error.message : error, 300),
    };
}
function hasRetryableFailure(value) {
    return Array.isArray(value) && value.some((item) => row(item)?.retryable === true);
}
async function fetchText(url, accept, timeoutMs = 9000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const result = await fetch(url, {
            method: "GET",
            headers: { accept, "accept-language": "ko-KR,ko;q=0.9", "user-agent": `KINOJO-Identity/${API_VERSION}` },
            signal: controller.signal,
            redirect: "follow",
        });
        const body = await result.text();
        if (!result.ok) {
            throw new ProviderError(`PLAYNC HTTP ${result.status}`, result.status, retryAfterMs(result.headers.get("retry-after")));
        }
        return body;
    }
    catch (error) {
        if (error instanceof ProviderError)
            throw error;
        if (error instanceof DOMException && error.name === "AbortError") {
            throw new ProviderError("PLAYNC 요청 시간 초과", 0, 60_000);
        }
        throw new ProviderError(text(error instanceof Error ? error.message : error, 300) || "PLAYNC 요청 실패", 0, 60_000);
    }
    finally {
        clearTimeout(timer);
    }
}
async function fetchJson(url) {
    const body = await fetchText(url, "application/json,text/plain,*/*", 8000);
    try {
        return body ? JSON.parse(body) : {};
    }
    catch {
        throw new Error("PLAYNC 검색 응답이 JSON 형식이 아닙니다.");
    }
}
function serviceEnv() {
    const url = text(Deno.env.get("SUPABASE_URL"), 500).replace(/\/$/, "");
    let key = text(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 3000);
    if (!key) {
        try {
            key = text(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default, 3000);
        }
        catch {
            key = "";
        }
    }
    if (!url || !key)
        throw new Error("Supabase service 환경 설정이 없습니다.");
    return { url, key };
}
async function rpc(name, body) {
    const env = serviceEnv();
    const result = await fetch(`${env.url}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { apikey: env.key, authorization: `Bearer ${env.key}`, "content-type": "application/json" },
        body: JSON.stringify(body),
    });
    const raw = await result.text();
    let value = {};
    try {
        value = raw ? JSON.parse(raw) : {};
    }
    catch {
        value = { ok: false, message: raw || `RPC HTTP ${result.status}` };
    }
    if (!result.ok)
        throw new Error(text(value.message || value.error || value.details || `RPC HTTP ${result.status}`, 500));
    return value;
}
async function candidateFromSearch(item, expectedKey, allowedServers) {
    const serverId = int(primitive(item, ["serverId", "server_id"]));
    const serverName = text(primitive(item, ["serverName", "server_name"]), 120);
    const characterName = text(primitive(item, ["characterName", "character_name", "name"]), 120);
    const className = text(primitive(item, ["className", "class_name", "jobName", "job_name"]), 80);
    const image = text(primitive(item, ["profileImageUrl", "profile_image_url", "profileImage", "imageUrl", "image"]), 1200);
    let url = text(primitive(item, ["detailUrl", "detail_url", "url", "characterUrl"]), 1200);
    const platformId = decodePlatformId(primitive(item, ["characterId", "character_id", "encryptedCharacterId"]));
    if (!serverId || !allowedServers.has(serverId))
        return null;
    if (!url && serverId && platformId)
        url = `https://aion2.plaync.com/ko-kr/characters/${serverId}/${pathSegment(platformId)}`;
    if (serverId && platformId) {
        try {
            const infoUrl = new URL("https://aion2.plaync.com/api/character/info");
            infoUrl.searchParams.set("lang", "ko");
            infoUrl.searchParams.set("serverId", serverId);
            infoUrl.searchParams.set("characterId", platformId);
            const info = await fetchJson(infoUrl.toString());
            const infoKey = charKeyFromPayload(info);
            if (!infoKey)
                return null;
            const infoName = text(primitive(info, ["characterName", "character_name", "name"]), 120) || characterName;
            const infoServerName = text(primitive(info, ["serverName", "server_name"]), 120) || serverName;
            const infoClassName = text(primitive(info, ["className", "class_name"]), 80) || className;
            const infoImage = text(primitive(info, ["profileImage", "profileImageUrl", "profile_image_url"]), 1200) || image;
            return {
                serverId, serverName: infoServerName, characterName: infoName, className: infoClassName,
                profileImageUrl: infoImage, detailUrl: url, charKey: infoKey,
                characterId: platformId,
                keyMatched: infoKey === expectedKey,
                method: infoKey === expectedKey
                    ? "OFFICIAL_CHARACTER_INFO_EXACT_KEY"
                    : "OFFICIAL_CHARACTER_INFO_KEY_MISMATCH",
            };
        }
        catch (error) {
            if (error instanceof ProviderError && error.status !== 404)
                throw error;
            return null;
        }
    }
    return null;
}
async function probe(prepared) {
    const expectedKey = text(prepared.charKey, 240);
    const current = row(prepared.current) || prepared;
    const oldName = text(current.characterName || prepared.previousCharacterName, 120);
    const servers = Array.isArray(prepared.servers) ? prepared.servers.map(row).filter(Boolean) : [];
    const raceId = int(prepared.raceId || current.raceId);
    const allowedServers = new Set(servers.map((server) => int(server.serverId)).filter(Boolean));
    const candidateNames = [
        text(prepared.candidateName, 120),
        ...(Array.isArray(prepared.candidateNames) ? prepared.candidateNames.map((value) => text(value, 120)) : []),
    ].filter((name) => !!name && !charKey(name));
    const evidence = {
        policy: "STORED_DETAIL_HANDLED_BY_WORKER_THEN_OFFICIAL_NAME_SEARCH_EXACT_KEY_SAME_RACE_ONLY",
        raceId,
        sameRaceServerCount: allowedServers.size,
        oldName,
        charKeySearchEnabled: false,
        nameSearchCount: 0,
        detailServerProbeCount: 0,
        blockedCrossRaceCandidates: 0,
        failures: [],
        reviewCandidates: [],
    };
    if (!expectedKey)
        return { candidate: null, evidence: { ...evidence, code: "PERSISTENT_CHAR_KEY_NOT_FOUND" } };
    if (!raceId || !allowedServers.size) {
        return { candidate: null, evidence: { ...evidence, code: "SERVER_RACE_NOT_FOUND", retryable: false } };
    }
    const searchKeyword = async (keyword, stage) => {
        const url = new URL("https://aion2.plaync.com/ko-kr/api/search/aion2/search/v2/character");
        url.searchParams.set("keyword", keyword);
        url.searchParams.set("page", "1");
        url.searchParams.set("size", "50");
        const payload = await fetchJson(url.toString());
        const candidates = list(payload).map(row).filter(Boolean);
        evidence.nameSearchCount = Number(evidence.nameSearchCount || 0) + candidates.length;
        for (const item of candidates) {
            const serverId = int(primitive(item, ["serverId", "server_id"]));
            if (serverId && !allowedServers.has(serverId)) {
                evidence.blockedCrossRaceCandidates = Number(evidence.blockedCrossRaceCandidates || 0) + 1;
                continue;
            }
            const resolved = await candidateFromSearch(item, expectedKey, allowedServers);
            if (!resolved)
                continue;
            if (resolved.keyMatched === true) {
                resolved.method = stage === "CANDIDATE_NAME_SEARCH"
                    ? "OFFICIAL_HINT_NAME_SEARCH_AND_INFO_EXACT_KEY"
                    : "OFFICIAL_OLD_NAME_SEARCH_AND_INFO_EXACT_KEY";
                return resolved;
            }
            if (normalizeName(primitive(item, ["characterName", "character_name", "name"])) === normalizeName(keyword)
                && evidence.reviewCandidates.length < 10) {
                evidence.reviewCandidates.push({
                    ...safeCandidate(resolved),
                    charKey: text(resolved.charKey, 240),
                    keyMatched: false,
                    reason: "CHAR_KEY_MISMATCH_ADMIN_REVIEW_REQUIRED",
                });
            }
        }
        return null;
    };
    const keywords = [
        ...candidateNames.filter((name, index, values) => values.indexOf(name) === index && normalizeName(name) !== normalizeName(oldName))
            .map((value) => ({ value, stage: "CANDIDATE_NAME_SEARCH" })),
        ...(oldName && !charKey(oldName) ? [{ value: oldName, stage: "OLD_NAME_SEARCH" }] : []),
    ];
    for (const keyword of keywords) {
        try {
            const resolved = await searchKeyword(keyword.value, keyword.stage);
            if (resolved)
                return { candidate: resolved, evidence: { ...evidence, matchedBy: resolved.method } };
        }
        catch (error) {
            evidence.failures.push(providerFailure(keyword.stage, error));
            if (hasRetryableFailure(evidence.failures)) {
                const retryAfter = Math.max(0, ...evidence.failures.map((failure) => Number(failure.retryAfterSeconds || 0)));
                return {
                    candidate: null,
                    evidence: { ...evidence, code: "PROVIDER_RETRY_REQUIRED", retryable: true, retryAfterSeconds: retryAfter },
                };
            }
        }
    }
    if (hasRetryableFailure(evidence.failures)) {
        const retryAfter = Math.max(0, ...evidence.failures.map((failure) => Number(failure.retryAfterSeconds || 0)));
        return {
            candidate: null,
            evidence: { ...evidence, code: "PROVIDER_RETRY_REQUIRED", retryable: true, retryAfterSeconds: retryAfter },
        };
    }
    return {
        candidate: null,
        evidence: {
            ...evidence,
            code: evidence.reviewCandidates.length
                ? "IDENTITY_REVIEW_REQUIRED"
                : "IDENTITY_HINT_REQUIRED",
            retryable: false,
            confirmedAbsent: false,
            identityHintRequired: true,
        },
    };
}
async function appsScript(payload, timeoutMs = 180000) {
    const url = text(Deno.env.get("KINOJO_SHEET_SYNC_WEBAPP_URL"), 1200);
    if (!url)
        throw new Error("KINOJO_SHEET_SYNC_WEBAPP_URL이 없습니다.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const result = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal, redirect: "follow" });
        const raw = await result.text();
        let value = {};
        try {
            value = raw ? JSON.parse(raw) : {};
        }
        catch {
            throw new Error(raw || `Apps Script HTTP ${result.status}`);
        }
        if (!result.ok)
            throw new Error(text(value.message || value.code || `Apps Script HTTP ${result.status}`, 500));
        return value;
    }
    finally {
        clearTimeout(timer);
    }
}
async function syncList(listUpdate) {
    if (!int(listUpdate.listRow))
        return { ok: false, code: "LIST_ROW_REQUIRED", message: "list 행 정보가 없습니다." };
    const update = {
        id: int(listUpdate.id) || int(listUpdate.listRow), listRow: int(listUpdate.listRow),
        originalListName: text(listUpdate.originalListName, 160), listDisplayName: text(listUpdate.listDisplayName, 160),
        characterName: text(listUpdate.characterName, 120), serverId: int(listUpdate.serverId), serverName: text(listUpdate.serverName, 120), className: text(listUpdate.className, 80),
        pveItemLevel: listUpdate.pveItemLevel ?? null, pveCombatPower: listUpdate.pveCombatPower ?? null,
        pvpItemLevel: listUpdate.pvpItemLevel ?? null, pvpCombatPower: listUpdate.pvpCombatPower ?? null,
        latestPowerTotal: listUpdate.latestPowerTotal ?? null, latestItemLevelTotal: listUpdate.latestItemLevelTotal ?? null,
        clearPveStats: false, clearPvpStats: false,
        identityChanged: listUpdate.identityChanged === true,
        previousCharacterName: text(listUpdate.previousCharacterName, 160),
        previousServerId: int(listUpdate.previousServerId),
        mainCharacterRenamed: listUpdate.mainCharacterRenamed === true,
    };
    const written = await appsScript({ action: "serverListSheetSync", noReviewToSheet: true, clientVersion: API_VERSION, source: "supabase-edge:character-identity-recovery", updates: [update] });
    if (written.ok !== true || text(written.bridgeRole) !== "APPSCRIPT_MASTER")
        return { ok: false, code: "LIST_SYNC_FAILED", message: text(written.message || written.code || "list 시트 쓰기 실패"), bridge: written };
    const readback = await appsScript({ action: "serverListSheetRead", clientVersion: API_VERSION, source: "supabase-edge:character-identity-recovery:readback" });
    const rows = Array.isArray(readback.list) ? readback.list.map(row).filter(Boolean) : [];
    const actual = rows.find((item) => int(item.row) === int(update.listRow)) || null;
    const expected = normalizeName(update.listDisplayName || update.characterName);
    const found = normalizeName(actual && (actual.originalName || actual.characterName || actual.name));
    if (readback.ok !== true || text(readback.bridgeRole) !== "APPSCRIPT_MASTER" || !actual || expected !== found)
        return { ok: false, code: "LIST_READBACK_MISMATCH", message: `list ${update.listRow}행 재검증이 일치하지 않습니다.`, expected: update.listDisplayName || update.characterName, actual: actual && (actual.originalName || actual.characterName || actual.name) || "" };
    return { ok: true, listRow: update.listRow, listDisplayName: update.listDisplayName || update.characterName, message: "AppsScript_MASTER 쓰기와 list 행 재검증 완료" };
}
Deno.serve(async (request) => {
    if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers: CORS });
    if (request.method !== "POST")
        return response({ ok: false, message: "POST만 허용합니다." }, 405);
    try {
        const body = await request.json().catch(() => ({}));
        const action = text(body.action, 80);
        if (action === "health")
            return response({ ok: true, service: "character-identity-recovery", apiVersion: API_VERSION, databaseContract: CONTRACT, policy: "STORED_DETAIL_WORKER_FIRST_NAME_SEARCH_SAME_RACE_CHAR_KEY_VERIFY" });
        if (action === "extensionProbe") {
            const sessionId = text(body.sessionId || body.session_id, 200);
            const sessionToken = text(body.sessionToken || body.session_token, 200);
            const targetId = int(body.targetId || body.target_id);
            if (!sessionId || !sessionToken || !targetId)
                return response({ ok: false, code: "RECOVERY_CONTEXT_REQUIRED", message: "조회 세션과 targetId가 필요합니다." }, 400);
            const prepared = await rpc("kinojo_character_identity_recovery_prepare_v293", { p_session_id: sessionId, p_session_token: sessionToken, p_target_id: targetId });
            if (prepared.ok !== true)
                return response(prepared, 400);
            prepared.candidateName = text(body.candidateName || body.candidate_name || prepared.candidateName, 120);
            const resolved = await probe(prepared);
            if (!resolved.candidate) {
                const reviewCandidates = Array.isArray(resolved.evidence.reviewCandidates) ? resolved.evidence.reviewCandidates.map(row).filter(Boolean) : [];
                for (const candidate of reviewCandidates) {
                    await rpc("kinojo_identity_review_upsert_v287", {
                        p_character_id: int(prepared.characterId),
                        p_source_session_id: sessionId,
                        p_candidate: candidate,
                        p_evidence: resolved.evidence,
                    });
                }
                const notFound = await rpc("kinojo_character_identity_recovery_not_found_v293", { p_session_id: sessionId, p_session_token: sessionToken, p_target_id: targetId, p_evidence: resolved.evidence });
                return response({
                    ...notFound,
                    recovered: false,
                    reviewRequired: reviewCandidates.length > 0,
                    retryable: reviewCandidates.length ? false : notFound.retryable,
                    code: reviewCandidates.length ? "IDENTITY_REVIEW_REQUIRED" : notFound.code,
                    candidate: null, probes: resolved.evidence, evidence: resolved.evidence,
                });
            }
            const applied = await rpc("kinojo_character_identity_recovery_apply_v1", { p_session_id: sessionId, p_session_token: sessionToken, p_target_id: targetId, p_candidate: resolved.candidate });
            const safe = safeCandidate(resolved.candidate);
            const current = row(applied.current) || safe || {};
            const resolvedCharacterId = detailKey(current.detailUrl || resolved.candidate.detailUrl);
            return response({
                ...applied,
                recovered: applied.ok === true && applied.applied === true,
                candidate: safe,
                current,
                character: {
                    characterName: current.characterName || resolved.candidate.characterName || "",
                    serverId: current.serverId || resolved.candidate.serverId || null,
                    serverName: current.serverName || resolved.candidate.serverName || "",
                    characterId: resolvedCharacterId,
                    detailUrl: current.detailUrl || resolved.candidate.detailUrl || "",
                    profileImageUrl: current.profileImageUrl || resolved.candidate.profileImageUrl || "",
                },
                probes: resolved.evidence,
                evidence: resolved.evidence,
            });
        }
        if (action === "adminProbe" || action === "adminApply") {
            const passKey = text(body.passKey || body.pass_key, 80);
            const characterId = int(body.characterId || body.character_id);
            if (!passKey || !characterId)
                return response({ ok: false, code: "ADMIN_CONTEXT_REQUIRED", message: "관리자 로그인과 characterId가 필요합니다." }, 400);
            const prepared = await rpc("kinojo_admin_character_identity_prepare_v293", { p_pass_key: passKey, p_character_id: characterId });
            if (prepared.ok !== true)
                return response(prepared, 403);
            prepared.candidateName = text(body.candidateName || body.candidate_name || prepared.candidateName, 120);
            const resolved = await probe(prepared);
            if (action === "adminProbe") {
                const reviewCandidates = Array.isArray(resolved.evidence.reviewCandidates) ? resolved.evidence.reviewCandidates.map(row).filter(Boolean) : [];
                for (const candidate of reviewCandidates) {
                    await rpc("kinojo_identity_review_upsert_v287", {
                        p_character_id: characterId,
                        p_source_session_id: "admin:web",
                        p_candidate: candidate,
                        p_evidence: resolved.evidence,
                    });
                }
                await rpc("kinojo_admin_character_identity_record_probe_v1", {
                    p_pass_key: passKey, p_character_id: characterId,
                    p_status: resolved.candidate ? "CANDIDATE_FOUND" : text(resolved.evidence.code || "IDENTITY_HINT_REQUIRED", 80),
                    p_message: resolved.candidate
                        ? "공식 조회에서 기존 고유값과 일치하는 후보를 확인했습니다."
                        : resolved.evidence.code === "PROVIDER_RETRY_REQUIRED"
                            ? "PLAYNC 제한으로 검증을 보류하고 재시도 대기 상태로 기록했습니다."
                            : "공식 이름 조회에서 동일 고유값 후보를 찾지 못해 현재 이름 힌트가 필요합니다.",
                    p_candidate: resolved.candidate || {}, p_evidence: resolved.evidence,
                });
                return response({
                    ok: true, found: !!resolved.candidate, reviewRequired: reviewCandidates.length > 0,
                    characterId, current: prepared.current || null, candidate: safeCandidate(resolved.candidate),
                    reviewCandidates: reviewCandidates.map(safeCandidate),
                    charKeyMasked: prepared.charKeyMasked || "", evidence: resolved.evidence,
                    message: resolved.candidate
                        ? "동일 캐릭터 후보를 확인했습니다. 변경 전 내용을 검토하세요."
                        : reviewCandidates.length
                            ? "고유값이 다른 후보를 관리자 검토 대기열에 저장했습니다."
                            : "동일 고유값 후보를 찾지 못해 기존 값을 유지하며 현재 이름 힌트를 기다립니다.",
                });
            }
            if (!resolved.candidate)
                return response({ ok: false, code: "IDENTITY_CANDIDATE_NOT_FOUND", message: "변경 직전 재검증에서 동일 고유값 후보를 찾지 못했습니다.", evidence: resolved.evidence }, 409);
            const applied = await rpc("kinojo_admin_character_identity_apply_v1", { p_pass_key: passKey, p_character_id: characterId, p_candidate: resolved.candidate });
            if (applied.ok !== true)
                return response(applied, 400);
            const listPayload = await rpc("kinojo_identity_list_update_payload_v287", {
                p_character_id: characterId,
                p_previous: row(applied.previous) || {},
            });
            let sheet = { ok: false, code: "LIST_SYNC_NOT_RUN", message: "list 시트 동기화를 실행하지 못했습니다." };
            try {
                sheet = await syncList(listPayload.ok === true ? listPayload : row(applied.listUpdate) || {});
            }
            catch (error) {
                sheet = { ok: false, code: "LIST_SYNC_EXCEPTION", message: text(error instanceof Error ? error.message : error, 500) };
            }
            return response({ ...applied, candidate: safeCandidate(resolved.candidate), evidence: resolved.evidence, listSync: sheet, listSyncOk: sheet.ok === true, message: sheet.ok === true ? "캐릭터 정보와 list 시트를 반영했습니다." : "캐릭터 정보는 반영했지만 list 시트 동기화를 확인해야 합니다." });
        }
        if (action === "reviewApprove" || action === "reviewReject") {
            const passKey = text(body.passKey || body.pass_key, 80);
            const reviewId = int(body.reviewId || body.review_id);
            if (!passKey || !reviewId)
                return response({ ok: false, code: "ADMIN_CONTEXT_REQUIRED", message: "관리자 로그인과 reviewId가 필요합니다." }, 400);
            const decided = await rpc("kinojo_admin_identity_review_decide_v287", {
                p_pass_key: passKey,
                p_review_id: reviewId,
                p_approve: action === "reviewApprove",
                p_memo: text(body.memo, 1000),
            });
            if (decided.ok !== true)
                return response(decided, 400);
            if (action === "reviewReject")
                return response({ ...decided, message: "신원 후보를 거절하고 기존 정보를 유지했습니다." });
            let sheet = { ok: false, code: "LIST_SYNC_NOT_RUN", message: "list 시트 동기화를 실행하지 못했습니다." };
            try {
                sheet = await syncList(row(decided.listUpdate) || {});
            }
            catch (error) {
                sheet = { ok: false, code: "LIST_SYNC_EXCEPTION", message: text(error instanceof Error ? error.message : error, 500) };
            }
            return response({
                ...decided,
                listSync: sheet,
                listSyncOk: sheet.ok === true,
                message: sheet.ok === true ? "신원 변경과 list 시트 반영을 완료했습니다." : "신원 변경은 완료했지만 list 시트 readback을 확인해야 합니다.",
            });
        }
        return response({ ok: false, code: "UNKNOWN_ACTION", message: "지원하지 않는 캐릭터 식별 action입니다." }, 400);
    }
    catch (error) {
        return response({ ok: false, code: "IDENTITY_RECOVERY_ERROR", message: text(error instanceof Error ? error.message : error, 500) }, 400);
    }
});

