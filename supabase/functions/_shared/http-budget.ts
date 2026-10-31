// Shared Edge input boundary: cap bytes while streaming, including chunked
// bodies, and stop consuming slow uploads instead of checking after allocation.
export async function readRequestText(request: Request, maxBytes: number, timeoutMs = 5000): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("REQUEST_TOO_LARGE");
  if (!request.body) return "";
  const reader = request.body.getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error("REQUEST_BODY_TIMEOUT"));
      void reader.cancel().catch(() => {});
    }, timeoutMs);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (true) {
        const {done,value} = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          void reader.cancel().catch(() => {});
          throw new Error("REQUEST_TOO_LARGE");
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
      return new TextDecoder().decode(bytes);
    })()]);
  } finally { clearTimeout(timer); }
}
