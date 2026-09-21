import { tagName } from "./tags";
import type { SwfProject } from "./types";

export interface SearchHit {
  id: string;
  kind: "tag" | "class" | "method" | "string" | "symbol" | "package";
  file: string;
  tag?: string;
  className?: string;
  method?: string;
  offset?: number;
  preview: string;
  select: {
    kind: "tag" | "class" | "method" | "root";
    tagIndex?: number;
    block?: number;
    instance?: number;
    method?: number;
  };
}

export function searchProject(project: SwfProject, query: string): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  const push = (h: SearchHit) => {
    if (hits.length < 400) hits.push(h);
  };

  for (const tag of project.tags) {
    if (tag.name.toLowerCase().includes(q) || String(tag.code).includes(q) || (tag.label ?? "").toLowerCase().includes(q)) {
      push({
        id: `tag-${tag.index}`,
        kind: "tag",
        file: project.fileName,
        tag: tag.name,
        preview: `#${tag.index} ${tag.name}${tag.label ? " · " + tag.label : ""} (${tag.length} B)`,
        select: { kind: "tag", tagIndex: tag.index },
      });
    }
  }

  for (const s of [...project.symbols, ...project.exports]) {
    if (s.name.toLowerCase().includes(q)) {
      const tag = project.tags.find((t) => t.characterId === s.characterId);
      push({
        id: `sym-${s.characterId}-${s.name}`,
        kind: "symbol",
        file: project.fileName,
        tag: tag ? tagName(tag.code) : "Symbol",
        preview: `${s.name} → character ${s.characterId}`,
        select: { kind: tag ? "tag" : "root", tagIndex: tag?.index },
      });
    }
  }

  project.abcBlocks.forEach((block, bi) => {
    const abc = block.abc;
    abc.pool.strings.forEach((s, i) => {
      if (i === 0) return;
      if (s.toLowerCase().includes(q)) {
        push({
          id: `str-${bi}-${i}`,
          kind: "string",
          file: project.fileName,
          tag: "DoABC",
          offset: i,
          preview: `cpool[${i}] ${truncate(s, 80)}`,
          select: { kind: "root" },
        });
      }
    });
    abc.instances.forEach((inst) => {
      if (
        inst.className.toLowerCase().includes(q) ||
        inst.package.toLowerCase().includes(q) ||
        inst.name.toLowerCase().includes(q)
      ) {
        push({
          id: `cls-${bi}-${inst.index}`,
          kind: "class",
          file: project.fileName,
          className: inst.className,
          preview: `${inst.package ? inst.package + "." : ""}${inst.className} extends ${inst.superName}`,
          select: { kind: "class", block: bi, instance: inst.index },
        });
      }
      if (inst.package.toLowerCase().includes(q) && inst.package) {
        push({
          id: `pkg-${bi}-${inst.index}`,
          kind: "package",
          file: project.fileName,
          className: inst.className,
          preview: `package ${inst.package}`,
          select: { kind: "class", block: bi, instance: inst.index },
        });
      }
      for (const t of inst.traits) {
        if ((t.kind === 1 || t.kind === 2 || t.kind === 3) && t.name.toLowerCase().includes(q)) {
          push({
            id: `m-${bi}-${t.methodIndex}`,
            kind: "method",
            file: project.fileName,
            className: inst.className,
            method: t.name,
            preview: `${inst.className}.${t.name.replace(/^.*::/, "")}()`,
            select: { kind: "method", block: bi, method: t.methodIndex },
          });
        }
      }
    });
    abc.methods.forEach((m) => {
      if (m.name && m.name.toLowerCase().includes(q)) {
        push({
          id: `meth-${bi}-${m.index}`,
          kind: "method",
          file: project.fileName,
          method: m.name,
          preview: `${m.name}(${m.paramNames.join(", ")})`,
          select: { kind: "method", block: bi, method: m.index },
        });
      }
    });
  });

  return unique(hits);
}

function unique(hits: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  const out: SearchHit[] = [];
  for (const h of hits) {
    if (seen.has(h.id)) continue;
    seen.add(h.id);
    out.push(h);
  }
  return out;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
