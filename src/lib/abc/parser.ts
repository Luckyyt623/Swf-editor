import { AbcReader } from "./io";
import type {
  AbcClass,
  AbcConstantPool,
  AbcException,
  AbcFile,
  AbcInstance,
  AbcMetadata,
  AbcMethod,
  AbcMethodBody,
  AbcMultiname,
  AbcNamespace,
  AbcScript,
  AbcTrait,
} from "./types";
import { TRAIT_KIND } from "./types";

export function parseAbc(bytes: Uint8Array): AbcFile {
  const r = new AbcReader(bytes);
  const minor = r.ui16();
  const major = r.ui16();
  const pool = parsePool(r);
  const methods = parseMethods(r, pool);
  const metadata = parseMetadata(r, pool);
  const classCount = r.u30();
  const instances: AbcInstance[] = [];
  for (let i = 0; i < classCount; i++) {
    instances.push(parseInstance(r, pool, i));
  }
  const classes: AbcClass[] = [];
  for (let i = 0; i < classCount; i++) {
    classes.push({
      index: i,
      cinit: r.u30(),
      traits: parseTraits(r, pool),
    });
  }
  const scriptCount = r.u30();
  const scripts: AbcScript[] = [];
  for (let i = 0; i < scriptCount; i++) {
    scripts.push({ init: r.u30(), traits: parseTraits(r, pool) });
  }
  const bodyCount = r.u30();
  const bodies: AbcMethodBody[] = [];
  for (let i = 0; i < bodyCount; i++) {
    bodies.push(parseBody(r, pool));
  }
  return {
    minor,
    major,
    pool,
    methods,
    metadata,
    instances,
    classes,
    scripts,
    bodies,
    byteLength: r.pos,
  };
}

function parsePool(r: AbcReader): AbcConstantPool {
  const intCount = r.u30();
  const ints = [0];
  for (let i = 1; i < intCount; i++) ints.push(r.s32());

  const uintCount = r.u30();
  const uints = [0];
  for (let i = 1; i < uintCount; i++) uints.push(r.u30());

  const doubleCount = r.u30();
  const doubles = [0];
  for (let i = 1; i < doubleCount; i++) doubles.push(r.d64());

  const stringCount = r.u30();
  const strings = [""];
  for (let i = 1; i < stringCount; i++) strings.push(r.string());

  const nsCount = r.u30();
  const namespaces: AbcNamespace[] = [{ kind: 0, name: "*" }];
  for (let i = 1; i < nsCount; i++) {
    const kind = r.ui8();
    const nameIdx = r.u30();
    namespaces.push({ kind, name: strings[nameIdx] ?? "" });
  }

  const nsSetCount = r.u30();
  const nsSets: string[][] = [[]];
  for (let i = 1; i < nsSetCount; i++) {
    const count = r.u30();
    const set: string[] = [];
    for (let j = 0; j < count; j++) {
      const idx = r.u30();
      set.push(namespaces[idx]?.name ?? "");
    }
    nsSets.push(set);
  }

  const mnCount = r.u30();
  const multinames: AbcMultiname[] = [{ kind: 0, name: "*" }];
  for (let i = 1; i < mnCount; i++) {
    multinames.push(parseMultiname(r, strings, namespaces, nsSets));
  }

  return { ints, uints, doubles, strings, namespaces, nsSets, multinames };
}

function parseMultiname(
  r: AbcReader,
  strings: string[],
  namespaces: AbcNamespace[],
  nsSets: string[][],
): AbcMultiname {
  const kind = r.ui8();
  switch (kind) {
    case 0x07:
    case 0x0d: {
      const ns = r.u30();
      const name = r.u30();
      return { kind, ns: namespaces[ns]?.name ?? "", name: strings[name] ?? "" };
    }
    case 0x0f:
    case 0x10: {
      const name = r.u30();
      return { kind, name: strings[name] ?? "" };
    }
    case 0x11:
    case 0x12:
      return { kind };
    case 0x09:
    case 0x0e: {
      const name = r.u30();
      const set = r.u30();
      return { kind, name: strings[name] ?? "", nsSet: nsSets[set] };
    }
    case 0x1b:
    case 0x1c: {
      const set = r.u30();
      return { kind, nsSet: nsSets[set] };
    }
    case 0x1d: {
      const qnameIndex = r.u30();
      const count = r.u30();
      const params: number[] = [];
      for (let i = 0; i < count; i++) params.push(r.u30());
      return { kind, qnameIndex, params };
    }
    default:
      return { kind, name: `?kind=${kind}` };
  }
}

