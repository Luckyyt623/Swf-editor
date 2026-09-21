import { zlibSync, unzlibSync } from "fflate";
import type { CompressionKind } from "./types";

export function detectCompression(bytes: Uint8Array): CompressionKind {
  if (bytes.length < 8) throw new Error("File too small to be an SWF");
  const a = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!);
  if (a === "FWS") return "none";
  if (a === "CWS") return "zlib";
  if (a === "ZWS") return "lzma";
  throw new Error(`Not an SWF file (signature ${a})`);
}

export function decompressSwf(bytes: Uint8Array): { body: Uint8Array; compression: CompressionKind } {
  if (bytes.length < 8) throw new Error("File too small to be an SWF");
  const compression = detectCompression(bytes);
  const version = bytes[3]!;

  if (compression === "none") {
    return { body: bytes, compression };
  }

  if (compression === "zlib") {
    const compressed = bytes.subarray(8);
    let unpacked: Uint8Array;
    try {
      unpacked = unzlibSync(compressed);
    } catch (err) {
      throw new Error(`Zlib decompress failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = new Uint8Array(8 + unpacked.length);
    body[0] = 0x46;
    body[1] = 0x57;
    body[2] = 0x53;
    body[3] = version;
    body[4] = bytes[4]!;
    body[5] = bytes[5]!;
    body[6] = bytes[6]!;
    body[7] = bytes[7]!;
    body.set(unpacked, 8);
    return { body, compression };
  }

  const unpacked = decompressZws(bytes);
  const body = new Uint8Array(8 + unpacked.length);
  body[0] = 0x46;
  body[1] = 0x57;
  body[2] = 0x53;
  body[3] = version;
  body[4] = bytes[4]!;
  body[5] = bytes[5]!;
  body[6] = bytes[6]!;
  body[7] = bytes[7]!;
  body.set(unpacked, 8);
  return { body, compression };
}

function decompressZws(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 17) throw new Error("Truncated LZMA SWF (ZWS)");
  const props = bytes.subarray(12, 17);
  const payload = bytes.subarray(17);
  const fileLength = bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24);
  const unpackedSize = Math.max(0, fileLength - 8);
  try {
    return lzmaDecode(props, payload, unpackedSize);
  } catch (err) {
    throw new Error(
      `LZMA (ZWS) decompress failed: ${err instanceof Error ? err.message : String(err)}. Re-save the file as CWS/FWS to open it.`,
    );
  }
}

function lzmaDecode(props: Uint8Array, data: Uint8Array, unpackedSize: number): Uint8Array {
  if (props.length < 5) throw new Error("Bad LZMA properties");
  const d = props[0]!;
  if (d >= 9 * 5 * 5) throw new Error("Bad LZMA lc/lp/pb");
  const lc = d % 9;
  const rest = (d / 9) | 0;
  const lp = rest % 5;
  const pb = (rest / 5) | 0;
  const dictSize = props[1]! | (props[2]! << 8) | (props[3]! << 16) | (props[4]! << 24) || 1;
  const out = new Uint8Array(unpackedSize || 1);
  const decoder = new LzmaDecoder(lc, lp, pb, dictSize, data);
  const n = decoder.decode(out, unpackedSize || out.length);
  return unpackedSize ? out : out.subarray(0, n);
}

class LzmaRange {
  range = 0xffffffff;
  code = 0;
  pos = 0;
  data: Uint8Array;
  constructor(data: Uint8Array) {
    this.data = data;
    for (let i = 0; i < 5; i++) this.code = ((this.code << 8) | this.read()) >>> 0;
  }
  read(): number {
    return this.pos < this.data.length ? this.data[this.pos++]! : 0;
  }
  normalize() {
    if (this.range < 0x1000000) {
      this.range = (this.range << 8) >>> 0;
      this.code = ((this.code << 8) | this.read()) >>> 0;
    }
  }
  decodeBit(probs: Uint16Array, index: number): number {
    this.normalize();
    const prob = probs[index]!;
    const bound = ((this.range >>> 11) * prob) >>> 0;
    if (this.code < bound) {
      this.range = bound;
      probs[index] = prob + ((2048 - prob) >>> 5);
      return 0;
    }
    this.range = (this.range - bound) >>> 0;
    this.code = (this.code - bound) >>> 0;
    probs[index] = prob - (prob >>> 5);
    return 1;
  }
  decodeDirect(num: number): number {
    let res = 0;
    for (let i = 0; i < num; i++) {
      this.normalize();
      this.range >>>= 1;
      this.code = (this.code - this.range) >>> 0;
      const t = 0 - (this.code >>> 31);
      this.code = (this.code + (this.range & t)) >>> 0;
      res = (res << 1) + (t + 1);
    }
    return res;
  }
}

function initProbs(n: number): Uint16Array {
  const a = new Uint16Array(n);
  a.fill(1024);
  return a;
}

class LzmaLenDecoder {
  choice = initProbs(2);
  low: Uint16Array;
  mid: Uint16Array;
  high = initProbs(256);
  constructor(numPosStates: number) {
    this.low = initProbs(numPosStates * 8);
    this.mid = initProbs(numPosStates * 8);
  }
  decode(r: LzmaRange, posState: number): number {
    if (r.decodeBit(this.choice, 0) === 0) {
      return bitTree(r, this.low, posState * 8, 3);
    }
    if (r.decodeBit(this.choice, 1) === 0) {
      return 8 + bitTree(r, this.mid, posState * 8, 3);
    }
    return 16 + bitTree(r, this.high, 0, 8);
  }
}

function bitTree(r: LzmaRange, probs: Uint16Array, offset: number, numBits: number): number {
  let m = 1;
  for (let i = 0; i < numBits; i++) {
    const bit = r.decodeBit(probs, offset + m);
    m = (m << 1) + bit;
  }
  return m - (1 << numBits);
}

function revBitTree(r: LzmaRange, probs: Uint16Array, offset: number, numBits: number): number {
  let m = 1;
  let symbol = 0;
  for (let i = 0; i < numBits; i++) {
    const bit = r.decodeBit(probs, offset + m);
    m = (m << 1) + bit;
    symbol |= bit << i;
  }
  return symbol;
}

class LzmaDecoder {
  range: LzmaRange;
  litProbs: Uint16Array;
  isMatch = initProbs(12 * 16);
  isRep = initProbs(12);
  isRepG0 = initProbs(12);
  isRepG1 = initProbs(12);
  isRepG2 = initProbs(12);
  isRep0Long = initProbs(12 * 16);
  posSlot = initProbs(4 * 64);
  posDecoders = initProbs(114);
  posAlign = initProbs(16);
  lenDec: LzmaLenDecoder;
  repLenDec: LzmaLenDecoder;
  lc: number;
  lp: number;
  pb: number;
  dictSize: number;
  constructor(lc: number, lp: number, pb: number, dictSize: number, data: Uint8Array) {
    this.lc = lc;
    this.lp = lp;
    this.pb = pb;
    this.dictSize = dictSize;
    this.range = new LzmaRange(data);
    this.litProbs = initProbs(0x300 << (lc + lp));
    const posStates = 1 << pb;
    this.lenDec = new LzmaLenDecoder(posStates);
    this.repLenDec = new LzmaLenDecoder(posStates);
  }
  decode(out: Uint8Array, size: number): number {
    let state = 0;
    let rep0 = 0;
    let rep1 = 0;
    let rep2 = 0;
    let rep3 = 0;
    let pos = 0;
    const posMask = (1 << this.pb) - 1;
    const literalPosMask = (1 << this.lp) - 1;
    while (pos < size) {
      const posState = pos & posMask;
      if (this.range.decodeBit(this.isMatch, (state << 4) + posState) === 0) {
        const prev = pos === 0 ? 0 : out[pos - 1]!;
        const litState = ((pos & literalPosMask) << this.lc) + (prev >> (8 - this.lc));
        const offset = 0x300 * litState;
        let symbol = 1;
        if (state >= 7) {
          let matchByte = out[pos - rep0 - 1]!;
          do {
            const matchBit = (matchByte >> 7) & 1;
            matchByte = (matchByte << 1) & 0xff;
            const bit = this.range.decodeBit(this.litProbs, offset + ((1 + matchBit) << 8) + symbol);
            symbol = (symbol << 1) | bit;
            if (matchBit !== bit) break;
          } while (symbol < 0x100);
        }
        while (symbol < 0x100) {
          const bit = this.range.decodeBit(this.litProbs, offset + symbol);
          symbol = (symbol << 1) | bit;
        }
        out[pos++] = symbol & 0xff;
        state = state < 4 ? 0 : state < 10 ? state - 3 : state - 6;
      } else {
        let len: number;
        if (this.range.decodeBit(this.isRep, state) === 1) {
          if (this.range.decodeBit(this.isRepG0, state) === 0) {
            if (this.range.decodeBit(this.isRep0Long, (state << 4) + posState) === 0) {
              state = state < 7 ? 9 : 11;
              if (pos === 0) throw new Error("LZMA dist underflow");
              out[pos] = out[pos - rep0 - 1]!;
              pos++;
              continue;
            }
          } else {
            let dist: number;
            if (this.range.decodeBit(this.isRepG1, state) === 0) dist = rep1;
            else {
              if (this.range.decodeBit(this.isRepG2, state) === 0) dist = rep2;
              else {
                dist = rep3;
                rep3 = rep2;
              }
              rep2 = rep1;
            }
            rep1 = rep0;
            rep0 = dist;
          }
          len = this.repLenDec.decode(this.range, posState);
          state = state < 7 ? 8 : 11;
        } else {
          rep3 = rep2;
          rep2 = rep1;
          rep1 = rep0;
          len = this.lenDec.decode(this.range, posState);
          state = state < 7 ? 7 : 10;
          const posSlot = bitTree(this.range, this.posSlot, Math.min(len, 3) * 64, 6);
          if (posSlot >= 4) {
            const numDirect = (posSlot >> 1) - 1;
            let dist = (2 | (posSlot & 1)) << numDirect;
            if (posSlot < 14) {
              dist += revBitTree(this.range, this.posDecoders, dist - posSlot, numDirect);
            } else {
              dist += this.range.decodeDirect(numDirect - 4) << 4;
              dist += revBitTree(this.range, this.posAlign, 0, 4);
            }
            rep0 = dist;
          } else {
            rep0 = posSlot;
          }
        }
        len += 2;
        if (rep0 >= pos && size > 0) throw new Error("LZMA invalid distance");
        for (let i = 0; i < len && pos < size; i++) {
          out[pos] = out[pos - rep0 - 1]!;
          pos++;
        }
      }
    }
    return pos;
  }
}

export function compressSwf(uncompressedFws: Uint8Array, compression: CompressionKind): Uint8Array {
  if (uncompressedFws.length < 8) throw new Error("SWF too small to compress");
  const version = uncompressedFws[3]!;
  const payload = uncompressedFws.subarray(8);

  if (compression === "none") {
    const out = uncompressedFws.slice();
    out[0] = 0x46;
    out[1] = 0x57;
    out[2] = 0x53;
    writeUi32(out, 4, out.length);
    return out;
  }

  const packed = zlibSync(payload, { level: 9 });
  const out = new Uint8Array(8 + packed.length);
  out[0] = 0x43;
  out[1] = 0x57;
  out[2] = 0x53;
  out[3] = version;
  writeUi32(out, 4, uncompressedFws.length);
  out.set(packed, 8);
  return out;
}

function writeUi32(out: Uint8Array, offset: number, v: number) {
  out[offset] = v & 0xff;
  out[offset + 1] = (v >> 8) & 0xff;
  out[offset + 2] = (v >> 16) & 0xff;
  out[offset + 3] = (v >> 24) & 0xff;
}
