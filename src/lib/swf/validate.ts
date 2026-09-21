import { parseAbc } from "../abc/parser";
import { decompressSwf } from "./compress";
import { TAG } from "./tags";
import type { SwfProject, ValidationCheck, ValidationResult } from "./types";
import { getTagBytes } from "./parser";
import { rebuildSwf } from "./writer";

export function validateProject(project: SwfProject, rebuilt?: Uint8Array): ValidationResult {
  const checks: ValidationCheck[] = [];
  const bytes = rebuilt ?? safeRebuild(project);

  push(checks, "header", "SWF header valid", () => {
    if (!bytes || bytes.length < 8) throw new Error("empty");
    const sig = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);
    if (!["FWS", "CWS", "ZWS"].includes(sig)) throw new Error(`bad signature ${sig}`);
    const version = bytes[3]!;
    if (version < 1 || version > 50) throw new Error(`implausible version ${version}`);
    return `v${version} ${sig}`;
  });

  let uncompressed: Uint8Array | null = null;
  push(checks, "compression", "Compression valid", () => {
    if (!bytes) throw new Error("no bytes");
    const { body, compression } = decompressSwf(bytes);
    uncompressed = body;
    const declared =
      body[4]! | (body[5]! << 8) | (body[6]! << 16) | (body[7]! << 24);
    if (declared !== body.length) {
      throw new Error(`declared length ${declared} != actual ${body.length}`);
    }
    return compression;
  });

  push(checks, "fileLength", "File length valid", () => {
    if (!uncompressed) throw new Error("not decompressed");
    return `${uncompressed.length} bytes`;
  });

  push(checks, "tags", "Tag structure valid", () => {
    if (!uncompressed) throw new Error("not decompressed");
    const tags = walkTags(uncompressed);
    if (tags.length === 0) throw new Error("no tags");
    if (tags[tags.length - 1]!.code !== TAG.End) throw new Error("missing End tag");
    return `${tags.length} tags`;
  });

  push(checks, "tagLengths", "Tag lengths valid", () => {
    if (!uncompressed) throw new Error("not decompressed");
    const tags = walkTags(uncompressed);
    let total = tags.reduce((s, t) => s + t.headerSize + t.length, 0);
    
    return `${tags.length} records, payload ${total} B`;
  });

  push(checks, "abc", "ABC structure valid", () => {
    let n = 0;
    for (const tag of project.tags) {
      if (tag.code !== TAG.DoABC && tag.code !== TAG.DoABCDefine) continue;
      const data = getTagBytes(project.body, tag);
      const abcBytes = tag.code === TAG.DoABC ? skipDoAbcHeader(data) : data;
      parseAbc(abcBytes);
      n++;
    }
    return `${n} ABC block(s)`;
  });

  push(checks, "cpool", "Constant pool valid", () => {
    for (const block of project.abcBlocks) {
      const p = block.abc.pool;
      if (p.strings.length === 0) throw new Error("empty strings table");
      if (p.multinames.length === 0) throw new Error("empty multinames");
    }
    const n = project.abcBlocks.reduce((s, b) => s + b.abc.pool.strings.length, 0);
    return `${n} strings across blocks`;
  });

  push(checks, "bodies", "Method bodies valid", () => {
    for (const block of project.abcBlocks) {
      for (const body of block.abc.bodies) {
        if (body.method >= block.abc.methods.length) {
          throw new Error(`body references missing method ${body.method}`);
        }
        if (body.localCount < 1) throw new Error("local_count < 1");
      }
    }
    const n = project.abcBlocks.reduce((s, b) => s + b.abc.bodies.length, 0);
    return `${n} method bodies`;
  });

  const ok = checks.every((c) => c.ok);
  return { ok, checks };
}

function skipDoAbcHeader(data: Uint8Array): Uint8Array {
  if (data.length < 5) return data;
  let i = 4;
  while (i < data.length && data[i] !== 0) i++;
  i++;
  return data.subarray(Math.min(i, data.length));
}

function walkTags(body: Uint8Array): { code: number; length: number; headerSize: number }[] {
  const out: { code: number; length: number; headerSize: number }[] = [];
  
  let pos = 8;
  const nbits = body[pos]! >> 3;
  const rectBits = 5 + nbits * 4;
  pos += Math.ceil(rectBits / 8);
  pos += 4; 
  while (pos + 2 <= body.length) {
    const record = body[pos]! | (body[pos + 1]! << 8);
    const code = record >> 6;
    let length = record & 0x3f;
    let headerSize = 2;
    pos += 2;
    if (length === 0x3f) {
      if (pos + 4 > body.length) throw new Error("truncated long header");
      length = body[pos]! | (body[pos + 1]! << 8) | (body[pos + 2]! << 16) | (body[pos + 3]! << 24);
      headerSize = 6;
      pos += 4;
    }
    if (pos + length > body.length) throw new Error(`tag ${code} overruns file`);
    out.push({ code, length, headerSize });
    pos += length;
    if (code === 0) break;
  }
  return out;
}

function safeRebuild(project: SwfProject): Uint8Array | null {
  try {
    return rebuildSwf(project);
  } catch {
    return null;
  }
}

function push(checks: ValidationCheck[], id: string, label: string, fn: () => string | void) {
  try {
    const detail = fn();
    checks.push({ id, label, ok: true, detail: detail ? String(detail) : undefined });
  } catch (err) {
    checks.push({
      id,
      label,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
