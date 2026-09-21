import { disassemble, type DisasmLine } from "./disasm";
import { findBody, simpleTypeName } from "./parser";
import type { AbcFile, AbcInstance, AbcMethod } from "./types";

export function decompileClass(abc: AbcFile, inst: AbcInstance): string {
  const cls = abc.classes[inst.index];
  const lines: string[] = [];
  const pkg = inst.package;
  if (pkg) lines.push(`package ${pkg} {`);
  else lines.push("package {");
  const indent = "    ";
  const flags = inst.flags;
  const vis = "public";
  const isInterface = (flags & 0x04) !== 0;
  const isFinal = (flags & 0x02) !== 0;
  const isSealed = (flags & 0x01) === 0;
  const mods = [vis, isFinal ? "final" : "", isInterface ? "interface" : "class"].filter(Boolean);
  let header = `${indent}${mods.join(" ")} ${inst.className}`;
  const superName = simpleTypeName(inst.superName);
  if (superName && superName !== "*" && superName !== "Object") header += ` extends ${superName}`;
  if (inst.interfaces.length) {
    header += ` implements ${inst.interfaces.map(simpleTypeName).join(", ")}`;
  }
  lines.push(`${header} {`);

  for (const t of inst.traits) {
    if (t.kind === 0 || t.kind === 6) {
      const k = t.kind === 6 ? "const" : "var";
      const type = simpleTypeName(t.typeName ?? "*");
      const init = t.value != null ? ` = ${t.value}` : "";
      lines.push(`${indent}    public ${k} ${localName(t.name)}:${type}${init};`);
    }
  }
  if (cls) {
    for (const t of cls.traits) {
      if (t.kind === 0 || t.kind === 6) {
        const k = t.kind === 6 ? "const" : "var";
        const type = simpleTypeName(t.typeName ?? "*");
        lines.push(`${indent}    public static ${k} ${localName(t.name)}:${type};`);
      }
    }
  }

  
  lines.push("");
  lines.push(decompileMethod(abc, inst.iinit, inst.className, true, indent + "    "));

  for (const t of inst.traits) {
    if (t.kind === 1 || t.kind === 2 || t.kind === 3) {
      const prefix = t.kind === 2 ? "get " : t.kind === 3 ? "set " : "";
      lines.push("");
      lines.push(decompileMethod(abc, t.methodIndex ?? 0, prefix + localName(t.name), false, indent + "    "));
    }
  }
  if (cls) {
    for (const t of cls.traits) {
      if (t.kind === 1 || t.kind === 2 || t.kind === 3) {
        const prefix = t.kind === 2 ? "get " : t.kind === 3 ? "set " : "";
        lines.push("");
        lines.push(
          decompileMethod(abc, t.methodIndex ?? 0, "static " + prefix + localName(t.name), false, indent + "    "),
        );
      }
    }
  }

  lines.push(`${indent}}`);
  lines.push("}");
  return lines.join("\n");
}

