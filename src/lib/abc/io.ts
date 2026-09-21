

export class AbcReader {
  u8: Uint8Array;
  view: DataView;
  pos = 0;

  constructor(u8: Uint8Array) {
    this.u8 = u8;
    this.view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  }

  get remaining() {
    return this.u8.length - this.pos;
  }

  ui8(): number {
    if (this.pos >= this.u8.length) throw new Error("ABC EOF (u8)");
    return this.u8[this.pos++]!;
  }

  ui16(): number {
    if (this.pos + 2 > this.u8.length) throw new Error("ABC EOF (u16)");
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  d64(): number {
    if (this.pos + 8 > this.u8.length) throw new Error("ABC EOF (d64)");
    const v = this.view.getFloat64(this.pos, true);
    this.pos += 8;
    return v;
  }

  bytes(n: number): Uint8Array {
    if (this.pos + n > this.u8.length) throw new Error("ABC EOF (bytes)");
    const s = this.u8.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }

  u30(): number {
    let result = 0;
    let shift = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.ui8();
      result |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    return result >>> 0;
  }

  s32(): number {
    const v = this.u30();
    return v | 0;
  }

  string(): string {
    const len = this.u30();
    const bytes = this.bytes(len);
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

export class AbcWriter {
  private chunks: number[] = [];

  get length() {
    return this.chunks.length;
  }

  ui8(v: number) {
    this.chunks.push(v & 0xff);
  }

  ui16(v: number) {
    this.chunks.push(v & 0xff, (v >> 8) & 0xff);
  }

  d64(v: number) {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setFloat64(0, v, true);
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < 8; i++) this.chunks.push(u8[i]!);
  }

  bytes(data: Uint8Array) {
    for (let i = 0; i < data.length; i++) this.chunks.push(data[i]!);
  }

  u30(v: number) {
    let n = v >>> 0;
    while (n >= 0x80) {
      this.chunks.push((n & 0x7f) | 0x80);
      n >>>= 7;
    }
    this.chunks.push(n);
  }

  s32(v: number) {
    this.u30(v | 0);
  }

  string(s: string) {
    const enc = new TextEncoder().encode(s);
    this.u30(enc.length);
    this.bytes(enc);
  }

  toBytes(): Uint8Array {
    return Uint8Array.from(this.chunks);
  }
}

export function u30Size(v: number): number {
  let n = v >>> 0;
  let c = 1;
  while (n >= 0x80) {
    n >>>= 7;
    c++;
  }
  return c;
}
