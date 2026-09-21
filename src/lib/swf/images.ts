import { unzlibSync, zlibSync } from "fflate";
import { ByteReader, ByteWriter } from "./binary";
import { TAG } from "./tags";
import { getTagBytes } from "./parser";
import type { SwfProject, SwfTag } from "./types";
import { setTagData } from "./writer";

export interface DecodedImage {
  characterId: number;
  width: number;
  height: number;
  rgba: Uint8Array;
  source: "jpeg" | "png" | "gif" | "lossless" | "lossless2";
  hasAlpha: boolean;
  tagCode: number;
}

export function isImageTag(code: number): boolean {
  return (
    code === TAG.DefineBits ||
    code === TAG.DefineBitsJPEG2 ||
    code === TAG.DefineBitsJPEG3 ||
    code === TAG.DefineBitsJPEG4 ||
    code === TAG.DefineBitsLossless ||
    code === TAG.DefineBitsLossless2
  );
}

export function decodeImageTag(project: SwfProject, tag: SwfTag): DecodedImage {
  const data = getTagBytes(project.body, tag);
  if (tag.code === TAG.DefineBitsLossless || tag.code === TAG.DefineBitsLossless2) {
    return decodeLossless(data, tag.code);
  }
  return decodeJpegFamily(data, tag.code, project.jpegTables);
}

