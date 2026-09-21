import { AbcWriter } from "./io";
import { splitQName } from "./parser";
import type { AbcFile, AbcConstantPool, AbcTrait } from "./types";

export function writeAbc(abc: AbcFile): Uint8Array {
  const w = new AbcWriter();
  w.ui16(abc.minor);
  w.ui16(abc.major);
  writePool(w, abc.pool);
  writeMethods(w, abc);
  writeMetadata(w, abc);
  w.u30(abc.instances.length);
  for (const inst of abc.instances) writeInstance(w, abc, inst.index);
  for (const cls of abc.classes) {
    w.u30(cls.cinit);
    writeTraits(w, abc, cls.traits);
  }
  w.u30(abc.scripts.length);
  for (const s of abc.scripts) {
    w.u30(s.init);
    writeTraits(w, abc, s.traits);
  }
  w.u30(abc.bodies.length);
  for (const b of abc.bodies) {
    w.u30(b.method);
    w.u30(b.maxStack);
    w.u30(b.localCount);
    w.u30(b.initScopeDepth);
    w.u30(b.maxScopeDepth);
    w.u30(b.code.length);
    w.bytes(b.code);
    w.u30(b.exceptions.length);
    for (const e of b.exceptions) {
      w.u30(e.from);
      w.u30(e.to);
      w.u30(e.target);
      w.u30(lookupMultiname(abc.pool, e.excType));
      w.u30(lookupMultiname(abc.pool, e.varName));
    }
    writeTraits(w, abc, b.traits);
  }
  return w.toBytes();
}

function writePool(w: AbcWriter, pool: AbcConstantPool) {
  const ints = pool.ints;
  w.u30(ints.length <= 1 ? 0 : ints.length);
  for (let i = 1; i < ints.length; i++) w.s32(ints[i]!);

  const uints = pool.uints;
  w.u30(uints.length <= 1 ? 0 : uints.length);
  for (let i = 1; i < uints.length; i++) w.u30(uints[i]!);

  const doubles = pool.doubles;
  w.u30(doubles.length <= 1 ? 0 : doubles.length);
  for (let i = 1; i < doubles.length; i++) w.d64(doubles[i]!);

  const strings = pool.strings;
  w.u30(strings.length <= 1 ? 0 : strings.length);
  for (let i = 1; i < strings.length; i++) w.string(strings[i]!);

  const nss = pool.namespaces;
  w.u30(nss.length <= 1 ? 0 : nss.length);
  for (let i = 1; i < nss.length; i++) {
    const ns = nss[i]!;
    w.ui8(ns.kind);
    w.u30(internString(strings, ns.name));
  }

  const sets = pool.nsSets;
  w.u30(sets.length <= 1 ? 0 : sets.length);
  for (let i = 1; i < sets.length; i++) {
    const set = sets[i]!;
    w.u30(set.length);
    for (const name of set) w.u30(lookupNs(pool, name));
  }

  const mns = pool.multinames;
  w.u30(mns.length <= 1 ? 0 : mns.length);
  for (let i = 1; i < mns.length; i++) {
    const mn = mns[i]!;
    w.ui8(mn.kind);
    switch (mn.kind) {
      case 0x07:
      case 0x0d:
        w.u30(lookupNs(pool, mn.ns ?? ""));
        w.u30(internString(strings, mn.name ?? ""));
        break;
      case 0x0f:
      case 0x10:
        w.u30(internString(strings, mn.name ?? ""));
        break;
      case 0x11:
      case 0x12:
        break;
      case 0x09:
      case 0x0e:
        w.u30(internString(strings, mn.name ?? ""));
        w.u30(lookupNsSet(pool, mn.nsSet ?? []));
        break;
      case 0x1b:
      case 0x1c:
        w.u30(lookupNsSet(pool, mn.nsSet ?? []));
        break;
      case 0x1d:
        w.u30(mn.qnameIndex ?? 0);
        w.u30(mn.params?.length ?? 0);
        for (const p of mn.params ?? []) w.u30(p);
        break;
      default:
        break;
    }
  }
}

