import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { parseSpriteTag } from "@/lib/swf/sprites";
import { parseShapeTag, drawShape } from "@/lib/swf/shapes";
import { SHAPE_TAGS } from "@/lib/swf/tags";
import { TagActions } from "./tag-actions";
import { inspectTagProperties } from "@/lib/swf/parser";

export function SpriteViewer({ tagIndex }: { tagIndex: number }) {
  const project = useStudio((s) => s.project)!;
  const tag = project.tags[tagIndex]!;
  const [err, setErr] = useState<string | null>(null);
  const sprite = useMemo(() => {
    try {
      return parseSpriteTag(project, tag);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [project, tag]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!playing || !sprite) return;
    const fps = project.header.frameRate || 24;
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % Math.max(1, sprite.frames.length));
    }, 1000 / fps);
    return () => window.clearInterval(id);
  }, [playing, sprite, project.header.frameRate]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sprite) return;
    const w = canvas.clientWidth || 320;
    const h = 240;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.fillStyle = "#12151c";
    ctx.fillRect(0, 0, w, h);
    const fr = sprite.frames[frame];
    if (!fr) return;
    ctx.translate(w / 2, h / 2);
    ctx.scale(0.05, 0.05);
    for (const place of fr.places) {
      if (place.characterId == null) continue;
      const child = project.tags.find((t) => t.characterId === place.characterId && SHAPE_TAGS.has(t.code));
      if (!child) continue;
      try {
        const shape = parseShapeTag(project, child);
        ctx.save();
        const m = place.matrix;
        if (m) {
          ctx.transform(m.scaleX, m.rotateSkew0, m.rotateSkew1, m.scaleY, m.translateX, m.translateY);
        }
        drawShape(ctx, shape, { showFills: true, showStrokes: true, showBounds: false });
        ctx.restore();
      } catch {
        
      }
    }
  }, [sprite, frame, project]);

  const props = inspectTagProperties(project, tag);
  const total = sprite?.frames.length ?? 0;

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-danger">{err}</p>}
      <canvas ref={canvasRef} className="h-[240px] w-full rounded-lg border border-border bg-surface-2" />
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon-sm" onClick={() => setFrame(0)} aria-label="First frame">
          <SkipBack />
        </Button>
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button
          variant="secondary"
          size="icon-sm"
          onClick={() => setFrame((f) => Math.min(total - 1, f + 1))}
          aria-label="Next frame"
        >
          <SkipForward />
        </Button>
        <input
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={frame}
          onChange={(e) => setFrame(Number(e.target.value))}
          className="flex-1 accent-tint"
        />
        <span className="font-mono text-xs text-muted tabular-nums">
          {frame + 1}/{total}
        </span>
      </div>
      {sprite && (
        <div>
          <h3 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">Children</h3>
          <ul className="space-y-1 font-mono text-xs">
            {sprite.children.map((c) => (
              <li key={c.characterId}>
                #{c.characterId} {c.name ?? ""}
              </li>
            ))}
            {sprite.children.length === 0 && <li className="text-subtle">No placed characters</li>}
          </ul>
        </div>
      )}
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
