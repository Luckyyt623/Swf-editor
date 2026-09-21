import { ByteReader, rectPixels } from "./binary";
import { decompressSwf } from "./compress";
import { ABC_TAGS, TAG, tagHasCharacterId, tagName } from "./tags";
import type { AbcBlock, ProgressFn, SwfHeader, SwfProject, SwfTag, SymbolBinding } from "./types";
import { parseAbc } from "../abc/parser";

export function parseSwf(bytes: Uint8Array, fileName: string, onProgress?: ProgressFn): SwfProject {
  onProgress?.({ phase: "decompress", percent: 5, message: "Reading header" });
  if (bytes.length < 8) throw new Error("File too small to be an SWF");

  const originalBytes = bytes.slice();
  const { body, compression } = decompressSwf(originalBytes);
  onProgress?.({ phase: "decompress", percent: 25, message: "Decompressed" });

  const r = new ByteReader(body);
  const sig = String.fromCharCode(r.ui8(), r.ui8(), r.ui8());
  const version = r.ui8();
  const fileLength = r.ui32();
  const frameSize = r.rect();
  const { width: frameWidth, height: frameHeight } = rectPixels(frameSize);
  const frameRate = r.ui16() / 256;
  const frameCount = r.ui16();

  const header: SwfHeader = {
    signature: sig,
    compression,
    version,
    fileLength,
    compressedSize: originalBytes.length,
    frameSize,
    frameWidth,
    frameHeight,
    frameRate,
    frameCount,
    asVersion: version >= 9 ? 3 : version >= 7 ? 2 : 1,
  };

  const tags: SwfTag[] = [];
  let jpegTables: Uint8Array | undefined;
  const symbols: SymbolBinding[] = [];
  const exports: SymbolBinding[] = [];
  let fileAttributesAs3 = false;

  onProgress?.({ phase: "tags", percent: 30, message: "Parsing tags" });

  while (r.pos < body.length) {
    const headerOffset = r.pos;
    if (r.remaining < 2) break;
    const record = r.ui16();
    const code = record >> 6;
    let length = record & 0x3f;
    let longHeader = false;
    if (length === 0x3f) {
      if (r.remaining < 4) break;
      length = r.ui32();
      longHeader = true;
    }
    if (length < 0 || r.pos + length > body.length) {
      throw new Error(`Tag ${code} (${tagName(code)}) at ${headerOffset} overruns file (len=${length})`);
    }
    const offset = r.pos;
    const data = body.subarray(offset, offset + length);
    const tag: SwfTag = {
      id: tags.length,
      index: tags.length,
      code,
      name: tagName(code),
      offset,
      length,
      longHeader,
      headerOffset,
    };
    if (tagHasCharacterId(code) && length >= 2) {
      tag.characterId = data[0]! | (data[1]! << 8);
    }
    tags.push(tag);

    if (code === TAG.JPEGTables) jpegTables = data.slice();
    if (code === TAG.FileAttributes && length >= 4) {
      const flags = data[0]! | (data[1]! << 8) | (data[2]! << 16) | (data[3]! << 24);
      
      
      
      
      if (flags & 0x08) {
        fileAttributesAs3 = true;
        header.asVersion = 3;
      }
    }
    if (code === TAG.FrameLabel) {
      try {
        const tr = new ByteReader(data);
        tag.label = tr.swfString();
      } catch {
        
      }
    }
    if (code === TAG.SymbolClass) parseSymbolTable(data, tags.length - 1, symbols);
    if (code === TAG.ExportAssets) parseSymbolTable(data, tags.length - 1, exports);

    r.pos = offset + length;
    if (code === TAG.End) break;

    if (tags.length % 250 === 0) {
      const pct = 30 + Math.min(50, (r.pos / body.length) * 50);
      onProgress?.({ phase: "tags", percent: pct, message: `Parsed ${tags.length} tags` });
    }
  }

  if (!fileAttributesAs3 && header.version < 9) {
    header.asVersion = header.version >= 7 ? 2 : 1;
  }

  onProgress?.({ phase: "abc", percent: 82, message: "Parsing ActionScript" });
  const abcBlocks: AbcBlock[] = [];
  for (const tag of tags) {
    if (!ABC_TAGS.has(tag.code)) continue;
    try {
      const block = parseDoAbc(getTagBytes(body, tag), tag);
      abcBlocks.push(block);
    } catch (err) {
      
      console.warn(`DoABC tag #${tag.index} failed:`, err);
    }
  }

  applySymbolLabels(tags, symbols, exports, abcBlocks);

  onProgress?.({ phase: "done", percent: 100, message: "Ready" });

  const backupName = backupFileName(fileName);
  return {
    fileName,
    originalBytes,
    body,
    header,
    tags,
    nextTagId: tags.length,
    abcBlocks,
    symbols,
    exports,
    jpegTables,
    dirty: false,
    backupName,
  };
}