export function multinameToString(pool: AbcConstantPool, index: number): string {
  if (index === 0) return "*";
  const mn = pool.multinames[index];
  if (!mn) return `mn#${index}`;
  if (mn.kind === 0x1d && mn.qnameIndex != null) {
    const base = multinameToString(pool, mn.qnameIndex);
    const params = (mn.params ?? []).map((p) => multinameToString(pool, p));
    return `${base}.<${params.join(",")}>`;
  }
  const ns = mn.ns ?? "";
  const name = mn.name ?? "*";
  if (ns) return `${ns}::${name}`;
  if (mn.nsSet && mn.nsSet.length) {
    return `${mn.nsSet.join("|")}::${name}`;
  }
  return name;
}

function parseMethods(r: AbcReader, pool: AbcConstantPool): AbcMethod[] {
  const count = r.u30();
  const methods: AbcMethod[] = [];
  for (let i = 0; i < count; i++) {
    const paramCount = r.u30();
    const returnType = multinameToString(pool, r.u30());
    const paramTypes: string[] = [];
    for (let p = 0; p < paramCount; p++) paramTypes.push(multinameToString(pool, r.u30()));
    const nameIdx = r.u30();
    const flags = r.ui8();
    const options: AbcMethod["options"] = [];
    if (flags & 0x08) {
      const optCount = r.u30();
      for (let o = 0; o < optCount; o++) {
        options.push({ value: r.u30(), kind: r.ui8() });
      }
    }
    const paramNames: string[] = [];
    if (flags & 0x80) {
      for (let p = 0; p < paramCount; p++) paramNames.push(pool.strings[r.u30()] ?? `arg${p}`);
    } else {
      for (let p = 0; p < paramCount; p++) paramNames.push(`arg${p}`);
    }
    methods.push({
      index: i,
      paramCount,
      returnType,
      paramTypes,
      paramNames,
      name: pool.strings[nameIdx] ?? "",
      flags,
      options,
      needRest: (flags & 0x04) !== 0,
      needArguments: (flags & 0x01) !== 0,
    });
  }
  return methods;
}

function parseMetadata(r: AbcReader, pool: AbcConstantPool): AbcMetadata[] {
  const count = r.u30();
  const out: AbcMetadata[] = [];
  for (let i = 0; i < count; i++) {
    const name = pool.strings[r.u30()] ?? "";
    const itemCount = r.u30();
    const keys: string[] = [];
    const values: string[] = [];
    for (let k = 0; k < itemCount; k++) keys.push(pool.strings[r.u30()] ?? "");
    for (let k = 0; k < itemCount; k++) values.push(pool.strings[r.u30()] ?? "");
    out.push({ name, keys, values });
  }
  return out;
}

function parseTraits(r: AbcReader, pool: AbcConstantPool): AbcTrait[] {
  const count = r.u30();
  const traits: AbcTrait[] = [];
  for (let i = 0; i < count; i++) {
    const name = multinameToString(pool, r.u30());
    const kindByte = r.ui8();
    const kind = kindByte & 0x0f;
    const attr = kindByte >> 4;
    const trait: AbcTrait = {
      name,
      kind,
      kindName: TRAIT_KIND[kind] ?? `kind${kind}`,
      metadata: [],
    };
    switch (kind) {
      case 0:
      case 6: {
        trait.slotId = r.u30();
        trait.typeName = multinameToString(pool, r.u30());
        const vindex = r.u30();
        if (vindex !== 0) {
          const vkind = r.ui8();
          trait.value = constantValue(pool, vindex, vkind);
          trait.valueIndex = vindex;
          trait.valueKind = vkind;
        }
        break;
      }
      case 1:
      case 2:
      case 3:
      case 5: {
        trait.dispId = r.u30();
        trait.methodIndex = r.u30();
        break;
      }
      case 4: {
        trait.slotId = r.u30();
        trait.methodIndex = r.u30(); // classi
        break;
      }
      default:
        break;
    }
    if (attr & 0x4) {
      const mdCount = r.u30();
      for (let m = 0; m < mdCount; m++) trait.metadata.push(String(r.u30()));
    }
    traits.push(trait);
  }
  return traits;
}

