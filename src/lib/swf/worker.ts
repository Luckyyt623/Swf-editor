import { parseSwf } from "./parser";

interface InMsg {
  bytes: ArrayBuffer;
  fileName: string;
}

self.onmessage = (ev: MessageEvent<InMsg>) => {
  try {
    const bytes = new Uint8Array(ev.data.bytes);
    const project = parseSwf(bytes, ev.data.fileName, (p) => {
      self.postMessage({ type: "progress", ...p });
    });
    self.postMessage({ type: "done", project });
  } catch (err) {
    self.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