function internString(strings: string[], s: string): number {
  const idx = strings.indexOf(s);
  return idx >= 0 ? idx : 0;
}

function lookupNs(pool: AbcConstantPool, name: string): number {
  const idx = pool.namespaces.findIndex((n, i) => i > 0 && n.name === name);
  return idx >= 0 ? idx : 0;
}

function lookupNsSet(pool: AbcConstantPool, set: string[]): number {
  const key = set.join("\0");
  const idx = pool.nsSets.findIndex((s, i) => i > 0 && s.join("\0") === key);
  return idx >= 0 ? idx : 0;
}

function lookupMultiname(pool: AbcConstantPool, printed: string): number {
  if (!printed || printed === "*") return 0;
  for (let i = 1; i < pool.multinames.length; i++) {
    const mn = pool.multinames[i]!;
    const ns = mn.ns ?? "";
    const name = mn.name ?? "";
    const form = ns ? `${ns}::${name}` : name;
    if (form === printed || name === printed) return i;
  }
  return 0;
}

function writeMethods(w: AbcWriter, abc: AbcFile) {
  w.u30(abc.methods.length);
  for (const m of abc.methods) {
    w.u30(m.paramCount);
    w.u30(lookupMultiname(abc.pool, m.returnType));
    for (const t of m.paramTypes) w.u30(lookupMultiname(abc.pool, t));
    w.u30(internString(abc.pool.strings, m.name));
    w.ui8(m.flags);
    if (m.flags & 0x08) {
      w.u30(m.options.length);
      for (const o of m.options) {
        w.u30(o.value);
        w.ui8(o.kind);
      }
    }
    if (m.flags & 0x80) {
      for (const n of m.paramNames) w.u30(internString(abc.pool.strings, n));
    }
  }
}

function writeMetadata(w: AbcWriter, abc: AbcFile) {
  w.u30(abc.metadata.length);
  for (const md of abc.metadata) {
    w.u30(internString(abc.pool.strings, md.name));
    w.u30(md.keys.length);
    for (const k of md.keys) w.u30(internString(abc.pool.strings, k));
    for (const v of md.values) w.u30(internString(abc.pool.strings, v));
  }
}

function writeInstance(w: AbcWriter, abc: AbcFile, index: number) {
  const inst = abc.instances[index]!;
  w.u30(lookupMultiname(abc.pool, inst.name));
  w.u30(lookupMultiname(abc.pool, inst.superName));
  w.ui8(inst.flags);
  if (inst.flags & 0x08) w.u30(lookupNs(abc.pool, inst.protectedNs ?? ""));
  w.u30(inst.interfaces.length);
  for (const i of inst.interfaces) w.u30(lookupMultiname(abc.pool, i));
  w.u30(inst.iinit);
  writeTraits(w, abc, inst.traits);
}

function writeTraits(w: AbcWriter, abc: AbcFile, traits: AbcTrait[]) {
  w.u30(traits.length);
  for (const t of traits) {
    w.u30(lookupMultiname(abc.pool, t.name));
    const attr = t.metadata.length ? 0x4 : 0;
    w.ui8((attr << 4) | (t.kind & 0x0f));
    switch (t.kind) {
      case 0:
      case 6:
        w.u30(t.slotId ?? 0);
        w.u30(lookupMultiname(abc.pool, t.typeName ?? "*"));

        w.u30(t.valueIndex ?? 0);
        if (t.valueIndex) w.ui8(t.valueKind ?? 0);
        break;
      case 1:
      case 2:
      case 3:
      case 5:
        w.u30(t.dispId ?? 0);
        w.u30(t.methodIndex ?? 0);
        break;
      case 4:
        w.u30(t.slotId ?? 0);
        w.u30(t.methodIndex ?? 0);
        break;
      default:
        break;
    }
    if (attr & 0x4) {
      w.u30(t.metadata.length);
      for (const m of t.metadata) w.u30(Number(m) || 0);
    }
  }
}

