import type { ReactNode } from "react";
import { Copy, Download, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { getTagBytes } from "@/lib/swf/parser";
import { downloadBytes } from "@/lib/utils";
import { TAG } from "@/lib/swf/tags";

export function TagActions({ tagIndex, extra }: { tagIndex: number; extra?: ReactNode }) {
  const project = useStudio((s) => s.project)!;
  const tag = project.tags[tagIndex];
  if (!tag) return null;
  const data = getTagBytes(project.body, tag);
  const locked = tag.code === TAG.End || tag.code === TAG.FileAttributes;

  return (
    <div className="flex flex-wrap gap-2">
      {extra}
      <Button
        variant="secondary"
        size="sm"
        onClick={() => downloadBytes(data, `${tag.name}_${tag.index}.bin`)}
      >
        <Download />
        Export tag
      </Button>
      <Button variant="secondary" size="sm" disabled={locked} onClick={() => useStudio.getState().dupTag(tagIndex)}>
        <Copy />
        Duplicate
      </Button>
      <Button variant="secondary" size="sm" disabled={locked} onClick={() => useStudio.getState().shiftTag(tagIndex, -1)}>
        <ChevronUp />
        Up
      </Button>
      <Button variant="secondary" size="sm" disabled={locked} onClick={() => useStudio.getState().shiftTag(tagIndex, 1)}>
        <ChevronDown />
        Down
      </Button>
      <Button variant="danger" size="sm" disabled={locked} onClick={() => useStudio.getState().removeTag(tagIndex)}>
        <Trash2 />
        Delete
      </Button>
    </div>
  );
}
