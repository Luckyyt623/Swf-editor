export interface AbcNamespace {
  kind: number;
  name: string;
}

export interface AbcMultiname {
  kind: number;
  ns?: string;
  name?: string;
  nsSet?: string[];
  qnameIndex?: number;
  params?: number[];
}

export interface AbcOptionDetail {
  value: number;
  kind: number;
}

export interface AbcMethod {
  index: number;
  paramCount: number;
  returnType: string;
  paramTypes: string[];
  paramNames: string[];
  name: string;
  flags: number;
  options: AbcOptionDetail[];
  needRest: boolean;
  needArguments: boolean;
}

export interface AbcTrait {
  name: string;
  kind: number;
  kindName: string;
  slotId?: number;
  typeName?: string;
  value?: string;
  
  valueIndex?: number;
  valueKind?: number;
  dispId?: number;
  methodIndex?: number;
  metadata: string[];
}

export interface AbcInstance {
  index: number;
  name: string;
  package: string;
  className: string;
  superName: string;
  flags: number;
  protectedNs?: string;
  interfaces: string[];
  iinit: number;
  traits: AbcTrait[];
}

export interface AbcClass {
  index: number;
  cinit: number;
  traits: AbcTrait[];
}

export interface AbcScript {
  init: number;
  traits: AbcTrait[];
}

export interface AbcException {
  from: number;
  to: number;
  target: number;
  excType: string;
  varName: string;
}

export interface AbcMethodBody {
  method: number;
  maxStack: number;
  localCount: number;
  initScopeDepth: number;
  maxScopeDepth: number;
  code: Uint8Array;
  exceptions: AbcException[];
  traits: AbcTrait[];
}

export interface AbcMetadata {
  name: string;
  keys: string[];
  values: string[];
}

export interface AbcConstantPool {
  ints: number[];
  uints: number[];
  doubles: number[];
  strings: string[];
  namespaces: AbcNamespace[];
  nsSets: string[][];
  multinames: AbcMultiname[];
}

export interface AbcFile {
  minor: number;
  major: number;
  pool: AbcConstantPool;
  methods: AbcMethod[];
  metadata: AbcMetadata[];
  instances: AbcInstance[];
  classes: AbcClass[];
  scripts: AbcScript[];
  bodies: AbcMethodBody[];
  
  byteLength: number;
}

export const NS_KIND: Record<number, string> = {
  0x08: "Namespace",
  0x16: "PackageNamespace",
  0x17: "PackageInternalNs",
  0x18: "ProtectedNamespace",
  0x19: "ExplicitNamespace",
  0x1a: "StaticProtectedNs",
  0x05: "PrivateNs",
};

export const TRAIT_KIND: Record<number, string> = {
  0: "Slot",
  1: "Method",
  2: "Getter",
  3: "Setter",
  4: "Class",
  5: "Function",
  6: "Const",
};