export function patchAbcString(abc: AbcFile, index: number, value: string): Uint8Array {
  if (index <= 0 || index >= abc.pool.strings.length) {
    throw new Error("Invalid constant-pool string index");
  }
  const oldValue = abc.pool.strings[index]!;
  abc.pool.strings[index] = value;
  propagateStringRename(abc, oldValue, value);
  return writeAbc(abc);
}

function renamePart(s: string | undefined, oldValue: string, newValue: string): string | undefined {
  if (s == null) return s;
  if (s === oldValue) return newValue;
  const idx = s.indexOf("::");
  if (idx < 0) return s;
  const ns = s.slice(0, idx);
  const name = s.slice(idx + 2);
  const newNs = ns === oldValue ? newValue : ns;
  const newName = name === oldValue ? newValue : name;
  return newNs === ns && newName === name ? s : `${newNs}::${newName}`;
}

function propagateStringRename(abc: AbcFile, oldValue: string, newValue: string) {
  if (oldValue === newValue) return;
  const { pool } = abc;
  for (const ns of pool.namespaces) {
    if (ns.name === oldValue) ns.name = newValue;
  }
  for (const set of pool.nsSets) {
    for (let i = 0; i < set.length; i++) if (set[i] === oldValue) set[i] = newValue;
  }
  for (const mn of pool.multinames) {
    if (mn.ns === oldValue) mn.ns = newValue;
    if (mn.name === oldValue) mn.name = newValue;
    if (mn.nsSet) {
      for (let i = 0; i < mn.nsSet.length; i++) if (mn.nsSet[i] === oldValue) mn.nsSet[i] = newValue;
    }
  }
  for (const m of abc.methods) {
    if (m.name === oldValue) m.name = newValue;
    m.returnType = renamePart(m.returnType, oldValue, newValue) ?? m.returnType;
    m.paramTypes = m.paramTypes.map((t) => renamePart(t, oldValue, newValue) ?? t);
    m.paramNames = m.paramNames.map((n) => (n === oldValue ? newValue : n));
  }
  for (const md of abc.metadata) {
    if (md.name === oldValue) md.name = newValue;
    md.keys = md.keys.map((k) => (k === oldValue ? newValue : k));
    md.values = md.values.map((v) => (v === oldValue ? newValue : v));
  }
  const renameTraits = (traits: AbcTrait[]) => {
    for (const t of traits) {
      t.name = renamePart(t.name, oldValue, newValue) ?? t.name;
      if (t.typeName != null) t.typeName = renamePart(t.typeName, oldValue, newValue);
    }
  };
  for (const inst of abc.instances) {
    inst.name = renamePart(inst.name, oldValue, newValue) ?? inst.name;
    inst.superName = renamePart(inst.superName, oldValue, newValue) ?? inst.superName;
    if (inst.protectedNs === oldValue) inst.protectedNs = newValue;
    inst.interfaces = inst.interfaces.map((i) => renamePart(i, oldValue, newValue) ?? i);
    const { package: pkg, className } = splitQName(inst.name);
    inst.package = pkg;
    inst.className = className;
    renameTraits(inst.traits);
  }
  for (const cls of abc.classes) renameTraits(cls.traits);
  for (const s of abc.scripts) renameTraits(s.traits);
  for (const b of abc.bodies) {
    renameTraits(b.traits);
    for (const e of b.exceptions) {
      e.excType = renamePart(e.excType, oldValue, newValue) ?? e.excType;
      e.varName = renamePart(e.varName, oldValue, newValue) ?? e.varName;
    }
  }
}

export function patchMethodBody(abc: AbcFile, methodIndex: number, code: Uint8Array): Uint8Array {
  const body = abc.bodies.find((b) => b.method === methodIndex);
  if (!body) throw new Error("Method body not found");
  body.code = code;
  return writeAbc(abc);
}