function constantValue(pool: AbcConstantPool, index: number, kind: number): string {
  switch (kind) {
    case 0x01:
      return JSON.stringify(pool.strings[index] ?? "");
    case 0x03:
      return String(pool.ints[index] ?? 0);
    case 0x04:
      return String(pool.uints[index] ?? 0);
    case 0x06:
      return String(pool.doubles[index] ?? 0);
    case 0x08:
    case 0x16:
    case 0x17:
    case 0x18:
    case 0x19:
    case 0x1a:
    case 0x05:
      return pool.namespaces[index]?.name ?? "";
    case 0x0a:
      return "false";
    case 0x0b:
      return "true";
    case 0x0c:
      return "null";
    case 0x00:
      return "undefined";
    default:
      return `const#${index}`;
  }
}

function parseInstance(r: AbcReader, pool: AbcConstantPool, index: number): AbcInstance {
  const name = multinameToString(pool, r.u30());
  const superName = multinameToString(pool, r.u30());
  const flags = r.ui8();
  let protectedNs: string | undefined;
  if (flags & 0x08) protectedNs = pool.namespaces[r.u30()]?.name;
  const ifCount = r.u30();
  const interfaces: string[] = [];
  for (let i = 0; i < ifCount; i++) interfaces.push(multinameToString(pool, r.u30()));
  const iinit = r.u30();
  const traits = parseTraits(r, pool);
  const { package: pkg, className } = splitQName(name);
  return {
    index,
    name,
    package: pkg,
    className,
    superName,
    flags,
    protectedNs,
    interfaces,
    iinit,
    traits,
  };
}

export function splitQName(qname: string): { package: string; className: string } {
  const cleaned = qname.replace(/^\*::/, "");
  const idx = cleaned.lastIndexOf("::");
  if (idx >= 0) return { package: cleaned.slice(0, idx), className: cleaned.slice(idx + 2) };
  const dot = cleaned.lastIndexOf(".");
  if (dot >= 0) return { package: cleaned.slice(0, dot), className: cleaned.slice(dot + 1) };
  return { package: "", className: cleaned };
}

function parseBody(r: AbcReader, pool: AbcConstantPool): AbcMethodBody {
  const method = r.u30();
  const maxStack = r.u30();
  const localCount = r.u30();
  const initScopeDepth = r.u30();
  const maxScopeDepth = r.u30();
  const codeLen = r.u30();
  const code = r.bytes(codeLen).slice();
  const exCount = r.u30();
  const exceptions: AbcException[] = [];
  for (let i = 0; i < exCount; i++) {
    exceptions.push({
      from: r.u30(),
      to: r.u30(),
      target: r.u30(),
      excType: multinameToString(pool, r.u30()),
      varName: multinameToString(pool, r.u30()),
    });
  }
  const traits = parseTraits(r, pool);
  return {
    method,
    maxStack,
    localCount,
    initScopeDepth,
    maxScopeDepth,
    code,
    exceptions,
    traits,
  };
}

export function findBody(abc: AbcFile, methodIndex: number): AbcMethodBody | undefined {
  return abc.bodies.find((b) => b.method === methodIndex);
}

export function simpleTypeName(t: string): string {
  if (!t || t === "*") return "*";
  const cleaned = t.replace(/^.*::/, "");
  return cleaned || t;
}
