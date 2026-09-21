import { AbcWriter } from "./io";

interface MethodSpec {
  name: string;
  params: { name: string; type: string }[];
  returnType: string;
  code: Uint8Array;
  maxStack: number;
  localCount: number;
  maxScope: number;
}

interface TraitSpec {
  name: string;
  kind: "method" | "slot";
  method?: number;
  type?: string;
}

interface ClassSpec {
  pkg: string;
  name: string;
  superName: string;
  instanceTraits: TraitSpec[];
  staticTraits: TraitSpec[];
  iinit: number;
  cinit: number;
}

export class AbcBuilder {
  strings: string[] = [""];
  namespaces: { kind: number; name: number }[] = [{ kind: 0, name: 0 }];
  multinames: { kind: number; ns: number; name: number }[] = [{ kind: 0, ns: 0, name: 0 }];
  methods: MethodSpec[] = [];
  classes: ClassSpec[] = [];
  ints: number[] = [0];

  internString(s: string): number {
    const i = this.strings.indexOf(s);
    if (i >= 0) return i;
    this.strings.push(s);
    return this.strings.length - 1;
  }

  internNs(pkg: string, kind = 0x16): number {
    const name = this.internString(pkg);
    const found = this.namespaces.findIndex((n, i) => i > 0 && n.kind === kind && n.name === name);
    if (found >= 0) return found;
    this.namespaces.push({ kind, name });
    return this.namespaces.length - 1;
  }

  internQName(pkg: string, name: string): number {
    const ns = this.internNs(pkg);
    const n = this.internString(name);
    const found = this.multinames.findIndex((m, i) => i > 0 && m.kind === 0x07 && m.ns === ns && m.name === n);
    if (found >= 0) return found;
    this.multinames.push({ kind: 0x07, ns, name: n });
    return this.multinames.length - 1;
  }

  addMethod(spec: MethodSpec): number {
    this.internString(spec.name);
    this.methods.push(spec);
    return this.methods.length - 1;
  }

  addClass(spec: ClassSpec) {
    this.internQName(spec.pkg, spec.name);
    this.internQName("", spec.superName.includes("::") ? spec.superName.split("::").pop()! : spec.superName);
    this.classes.push(spec);
  }

  toBytes(): Uint8Array {
    const w = new AbcWriter();
    w.ui16(16);
    w.ui16(46);

    w.u30(this.ints.length <= 1 ? 0 : this.ints.length);
    for (let i = 1; i < this.ints.length; i++) w.s32(this.ints[i]!);
    w.u30(0); // uints
    w.u30(0); // doubles
    w.u30(this.strings.length);
    for (let i = 1; i < this.strings.length; i++) w.string(this.strings[i]!);
    w.u30(this.namespaces.length);
    for (let i = 1; i < this.namespaces.length; i++) {
      w.ui8(this.namespaces[i]!.kind);
      w.u30(this.namespaces[i]!.name);
    }
    w.u30(0); // ns sets
    w.u30(this.multinames.length);
    for (let i = 1; i < this.multinames.length; i++) {
      const m = this.multinames[i]!;
      w.ui8(m.kind);
      w.u30(m.ns);
      w.u30(m.name);
    }
    w.u30(this.methods.length);
    for (const m of this.methods) {
      w.u30(m.params.length);
      w.u30(this.typeIndex(m.returnType));
      for (const p of m.params) w.u30(this.typeIndex(p.type));
      w.u30(this.internString(m.name));
      w.ui8(0x80); // HAS_PARAM_NAMES
      for (const p of m.params) w.u30(this.internString(p.name));
    }
    w.u30(0); // metadata
    w.u30(this.classes.length);
    for (const c of this.classes) {
      w.u30(this.internQName(c.pkg, c.name));
      w.u30(this.typeIndex(c.superName));
      w.ui8(0x08 | 0x01); // protected + sealed
      w.u30(this.internNs(c.pkg, 0x18));
      w.u30(0); // interfaces
      w.u30(c.iinit);
      this.writeTraits(w, c.instanceTraits);
    }
    for (const c of this.classes) {
      w.u30(c.cinit);
      this.writeTraits(w, c.staticTraits);
    }
    w.u30(this.classes.length); // one script per class
    for (const c of this.classes) {

      w.u30(c.cinit);

      w.u30(1);
      w.u30(this.internQName(c.pkg, c.name));
      w.ui8(4); // Trait_Class
      w.u30(0);
      w.u30(this.classes.indexOf(c));
    }
    w.u30(this.methods.length);
    for (let i = 0; i < this.methods.length; i++) {
      const m = this.methods[i]!;
      w.u30(i);
      w.u30(m.maxStack);
      w.u30(m.localCount);
      w.u30(1);
      w.u30(m.maxScope);
      w.u30(m.code.length);
      w.bytes(m.code);
      w.u30(0);
      w.u30(0);
    }
    return w.toBytes();
  }

  typeIndex(t: string): number {
    if (!t || t === "*" || t === "void") return 0;
    if (t.includes("::")) {
      const [pkg, name] = t.split("::");
      return this.internQName(pkg ?? "", name ?? t);
    }
    if (t.includes(".")) {
      const i = t.lastIndexOf(".");
      return this.internQName(t.slice(0, i), t.slice(i + 1));
    }
    return this.internQName("", t);
  }

  private writeTraits(w: AbcWriter, traits: TraitSpec[]) {
    w.u30(traits.length);
    for (const t of traits) {
      const pkgAndName = t.name.includes("::") ? t.name : `::${t.name}`;
      const [pkg, name] = pkgAndName.split("::");
      w.u30(this.internQName(pkg ?? "", name ?? t.name));
      if (t.kind === "method") {
        w.ui8(1);
        w.u30(0);
        w.u30(t.method ?? 0);
      } else {
        w.ui8(0);
        w.u30(0);
        w.u30(this.typeIndex(t.type ?? "*"));
        w.u30(0);
      }
    }
  }
}

export function emitOp(ops: number[]): Uint8Array {
  return Uint8Array.from(ops);
}

export function u30(n: number): number[] {
  const out: number[] = [];
  let v = n >>> 0;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}

export function simpleVoidBody(middle: number[]): Uint8Array {
  return Uint8Array.from([0xd0, 0x30, ...middle, 0x47]);
}

export function ctorBody(): Uint8Array {
  
  return Uint8Array.from([0xd0, 0x30, 0xd0, 0x49, 0x00, 0x47]);
}

export function cinitBody(): Uint8Array {
  return Uint8Array.from([0xd0, 0x30, 0x47]);
}

export function callPropVoid(mn: number, argc: number, before: number[] = []): Uint8Array {
  return simpleVoidBody([...before, 0x4f, ...u30(mn), ...u30(argc)]);
}
