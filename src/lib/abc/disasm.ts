import { OPCODES, opcodeName, type OperandKind } from "./opcodes";
import { multinameToString } from "./parser";
import type { AbcFile } from "./types";

export interface DisasmLine {
  offset: number;
  op: number;
  name: string;
  operands: number[];
  text: string;
  raw: Uint8Array;
}

export function disassemble(abc: AbcFile, code: Uint8Array): DisasmLine[] {
  const lines: DisasmLine[] = [];
  let i = 0;
  while (i < code.length) {
    const offset = i;
    const op = code[i++]!;
    const info = OPCODES[op];
    const operandKind: OperandKind = info?.operand ?? "none";
    const start = offset;
    const operands: number[] = [];
    let extra = "";
    try {
      switch (operandKind) {
        case "none":
          break;
        case "u8":
          operands.push(code[i++]!);
          extra = ` ${operands[0]}`;
          break;
        case "u30": {
          const { value, next } = readU30(code, i);
          i = next;
          operands.push(value);
          extra = formatU30(abc, op, value);
          break;
        }
        case "s24": {
          const { value, next } = readS24(code, i);
          i = next;
          operands.push(value);
          extra = ` +${value} -> ${i + value}`;
          break;
        }
        case "u30_u30": {
          const a = readU30(code, i);
          const b = readU30(code, a.next);
          i = b.next;
          operands.push(a.value, b.value);
          extra = `${formatU30(abc, op, a.value)}, argc=${b.value}`;
          break;
        }
        case "u30_u8": {
          const a = readU30(code, i);
          const b = code[a.next]!;
          i = a.next + 1;
          operands.push(a.value, b);
          extra = ` ${a.value} ${b}`;
          break;
        }
        case "s24_s24_s24_u30": {
          
          
          
          const def = readS24(code, i);
          const cc = readU30(code, def.next);
          i = cc.next;
          operands.push(def.value, cc.value);
          extra = ` default=${def.value} cases=${cc.value}`;
          for (let c = 0; c <= cc.value; c++) {
            const cs = readS24(code, i);
            i = cs.next;
            operands.push(cs.value);
          }
          break;
        }
        case "debug": {
          const dbgType = code[i++]!;
          const idx = readU30(code, i);
          const extraByte = code[idx.next]!;
          const extraU30 = readU30(code, idx.next + 1);
          i = extraU30.next;
          operands.push(dbgType, idx.value, extraByte, extraU30.value);
          extra = ` type=${dbgType} idx=${idx.value}`;
          break;
        }
      }
    } catch {
      extra = " <truncated>";
      i = code.length;
    }
    const raw = code.subarray(start, i);
    const name = info?.name ?? opcodeName(op);
    lines.push({
      offset,
      op,
      name,
      operands,
      text: `${fmtOff(offset)}  ${name}${extra}`,
      raw: raw.slice(),
    });
  }
  return lines;
}

function fmtOff(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

function readU30(code: Uint8Array, i: number): { value: number; next: number } {
  let result = 0;
  let shift = 0;
  let pos = i;
  for (let n = 0; n < 5; n++) {
    if (pos >= code.length) throw new Error("u30 truncated");
    const b = code[pos++]!;
    result |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, next: pos };
}

function readS24(code: Uint8Array, i: number): { value: number; next: number } {
  if (i + 3 > code.length) throw new Error("s24 truncated");
  let v = code[i]! | (code[i + 1]! << 8) | (code[i + 2]! << 16);
  if (v & 0x800000) v -= 0x1000000;
  return { value: v, next: i + 3 };
}

function formatU30(abc: AbcFile, op: number, value: number): string {
  const mnOps = new Set([
    0x04, 0x05, 0x46, 0x4c, 0x4f, 0x4a, 0x45, 0x4e, 0x5d, 0x5e, 0x5f, 0x60, 0x61, 0x66, 0x68, 0x6a, 0x80,
    0x86, 0xb2, 0x59,
  ]);
  if (mnOps.has(op)) {
    return ` ${value} ; ${multinameToString(abc.pool, value)}`;
  }
  if (op === 0x2c) {
    return ` ${value} ; ${JSON.stringify(abc.pool.strings[value] ?? "")}`;
  }
  if (op === 0x2d) return ` ${value} ; ${abc.pool.ints[value] ?? 0}`;
  if (op === 0x2e) return ` ${value} ; ${abc.pool.uints[value] ?? 0}`;
  if (op === 0x2f) return ` ${value} ; ${abc.pool.doubles[value] ?? 0}`;
  if (op === 0xf1) return ` ${value} ; ${JSON.stringify(abc.pool.strings[value] ?? "")}`;
  if (op === 0x58) return ` class#${value}`;
  if (op === 0x40) return ` method#${value}`;
  return ` ${value}`;
}

export function assembleLines(lines: DisasmLine[]): Uint8Array {
  let total = 0;
  for (const l of lines) total += l.raw.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const l of lines) {
    out.set(l.raw, o);
    o += l.raw.length;
  }
  return out;
}

export function patchInstructionBytes(code: Uint8Array, offset: number, replacement: Uint8Array): Uint8Array {
  const out = code.slice();
  if (offset < 0 || offset + replacement.length > out.length) {
    throw new Error("Patch out of range");
  }
  out.set(replacement, offset);
  return out;
}
