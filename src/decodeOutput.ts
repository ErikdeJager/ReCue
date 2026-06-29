// Decode a base64 `session://output` payload into the raw PTY bytes (#261).
//
// The backend now sends terminal output as a base64 STRING rather than a JSON
// integer array (`[27,91,49,...]`, ~4 chars/byte): an 8 KB read used to balloon to
// ~25–40 KB of JSON that the single WebView main thread had to `JSON.parse` +
// `Uint8Array.from(number[])` before writing to xterm, so heavy output starved
// React keystroke handling everywhere (the Kanban textarea, other terminals).
// base64 is ~1.33 chars/byte and decodes here with a tight `atob` byte loop —
// no parser, no array-of-numbers allocation. `atob` exists in both WKWebView
// (macOS) and WebView2 (Windows), so this is platform-neutral.
export function decodeOutputB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = bin.charCodeAt(i);
  return out;
}