export function getTagBytes(body: Uint8Array, tag: SwfTag): Uint8Array {
  if (tag.data) return tag.data;
  return body.subarray(tag.offset, tag.offset + tag.length);
}

function parseSymbolTable(data: Uint8Array, tagIndex: number, out: SymbolBinding[]) {
  const r = new ByteReader(data);
  if (r.remaining < 2) return;
  const count = r.ui16();
  for (let i = 0; i < count && r.remaining > 0; i++) {
    const characterId = r.ui16();
    const name = r.swfString();
    out.push({ characterId, name, tagIndex });
  }
}

function parseDoAbc(data: Uint8Array, tag: SwfTag): AbcBlock {
  const r = new ByteReader(data);
  let flags = 0;
  let name = "";
  if (tag.code === TAG.DoABC) {
    flags = r.ui32();
    name = r.swfString();
  }
  const raw = r.rest().slice();
  const abc = parseAbc(raw);
  return { tagIndex: tag.index, tagId: tag.id, flags, name, abc, raw };
}

function applySymbolLabels(
  tags: SwfTag[],
  symbols: SymbolBinding[],
  exports: SymbolBinding[],
  abcBlocks: AbcBlock[],
) {
  const names = new Map<number, string>();
  for (const s of [...exports, ...symbols]) {
    if (s.name) names.set(s.characterId, s.name);
  }
  for (const t of tags) {
    if (t.characterId != null && names.has(t.characterId)) {
      t.label = names.get(t.characterId);
    }
  }

  for (const s of symbols) {
    if (s.characterId === 0) {
      const firstAbc = abcBlocks[0];
      if (firstAbc && !firstAbc.name) firstAbc.name = s.name;
    }
  }
}

export function backupFileName(fileName: string): string {
  const base = fileName.replace(/\.swf$/i, "");
  return `${base}_backup.swf`;
}

export function modifiedFileName(fileName: string): string {
  const base = fileName.replace(/\.swf$/i, "");
  return `${base}_modified.swf`;
}

export function inspectTagProperties(project: SwfProject, tag: SwfTag): Record<string, string | number | boolean> {
  const data = getTagBytes(project.body, tag);
  const r = new ByteReader(data);
  const props: Record<string, string | number | boolean> = {
    tagId: tag.code,
    type: tag.name,
    rawSize: tag.length,
    longHeader: tag.longHeader,
  };
  if (tag.characterId != null) props.characterId = tag.characterId;
  if (tag.label) props.symbol = tag.label;
  try {
    switch (tag.code) {
      case TAG.SetBackgroundColor:
        props.color = "#" + r.rgb().toString(16).padStart(6, "0");
        break;
      case TAG.FileAttributes: {
        const flags = r.ui32();
        props.useDirectBlit = Boolean(flags & 0x40);
        props.useGPU = Boolean(flags & 0x20);
        props.hasMetadata = Boolean(flags & 0x10);
        props.actionScript3 = Boolean(flags & 0x08);
        props.useNetwork = Boolean(flags & 0x01);
        break;
      }
      case TAG.ShowFrame:
        props.kind = "frame advance";
        break;
      case TAG.FrameLabel:
        props.label = r.swfString();
        break;
      case TAG.DefineSprite: {
        props.spriteId = r.ui16();
        props.frameCount = r.ui16();
        break;
      }
      case TAG.DoABC:
      case TAG.DoABCDefine: {
        if (tag.code === TAG.DoABC) {
          props.flags = r.ui32();
          props.abcName = r.swfString();
        }
        const abc = project.abcBlocks.find((b) => b.tagIndex === tag.index);
        if (abc) {
          props.classes = abc.abc.instances.length;
          props.methods = abc.abc.methods.length;
          props.strings = Math.max(0, abc.abc.pool.strings.length - 1);
        }
        break;
      }
      case TAG.SymbolClass: {
        const n = r.ui16();
        props.count = n;
        break;
      }
      case TAG.DefineBitsJPEG2:
      case TAG.DefineBitsJPEG3:
      case TAG.DefineBitsJPEG4:
      case TAG.DefineBits:
      case TAG.DefineBitsLossless:
      case TAG.DefineBitsLossless2: {
        props.format = tag.name;
        break;
      }
      case TAG.DefineSound: {
        r.ui16();
        const b = r.ui8();
        props.soundFormat = b >> 4;
        props.rate = (b >> 2) & 3;
        props.bits = (b >> 1) & 1 ? 16 : 8;
        props.stereo = Boolean(b & 1);
        props.sampleCount = r.ui32();
        break;
      }
      case TAG.DefineBinaryData: {
        props.binaryId = r.ui16();
        props.reserved = r.ui32();
        props.payload = data.length - 6;
        break;
      }
      default:
        break;
    }
  } catch {
    
  }
  return props;
}