function decodeLossless(data: Uint8Array, tagCode: number): DecodedImage {
  const r = new ByteReader(data);
  const characterId = r.ui16();
  const format = r.ui8();
  const width = r.ui16();
  const height = r.ui16();
  const hasAlpha = tagCode === TAG.DefineBitsLossless2;
  let colorTableSize = 0;
  if (format === 3) colorTableSize = r.ui8() + 1;
  const packed = r.rest();
  let raw: Uint8Array;
  try {
    raw = unzlibSync(packed);
  } catch (err) {
    throw new Error(`Lossless zlib failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const rgba = new Uint8Array(width * height * 4);
  if (format === 3) {
    const bpp = hasAlpha ? 4 : 3;
    const table = raw.subarray(0, colorTableSize * bpp);
    const pixels = raw.subarray(colorTableSize * bpp);
    const stride = (width + 3) & ~3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = pixels[y * stride + x] ?? 0;
        const o = idx * bpp;
        const p = (y * width + x) * 4;
        rgba[p] = table[o] ?? 0;
        rgba[p + 1] = table[o + 1] ?? 0;
        rgba[p + 2] = table[o + 2] ?? 0;
        rgba[p + 3] = hasAlpha ? (table[o + 3] ?? 255) : 255;
      }
    }
  } else if (format === 4) {
    
    const stride = (width * 2 + 3) & ~3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const o = y * stride + x * 2;
        const v = (raw[o] ?? 0) | ((raw[o + 1] ?? 0) << 8);
        const p = (y * width + x) * 4;
        rgba[p] = ((v >> 10) & 0x1f) << 3;
        rgba[p + 1] = ((v >> 5) & 0x1f) << 3;
        rgba[p + 2] = (v & 0x1f) << 3;
        rgba[p + 3] = 255;
      }
    }
  } else {
    
    for (let i = 0; i < width * height; i++) {
      const o = i * 4;
      const a = hasAlpha ? (raw[o] ?? 255) : 255;
      const r8 = raw[o + 1] ?? 0;
      const g8 = raw[o + 2] ?? 0;
      const b8 = raw[o + 3] ?? 0;
      const p = i * 4;
      rgba[p] = r8;
      rgba[p + 1] = g8;
      rgba[p + 2] = b8;
      rgba[p + 3] = a;
    }
  }
  return {
    characterId,
    width,
    height,
    rgba,
    source: hasAlpha ? "lossless2" : "lossless",
    hasAlpha,
    tagCode,
  };
}

function unwrapFlashJpeg(data: Uint8Array): Uint8Array {
  
  if (
    data.length > 4 &&
    data[0] === 0xff &&
    data[1] === 0xd8 &&
    data[2] === 0xff &&
    data[3] === 0xd9
  ) {
    return data.subarray(4);
  }
  return data;
}

function magicOf(data: Uint8Array): "jpeg" | "png" | "gif" | "unknown" {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "jpeg";
  if (data.length >= 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47)
    return "png";
  if (data.length >= 6 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) return "gif";
  return "unknown";
}

function decodeJpegFamily(data: Uint8Array, tagCode: number, jpegTables?: Uint8Array): DecodedImage {
  const r = new ByteReader(data);
  const characterId = r.ui16();
  let imageBytes: Uint8Array;
  let alpha: Uint8Array | undefined;
  if (tagCode === TAG.DefineBitsJPEG3 || tagCode === TAG.DefineBitsJPEG4) {
    const alphaOffset = r.ui32();
    if (tagCode === TAG.DefineBitsJPEG4) r.ui16(); 
    const rest = r.rest();
    imageBytes = unwrapFlashJpeg(rest.subarray(0, alphaOffset));
    const alphaZ = rest.subarray(alphaOffset);
    if (alphaZ.length) {
      try {
        alpha = unzlibSync(alphaZ);
      } catch {
        alpha = undefined;
      }
    }
  } else if (tagCode === TAG.DefineBits) {
    const bits = unwrapFlashJpeg(r.rest());
    if (jpegTables && jpegTables.length) {
      const tables = unwrapFlashJpeg(jpegTables);
      
      let t = tables;
      if (t.length >= 2 && t[t.length - 2] === 0xff && t[t.length - 1] === 0xd9) t = t.subarray(0, t.length - 2);
      let b = bits;
      if (b.length >= 2 && b[0] === 0xff && b[1] === 0xd8) b = b.subarray(2);
      imageBytes = new Uint8Array(t.length + b.length);
      imageBytes.set(t, 0);
      imageBytes.set(b, t.length);
    } else {
      imageBytes = bits;
    }
  } else {
    imageBytes = unwrapFlashJpeg(r.rest());
  }

  const kind = magicOf(imageBytes);
  if (kind === "unknown") {
    throw new Error("Unrecognized embedded image (not JPEG/PNG/GIF)");
  }
  
  
  return {
    characterId,
    width: 0,
    height: 0,
    rgba: imageBytes, 
    source: kind,
    hasAlpha: Boolean(alpha),
    tagCode,
  };
}

export async function rasterizeEncodedImage(
  encoded: Uint8Array,
  alpha?: Uint8Array,
): Promise<{ width: number; height: number; rgba: Uint8Array }> {
  const copy = new Uint8Array(encoded.byteLength);
  copy.set(encoded);
  const blob = new Blob([copy]);
  const bmp = await createImageBitmap(blob);
  const width = bmp.width;
  const height = bmp.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const imageData = ctx.getImageData(0, 0, width, height);
  const rgba = imageData.data;
  if (alpha && alpha.length >= width * height) {
    for (let i = 0; i < width * height; i++) rgba[i * 4 + 3] = alpha[i]!;
  }
  return { width, height, rgba: new Uint8Array(rgba) };
}

export async function decodeImageForPreview(project: SwfProject, tag: SwfTag): Promise<DecodedImage> {
  const decoded = decodeImageTag(project, tag);
  if (decoded.source === "lossless" || decoded.source === "lossless2") return decoded;
  const encoded = decoded.rgba;
  const data = getTagBytes(project.body, tag);
  let alpha: Uint8Array | undefined;
  if (tag.code === TAG.DefineBitsJPEG3 || tag.code === TAG.DefineBitsJPEG4) {
    const r = new ByteReader(data);
    r.ui16();
    const alphaOffset = r.ui32();
    if (tag.code === TAG.DefineBitsJPEG4) r.ui16();
    const rest = r.rest();
    const alphaZ = rest.subarray(alphaOffset);
    if (alphaZ.length) {
      try {
        alpha = unzlibSync(alphaZ);
      } catch {
        alpha = undefined;
      }
    }
  }
  const rast = await rasterizeEncodedImage(encoded, alpha);
  return { ...decoded, width: rast.width, height: rast.height, rgba: rast.rgba, hasAlpha: decoded.hasAlpha || Boolean(alpha) };
}

export function rgbaToPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const dst = y * (width * 4 + 1);
    raw[dst] = 0;
    raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), dst + 1);
  }
  const idat = zlibSync(raw, { level: 9 });
  const parts: Uint8Array[] = [];
  parts.push(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  parts.push(pngChunk("IHDR", pngIhdr(width, height)));
  parts.push(pngChunk("IDAT", idat));
  parts.push(pngChunk("IEND", new Uint8Array(0)));
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function pngIhdr(w: number, h: number): Uint8Array {
  const b = new Uint8Array(13);
  const v = new DataView(b.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  b[8] = 8;
  b[9] = 6;
  return b;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const v = new DataView(out.buffer);
  v.setUint32(0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcSrc = out.subarray(4, 8 + data.length);
  v.setUint32(8 + data.length, crc32(crcSrc));
  return out;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function encodeLossless2(characterId: number, width: number, height: number, rgba: Uint8Array): Uint8Array {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    pixels[o] = rgba[o + 3] ?? 255;
    pixels[o + 1] = rgba[o] ?? 0;
    pixels[o + 2] = rgba[o + 1] ?? 0;
    pixels[o + 3] = rgba[o + 2] ?? 0;
  }
  const packed = zlibSync(pixels, { level: 9 });
  const w = new ByteWriter();
  w.ui16(characterId);
  w.ui8(5);
  w.ui16(width);
  w.ui16(height);
  w.bytes(packed);
  return w.toBytes();
}

export function encodeJpeg2(characterId: number, jpegBytes: Uint8Array): Uint8Array {
  const w = new ByteWriter();
  w.ui16(characterId);
  w.bytes(jpegBytes);
  return w.toBytes();
}

export function encodePngAsJpeg2(characterId: number, pngBytes: Uint8Array): Uint8Array {
  return encodeJpeg2(characterId, pngBytes);
}

export async function replaceImageFromFile(
  project: SwfProject,
  tagIndex: number,
  file: File,
  opts: { preserveDimensions: boolean; preserveTransparency: boolean; original?: DecodedImage },
): Promise<DecodedImage> {
  const tag = project.tags[tagIndex];
  if (!tag) throw new Error("No such tag");
  const bmp = await createImageBitmap(file);
  let width = bmp.width;
  let height = bmp.height;
  const orig = opts.original;
  if (opts.preserveDimensions && orig && orig.width && orig.height) {
    width = orig.width;
    height = orig.height;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  bmp.close();
  const imageData = ctx.getImageData(0, 0, width, height);
  const rgba = new Uint8Array(imageData.data);
  const id = tag.characterId ?? 0;

  const wantAlpha = opts.preserveTransparency;
  const srcIsJpeg = tag.code === TAG.DefineBitsJPEG2 && !wantAlpha && file.type === "image/jpeg";

  if (srcIsJpeg) {
    const jpeg = await blobToBytes(file);
    setTagData(project, tagIndex, encodeJpeg2(id, jpeg));
  } else {
    
    tag.code = TAG.DefineBitsLossless2;
    tag.name = "DefineBitsLossless2";
    setTagData(project, tagIndex, encodeLossless2(id, width, height, rgba));
  }

  return {
    characterId: id,
    width,
    height,
    rgba,
    source: "lossless2",
    hasAlpha: true,
    tagCode: tag.code,
  };
}

function blobToBytes(file: Blob): Promise<Uint8Array> {
  return file.arrayBuffer().then((b) => new Uint8Array(b));
}

export function imageToCanvas(img: DecodedImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const data = new ImageData(new Uint8ClampedArray(img.rgba), img.width, img.height);
  ctx.putImageData(data, 0, 0);
  return canvas;
}