export function decompileMethod(
  abc: AbcFile,
  methodIndex: number,
  displayName: string,
  isCtor: boolean,
  indent: string,
): string {
  const m = abc.methods[methodIndex];
  if (!m) return `${indent}// missing method #${methodIndex}`;
  const params = m.paramNames
    .map((n, i) => `${n}:${simpleTypeName(m.paramTypes[i] ?? "*")}`)
    .concat(m.needRest ? ["...rest"] : []);
  const ret = isCtor ? "" : `:${simpleTypeName(m.returnType)}`;
  const name = isCtor ? displayName : displayName || m.name || `method${methodIndex}`;
  const header = `${indent}public function ${name}(${params.join(", ")})${ret} {`;
  const body = findBody(abc, methodIndex);
  const inner = body ? decompileBody(abc, m, body.code) : ["
  const bodyLines = inner.map((l) => indent + "    " + l);
  return [header, ...bodyLines, indent + "}"].join("\n");
}

function localName(q: string): string {
  return q.replace(/^.*::/, "");
}

function decompileBody(abc: AbcFile, _method: AbcMethod, code: Uint8Array): string[] {
  const ins = disassemble(abc, code);
  const stack: string[] = [];
  const out: string[] = [];
  const local: string[] = [];

  const push = (s: string) => stack.push(s);
  const pop = (): string => stack.pop() ?? "?";

  for (const line of ins) {
    const stmt = apply(abc, line, push, pop, local);
    if (stmt) out.push(stmt);
  }
  if (out.length === 0) out.push("return;");
  return out;
}

function apply(
  abc: AbcFile,
  line: DisasmLine,
  push: (s: string) => void,
  pop: () => string,
  local: string[],
): string | null {
  const op = line.op;
  const a = line.operands[0] ?? 0;
  const b = line.operands[1] ?? 0;
  switch (op) {
    case 0xd0:
      push("this");
      return null;
    case 0xd1:
      push(local[1] ?? "local1");
      return null;
    case 0xd2:
      push(local[2] ?? "local2");
      return null;
    case 0xd3:
      push(local[3] ?? "local3");
      return null;
    case 0x62:
      push(a === 0 ? "this" : (local[a] ?? `local${a}`));
      return null;
    case 0xd4:
      return `this = ${pop()};`;
    case 0xd5:
      local[1] = pop();
      return `local1 = ${local[1]};`;
    case 0xd6:
      local[2] = pop();
      return `local2 = ${local[2]};`;
    case 0xd7:
      local[3] = pop();
      return `local3 = ${local[3]};`;
    case 0x63: {
      const v = pop();
      if (a === 0) return `this = ${v};`;
      local[a] = v;
      return `local${a} = ${v};`;
    }
    case 0x24:
      push(String((a << 24) >> 24));
      return null;
    case 0x25:
      push(String(a));
      return null;
    case 0x2c:
      push(JSON.stringify(abc.pool.strings[a] ?? ""));
      return null;
    case 0x2d:
      push(String(abc.pool.ints[a] ?? 0));
      return null;
    case 0x2e:
      push(String(abc.pool.uints[a] ?? 0));
      return null;
    case 0x2f:
      push(String(abc.pool.doubles[a] ?? 0));
      return null;
    case 0x20:
      push("null");
      return null;
    case 0x21:
      push("undefined");
      return null;
    case 0x26:
      push("true");
      return null;
    case 0x27:
      push("false");
      return null;
    case 0x28:
      push("NaN");
      return null;
    case 0x29:
      pop();
      return null;
    case 0x2a:
      push(stackTop(push, pop));
      return null;
    case 0x30:
      pop();
      return null;
    case 0x1d:
      return null;
    case 0x60: {
      push(mn(abc, a));
      return null;
    }
    case 0x5d:
    case 0x5e:
      push(mn(abc, a));
      return null;
    case 0x66: {
      const obj = pop();
      const name = mn(abc, a);
      push(obj === "this" || obj === name ? `${obj}.${bare(name)}` : `${obj}.${bare(name)}`);
      return null;
    }
    case 0x61:
    case 0x68: {
      const value = pop();
      const obj = pop();
      return `${obj}.${bare(mn(abc, a))} = ${value};`;
    }
    case 0x4f: {
      const argc = b;
      const args = popN(pop, argc);
      const obj = pop();
      return `${obj}.${bare(mn(abc, a))}(${args.join(", ")});`;
    }
    case 0x46:
    case 0x4c: {
      const argc = b;
      const args = popN(pop, argc);
      const obj = pop();
      push(`${obj}.${bare(mn(abc, a))}(${args.join(", ")})`);
      return null;
    }
    case 0x4a: {
      const argc = b;
      const args = popN(pop, argc);
      const obj = pop();
      push(`new ${obj}.${bare(mn(abc, a))}(${args.join(", ")})`);
      return null;
    }
    case 0x49: {
      const args = popN(pop, a);
      pop(); 
      return `super(${args.join(", ")});`;
    }
    case 0x41: {
      const args = popN(pop, a);
      const recv = pop();
      const fn = pop();
      push(`${fn}.call(${[recv, ...args].join(", ")})`);
      return null;
    }
    case 0x42: {
      const args = popN(pop, a);
      const ctor = pop();
      push(`new ${ctor}(${args.join(", ")})`);
      return null;
    }
    case 0x47:
      return "return;";
    case 0x48:
      return `return ${pop()};`;
    case 0xa0: {
      const r = pop();
      const l = pop();
      push(`(${l} + ${r})`);
      return null;
    }
    case 0xa1: {
      const r = pop();
      const l = pop();
      push(`(${l} - ${r})`);
      return null;
    }
    case 0xa2: {
      const r = pop();
      const l = pop();
      push(`(${l} * ${r})`);
      return null;
    }
    case 0xa3: {
      const r = pop();
      const l = pop();
      push(`(${l} / ${r})`);
      return null;
    }
    case 0xab: {
      const r = pop();
      const l = pop();
      push(`(${l} == ${r})`);
      return null;
    }
    case 0xad: {
      const r = pop();
      const l = pop();
      push(`(${l} < ${r})`);
      return null;
    }
    case 0x91:
      push(`(${pop()} + 1)`);
      return null;
    case 0x93:
      push(`(${pop()} - 1)`);
      return null;
    case 0x73:
    case 0x74:
    case 0x75:
    case 0x76:
    case 0x70:
    case 0x82:
    case 0x85:
      return null;
    case 0x80:
      push(`${pop()} as ${mn(abc, a)}`);
      return null;
    case 0x58: {
      const base = pop();
      push(`newclass(${base}, ${a})`);
      return null;
    }
    case 0x10:
      return `goto +${a};`;
    case 0x11:
      return `if (${pop()}) goto +${a};`;
    case 0x12:
      return `if (!${pop()}) goto +${a};`;
    case 0x13: {
      const r = pop();
      const l = pop();
      return `if (${l} == ${r}) goto +${a};`;
    }
    case 0x14: {
      const r = pop();
      const l = pop();
      return `if (${l} != ${r}) goto +${a};`;
    }
    case 0x56: {
      const args = popN(pop, a);
      push(`[${args.join(", ")}]`);
      return null;
    }
    case 0x55: {
      const args = popN(pop, a * 2);
      const props: string[] = [];
      for (let i = 0; i < args.length; i += 2) props.push(`${args[i]}: ${args[i + 1]}`);
      push(`{ ${props.join(", ")} }`);
      return null;
    }
    case 0x02:
    case 0x09:
    case 0xf0:
    case 0xf1:
    case 0xef:
      return null;
    default:
      return `/* ${line.text} */`;
  }
}

function mn(abc: AbcFile, index: number): string {
  const m = abc.pool.multinames[index];
  if (!m) return `mn#${index}`;
  return m.name || "*";
}

function bare(s: string): string {
  return s.replace(/^.*::/, "");
}

function popN(pop: () => string, n: number): string[] {
  const arr: string[] = [];
  for (let i = 0; i < n; i++) arr.unshift(pop());
  return arr;
}

function stackTop(push: (s: string) => void, pop: () => string): string {
  const v = pop();
  push(v);
  push(v);
  return v;
}
