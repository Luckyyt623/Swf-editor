import { useMemo, useState } from "react";
import {
  Binary,
  Box,
  ChevronDown,
  ChevronRight,
  Code2,
  FileCode,
  Film,
  Folder,
  Image as ImageIcon,
  Layers,
  Music,
  Shapes,
  Type,
} from "lucide-react";
import { IMAGE_TAGS, SHAPE_TAGS, SPRITE_TAGS, FONT_TAGS, SOUND_TAGS, TEXT_TAGS } from "@/lib/swf/tags";
import type { ExplorerGroup, Selection, SwfProject, SwfTag } from "@/lib/swf/types";
import { useStudio } from "@/store/studio";
import { cn, formatBytes } from "@/lib/utils";

interface Node {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Folder;
  onClick: () => void;
  children?: Node[];
  active?: boolean;
}

export function Explorer() {
  const project = useStudio((s) => s.project)!;
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const [open, setOpen] = useState<Record<string, boolean>>({
    tags: false,
    images: true,
    shapes: true,
    sprites: true,
    actionscript: true,
  });

  const tree = useMemo(() => buildTree(project, selection, select), [project, selection, select]);

  return (
    <div className="flex h-full flex-col">
      <button
        type="button"
        onClick={() => select({ kind: "root" })}
        className={cn(
          "flex items-center gap-2 border-b border-border px-3 py-3 text-left",
          selection.kind === "root" && "bg-surface-2",
        )}
      >
        <Box className="size-4 text-tint" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{project.fileName}</div>
          <div className="font-mono text-[11px] text-muted">
            SWF {project.header.version} · {formatBytes(project.originalBytes.length)} · {project.tags.length} tags
          </div>
        </div>
      </button>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin pb-24">
        {tree.map((n) => (
          <TreeNode key={n.id} node={n} depth={0} open={open} setOpen={setOpen} />
        ))}
      </div>
    </div>
  );
}

function TreeNode({
  node,
  depth,
  open,
  setOpen,
}: {
  node: Node;
  depth: number;
  open: Record<string, boolean>;
  setOpen: (s: Record<string, boolean>) => void;
}) {
  const hasKids = Boolean(node.children?.length);
  const expanded = open[node.id] ?? false;
  const Icon = node.icon;
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasKids) setOpen({ ...open, [node.id]: !expanded });
          node.onClick();
        }}
        className={cn(
          "flex w-full items-center gap-2 py-2 pr-3 text-left text-sm",
          node.active ? "bg-tint/15 text-foreground" : "text-foreground hover:bg-surface-2",
        )}
        style={{ paddingLeft: 12 + depth * 14 }}
      >
        {hasKids ? (
          expanded ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon className="size-3.5 shrink-0 text-tint" />
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        {node.hint && <span className="shrink-0 font-mono text-[10px] text-subtle">{node.hint}</span>}
      </button>
      {hasKids &&
        expanded &&
        node.children!.map((c) => <TreeNode key={c.id} node={c} depth={depth + 1} open={open} setOpen={setOpen} />)}
    </div>
  );
}

function buildTree(project: SwfProject, selection: Selection, select: (s: Selection) => void): Node[] {
  const tags = project.tags.filter((t) => t.code !== 0);
  const images = tags.filter((t) => IMAGE_TAGS.has(t.code));
  const shapes = tags.filter((t) => SHAPE_TAGS.has(t.code));
  const sprites = tags.filter((t) => SPRITE_TAGS.has(t.code));
  const fonts = tags.filter((t) => FONT_TAGS.has(t.code));
  const sounds = tags.filter((t) => SOUND_TAGS.has(t.code));
  const texts = tags.filter((t) => TEXT_TAGS.has(t.code));

  const tagActive = (t: SwfTag) => selection.kind === "tag" && selection.index === t.index;

  const tagNode = (t: SwfTag, icon: typeof Folder): Node => ({
    id: `tag-${t.index}`,
    label: t.label ? `${t.label}` : t.name,
    hint: t.characterId != null ? `#${t.characterId}` : `#${t.index}`,
    icon,
    active: tagActive(t),
    onClick: () => select({ kind: "tag", index: t.index }),
  });

  const group = (id: ExplorerGroup, label: string, icon: typeof Folder, children: Node[]): Node => ({
    id,
    label,
    hint: String(children.length),
    icon,
    children,
    onClick: () => select({ kind: "group", group: id }),
    active: selection.kind === "group" && selection.group === id,
  });

  const asChildren: Node[] = [];
  project.abcBlocks.forEach((block, bi) => {
    const byPkg = new Map<string, typeof block.abc.instances>();
    for (const inst of block.abc.instances) {
      const pkg = inst.package || "(default)";
      const list = byPkg.get(pkg) ?? [];
      list.push(inst);
      byPkg.set(pkg, list);
    }
    for (const [pkg, insts] of byPkg) {
      asChildren.push({
        id: `pkg-${bi}-${pkg}`,
        label: pkg,
        icon: Folder,
        onClick: () => select({ kind: "abc", block: bi }),
        children: insts.map((inst) => ({
          id: `cls-${bi}-${inst.index}`,
          label: inst.className,
          icon: FileCode,
          active: selection.kind === "class" && selection.block === bi && selection.instance === inst.index,
          onClick: () => select({ kind: "class", block: bi, instance: inst.index }),
          children: inst.traits
            .filter((t) => t.kind === 1 || t.kind === 2 || t.kind === 3)
            .map((t) => ({
              id: `m-${bi}-${t.methodIndex}`,
              label: `${t.name.replace(/^.*::/, "")}()`,
              icon: Code2,
              active: selection.kind === "method" && selection.block === bi && selection.method === t.methodIndex,
              onClick: () => select({ kind: "method", block: bi, method: t.methodIndex ?? 0 }),
            })),
        })),
      });
    }
  });

  return [
    {
      id: "header",
      label: "Header",
      icon: Layers,
      active: selection.kind === "header",
      onClick: () => select({ kind: "header" }),
    },
    group(
      "tags",
      "Tags",
      Folder,
      tags.map((t) => tagNode(t, Box)),
    ),
    group(
      "images",
      "Images",
      ImageIcon,
      images.map((t) => tagNode(t, ImageIcon)),
    ),
    group(
      "shapes",
      "Shapes",
      Shapes,
      shapes.map((t) => tagNode(t, Shapes)),
    ),
    group(
      "sprites",
      "Sprites",
      Film,
      sprites.map((t) => tagNode(t, Film)),
    ),
    group(
      "fonts",
      "Fonts",
      Type,
      fonts.map((t) => tagNode(t, Type)),
    ),
    group(
      "sounds",
      "Sounds",
      Music,
      sounds.map((t) => tagNode(t, Music)),
    ),
    group(
      "text",
      "Text",
      Type,
      texts.map((t) => tagNode(t, Type)),
    ),
    {
      id: "actionscript",
      label: "ActionScript / ABC",
      hint: String(project.abcBlocks.length),
      icon: Code2,
      active: selection.kind === "abc" || selection.kind === "class" || selection.kind === "method",
      onClick: () => {
        if (project.abcBlocks[0]) select({ kind: "abc", block: 0 });
        else select({ kind: "group", group: "actionscript" });
      },
      children: asChildren,
    },
    {
      id: "hex",
      label: "Binary / Hex",
      icon: Binary,
      active: selection.kind === "hex",
      onClick: () => select({ kind: "hex" }),
    },
  ];
}
