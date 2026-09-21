import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { parseFontMeta, parseSoundMeta } from "@/lib/swf/sprites";
import { FONT_TAGS, SOUND_TAGS } from "@/lib/swf/tags";
import { TagActions } from "./tag-actions";
import { inspectTagProperties } from "@/lib/swf/parser";
import { downloadBytes } from "@/lib/utils";
import { Play } from "lucide-react";

export function AssetMeta({ tagIndex }: { tagIndex: number }) {
  const project = useStudio((s) => s.project)!;
  const tag = project.tags[tagIndex]!;
  const props = inspectTagProperties(project, tag);

  if (FONT_TAGS.has(tag.code)) {
    let meta = { id: tag.characterId ?? 0, name: tag.label ?? "Font", glyphs: 0 };
    try {
      meta = parseFontMeta(project, tag);
    } catch {
      
    }
    return (
      <div className="space-y-4">
        <p className="text-sm">
          <span className="font-medium">{meta.name}</span>
          <span className="ml-2 font-mono text-xs text-muted">
            id {meta.id} · {meta.glyphs} glyphs
          </span>
        </p>
        <p className="text-sm text-subtle">Glyph outline editing is not implemented. Metadata and export work.</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {Object.entries(props).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="font-mono text-xs">{String(v)}</dd>
            </div>
          ))}
        </dl>
        <TagActions tagIndex={tagIndex} />
      </div>
    );
  }

  if (SOUND_TAGS.has(tag.code)) {
    let sound;
    try {
      sound = parseSoundMeta(project, tag);
    } catch (e) {
      return <p className="text-sm text-danger">{e instanceof Error ? e.message : String(e)}</p>;
    }
    const play = () => {
      if (sound.format !== 2) {
        useStudio.getState().setToast("Playback only implemented for MP3 DefineSound");
        return;
      }
      let payload = sound.data;
      if (payload.length >= 2) payload = payload.subarray(2); 
      const copy = new Uint8Array(payload.byteLength);
      copy.set(payload);
      const blob = new Blob([copy], { type: "audio/mpeg" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      void audio.play();
      audio.onended = () => URL.revokeObjectURL(url);
    };
    return (
      <div className="space-y-4">
        <p className="text-sm">
          Sound {sound.id} · {sound.formatName} · {sound.rate} Hz · {sound.bits}-bit · {sound.stereo ? "stereo" : "mono"}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={play}>
            <Play />
            Play
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadBytes(sound.data, `sound_${sound.id}.bin`)}
          >
            Export raw
          </Button>
        </div>
        <TagActions tagIndex={tagIndex} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-subtle">Not implemented for this tag type beyond inspect/export/delete.</p>
      <TagActions tagIndex={tagIndex} />
    </div>
  );
}
