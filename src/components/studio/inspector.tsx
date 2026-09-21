import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { IMAGE_TAGS, SHAPE_TAGS, SPRITE_TAGS, FONT_TAGS, SOUND_TAGS, ABC_TAGS } from "@/lib/swf/tags";
import { inspectTagProperties } from "@/lib/swf/parser";
import { HeaderView } from "./header-view";
import { TagActions } from "./tag-actions";
import { ImageEditor } from "./image-editor";
import { ShapeViewer } from "./shape-viewer";
import { SpriteViewer } from "./sprite-viewer";
import { AbcEditor } from "./abc-editor";
import { HexEditor } from "./hex-editor";
import { AssetMeta } from "./asset-meta";

export function Inspector({ onBack }: { onBack: () => void }) {
  const project = useStudio((s) => s.project)!;
  const selection = useStudio((s) => s.selection);

  let title = project.fileName;
  let body: ReactNode = <HeaderView />;

  if (selection.kind === "header") {
    title = "Header";
    body = <HeaderView />;
  } else if (selection.kind === "hex") {
    title = "Hex";
    body = <HexEditor bytes={project.body} label="Uncompressed SWF" />;
  } else if (selection.kind === "group") {
    title = selection.group;
    body = <GroupSummary group={selection.group} />;
  } else if (selection.kind === "tag") {
    const tag = project.tags[selection.index];
    if (!tag) {
      title = "Missing tag";
      body = <p className="text-sm text-muted">Tag no longer exists.</p>;
    } else {
      title = tag.label ?? tag.name;
      if (IMAGE_TAGS.has(tag.code)) body = <ImageEditor tagIndex={tag.index} />;
      else if (SHAPE_TAGS.has(tag.code)) body = <ShapeViewer tagIndex={tag.index} />;
      else if (SPRITE_TAGS.has(tag.code)) body = <SpriteViewer tagIndex={tag.index} />;
      else if (ABC_TAGS.has(tag.code)) {
        const bi = project.abcBlocks.findIndex((b) => b.tagIndex === tag.index);
        body = bi >= 0 ? <AbcEditor block={bi} /> : <TagDump tagIndex={tag.index} />;
      } else if (FONT_TAGS.has(tag.code) || SOUND_TAGS.has(tag.code)) {
        body = <AssetMeta tagIndex={tag.index} />;
      } else {
        body = <TagDump tagIndex={tag.index} />;
      }
    }
  } else if (selection.kind === "abc") {
    title = project.abcBlocks[selection.block]?.name || "ABC";
    body = <AbcEditor block={selection.block} />;
  } else if (selection.kind === "class") {
    const inst = project.abcBlocks[selection.block]?.abc.instances[selection.instance];
    title = inst?.className ?? "Class";
    body = <AbcEditor block={selection.block} instance={selection.instance} />;
  } else if (selection.kind === "method") {
    title = project.abcBlocks[selection.block]?.abc.methods[selection.method]?.name || "Method";
    body = <AbcEditor block={selection.block} method={selection.method} />;
  } else {
    title = "SWF";
    body = <HeaderView />;
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2 md:px-3">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back">
          <ArrowLeft />
        </Button>
        <div className="min-w-0 flex-1 truncate text-sm font-medium">{title}</div>
        {project.dirty && <span className="font-mono text-[10px] text-warn">modified</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-3 py-4 pb-28 md:px-5">{body}</div>
    </div>
  );
}

function GroupSummary({ group }: { group: string }) {
  const project = useStudio((s) => s.project)!;
  const counts: Record<string, number> = {
    tags: project.tags.length,
    images: project.tags.filter((t) => IMAGE_TAGS.has(t.code)).length,
    shapes: project.tags.filter((t) => SHAPE_TAGS.has(t.code)).length,
    sprites: project.tags.filter((t) => SPRITE_TAGS.has(t.code)).length,
    fonts: project.tags.filter((t) => FONT_TAGS.has(t.code)).length,
    sounds: project.tags.filter((t) => SOUND_TAGS.has(t.code)).length,
    text: project.tags.filter((t) => t.code === 11 || t.code === 33 || t.code === 37).length,
    actionscript: project.abcBlocks.length,
    binary: 1,
  };
  return (
    <div>
      <h2 className="text-lg font-medium capitalize">{group}</h2>
      <p className="mt-1 text-sm text-muted">{counts[group] ?? 0} entries. Select an item in the tree.</p>
    </div>
  );
}

export function TagDump({ tagIndex }: { tagIndex: number }) {
  const project = useStudio((s) => s.project)!;
  const tag = project.tags[tagIndex]!;
  const props = inspectTagProperties(project, tag);
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {Object.entries(props).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-mono text-xs break-all">{String(v)}</dd>
          </div>
        ))}
      </dl>
      <TagActions tagIndex={tagIndex} />
      <HexEditor
        bytes={tag.data ?? project.body.subarray(tag.offset, tag.offset + tag.length)}
        label={`${tag.name} payload`}
        onCommit={(next) => useStudio.getState().mutateTagData(tagIndex, next)}
      />
    </div>
  );
}
