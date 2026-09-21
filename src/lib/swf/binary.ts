

export class ByteReader {
  u8: Uint8Array;
  view: DataView;
  pos = 0;
  bitBuf = 0;
  bitLeft = 0;

  constructor(u8: Uint8Array) {
    this.u8 = u8;
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }

  get remaining(): number {
    return this.u8.length - this.pos;
  }

  get eof(): boolean {
    return this.pos >= this.u8.length && this.bitLeft === 0;
  }

  align(): void {
    this.bitLeft = 0;
  }

  seek(pos: number): void {
    this.pos = pos;
    this.bitLeft = 0;
  }

  ui8(): number {
    this.align();
    if (this.pos >= this.u8.length) throw new Error("Unexpected EOF (UI8)");
    return this.u8[this.pos++]!;
  }

  si8(): number {
    const v = this.ui8();
    return v > 127 ? v - 256 : v;
  }

  ui16(): number {
    this.align();
    if (this.pos + 2 > this.u8.length) throw new Error("Unexpected EOF (UI16)");
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  si16(): number {
    this.align();
    if (this.pos + 2 > this.u8.length) throw new Error("Unexpected EOF (SI16)");
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  ui32(): number {
    this.align();
    if (this.pos + 4 > this.u8.length) throw new Error("Unexpected EOF (UI32)");
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  si32(): number {
    this.align();
    if (this.pos + 4 > this.u8.length) throw new Error("Unexpected EOF (SI32)");
    const v = this.view.getInt32(this.pos, true);
    this.pos += 4;
    return v;
  }

  float16(): number {
    
    return this.ui16();
  }

  f32(): number {
    this.align();
    if (this.pos + 4 > this.u8.length) throw new Error("Unexpected EOF (F32)");
    const v = this.view.getFloat32(this.pos, true);
    this.pos += 4;
    return v;
  }

  f64(): number {
    this.align();
    if (this.pos + 8 > this.u8.length) throw new Error("Unexpected EOF (F64)");
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  bytes(n: number): Uint8Array {
    this.align();
    if (n < 0 || this.pos + n > this.u8.length) {
      throw new Error(`Unexpected EOF (bytes ${n} at ${this.pos})`);
    }
    const slice = this.u8.subarray(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  rest(): Uint8Array {
    this.align();
    const slice = this.u8.subarray(this.pos);
    this.pos = this.u8.length;
    return slice;
  }

  
  swfString(): string {
    this.align();
    const start = this.pos;
    while (this.pos < this.u8.length && this.u8[this.pos] !== 0) this.pos++;
    const str = new TextDecoder("utf-8", { fatal: false }).decode(this.u8.subarray(start, this.pos));
    if (this.pos < this.u8.length) this.pos++; 
    return str;
  }

  ub(n: number): number {
    if (n <= 0) return 0;
    let val = 0;
    let left = n;
    while (left > 0) {
      if (this.bitLeft === 0) {
        if (this.pos >= this.u8.length) throw new Error("Unexpected EOF (bits)");
        this.bitBuf = this.u8[this.pos++]!;
        this.bitLeft = 8;
      }
      const take = Math.min(left, this.bitLeft);
      this.bitLeft -= take;
      left -= take;
      val = (val << take) | ((this.bitBuf >> this.bitLeft) & ((1 << take) - 1));
    }
    return val >>> 0;
  }

  sb(n: number): number {
    if (n <= 0) return 0;
    const u = this.ub(n);
    const sign = 1 << (n - 1);
    return u & sign ? u - (1 << n) : u;
  }

  fb(n: number): number {
    return this.sb(n) / 65536;
  }

  rect(): Rect {
    this.align();
    const nbits = this.ub(5);
    const xMin = this.sb(nbits);
    const xMax = this.sb(nbits);
    const yMin = this.sb(nbits);
    const yMax = this.sb(nbits);
    this.align();
    return { xMin, xMax, yMin, yMax };
  }

  matrix(): Matrix {
    this.align();
    let scaleX = 1;
    let scaleY = 1;
    if (this.ub(1)) {
      const n = this.ub(5);
      scaleX = this.fb(n);
      scaleY = this.fb(n);
    }
    let rotateSkew0 = 0;
    let rotateSkew1 = 0;
    if (this.ub(1)) {
      const n = this.ub(5);
      rotateSkew0 = this.fb(n);
      rotateSkew1 = this.fb(n);
    }
    const nTranslate = this.ub(5);
    const translateX = this.sb(nTranslate);
    const translateY = this.sb(nTranslate);
    this.align();
    return { scaleX, scaleY, rotateSkew0, rotateSkew1, translateX, translateY };
  }

  rgb(): number {
    const r = this.ui8();
    const g = this.ui8();
    const b = this.ui8();
    return (r << 16) | (g << 8) | b;
  }

  rgba(): number {
    const r = this.ui8();
    const g = this.ui8();
    const b = this.ui8();
    const a = this.ui8();
    return ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
  }

  argb(): number {
    const a = this.ui8();
    const r = this.ui8();
    const g = this.ui8();
    const b = this.ui8();
    return ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
  }
}

export interface Rect {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface Matrix {
  scaleX: number;
  scaleY: number;
  rotateSkew0: number;
  rotateSkew1: number;
  translateX: number;
  translateY: number;
}

export const IDENTITY_MATRIX: Matrix = {
  scaleX: 1,
  scaleY: 1,
  rotateSkew0: 0,
  rotateSkew1: 0,
  translateX: 0,
  translateY: 0,
};

export class ByteWriter {
  private chunks: number[] = [];
  private bitBuf = 0;
  private bitCount = 0;

  get length(): number {
    return this.chunks.length;
  }

  align(): void {
    if (this.bitCount > 0) {
      this.chunks.push(this.bitBuf);
      this.bitBuf = 0;
      this.bitCount = 0;
    }
  }

  ui8(v: number): void {
    this.align();
    this.chunks.push(v & 0xff);
  }

  ui16(v: number): void {
    this.align();
    this.chunks.push(v & 0xff, (v >> 8) & 0xff);
  }

  si16(v: number): void {
    this.ui16(v);
  }

  ui32(v: number): void {
    this.align();
    this.chunks.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff);
  }

  bytes(data: Uint8Array | number[]): void {
    this.align();
    if (data instanceof Uint8Array) {
      for (let i = 0; i < data.length; i++) this.chunks.push(data[i]!);
    } else {
      for (const b of data) this.chunks.push(b & 0xff);
    }
  }

  swfString(s: string): void {
    this.align();
    const enc = new TextEncoder().encode(s);
    this.bytes(enc);
    this.ui8(0);
  }

  ub(n: number, value: number): void {
    let left = n;
    let v = value >>> 0;
    
    if (n < 32) v &= (1 << n) - 1;
    while (left > 0) {
      const space = 8 - this.bitCount;
      const take = Math.min(space, left);
      const shift = left - take;
      const bits = (v >> shift) & ((1 << take) - 1);
      this.bitBuf |= bits << (space - take);
      this.bitCount += take;
      left -= take;
      if (this.bitCount === 8) {
        this.chunks.push(this.bitBuf & 0xff);
        this.bitBuf = 0;
        this.bitCount = 0;
      }
    }
  }

  sb(n: number, value: number): void {
    if (n <= 0) return;
    let v = value | 0;
    if (v < 0) v = (1 << n) + v;
    this.ub(n, v);
  }

  fb(n: number, value: number): void {
    this.sb(n, Math.round(value * 65536));
  }

  rect(r: Rect): void {
    this.align();
    const vals = [r.xMin, r.xMax, r.yMin, r.yMax];
    const nbits = neededSBits(vals);
    this.ub(5, nbits);
    for (const v of vals) this.sb(nbits, v);
    this.align();
  }

  rgb(color: number): void {
    this.ui8((color >> 16) & 0xff);
    this.ui8((color >> 8) & 0xff);
    this.ui8(color & 0xff);
  }

  toBytes(): Uint8Array {
    this.align();
    return Uint8Array.from(this.chunks);
  }
}

export function neededSBits(values: number[]): number {
  let bits = 0;
  for (const v of values) {
    if (v === 0) {
      bits = Math.max(bits, 1);
      continue;
    }
    let n = v | 0;
    let b = 1;
    if (n < 0) n = ~n;
    while (n) {
      n >>= 1;
      b++;
    }
    bits = Math.max(bits, b);
  }
  return bits;
}

export function rectPixels(r: Rect): { width: number; height: number } {
  return {
    width: Math.max(0, (r.xMax - r.xMin) / 20),
    height: Math.max(0, (r.yMax - r.yMin) / 20),
  };
}
