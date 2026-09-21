import { useEffect, useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { drawShape, parseShapeTag, shapeToSvg } from "@/lib/swf/shapes";
import { downloadBytes } from "@/lib/utils";
import { TagActions } from "./tag-actions";
import { inspectTagProperties } from "@/lib/swf/parser";

export function ShapeViewer({ tagIndex }: { tagIndex: number }) {
  const project = useStudio((s) => s.project)!;
  const tag = project.tags[tagIndex]!;
  const [showFills, setShowFills] = useState(true);
  const [showStrokes, setShowStrokes] = useState(true);
  const [showBounds, setShowBounds] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const shape = useMemo(() => {
    try {
      return parseShapeTag(project, tag);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [project, tag]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !shape) return;
    const w = canvas.clientWidth || 320;
    const h = 280;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const bw = Math.max(1, shape.bounds.xMax - shape.bounds.xMin);
    const bh = Math.max(1, shape.bounds.yMax - shape.bounds.yMin);
    const scale = Math.min((w - 24) / bw, (h - 24) / bh) * zoom;
    ctx.translate(w / 2 + pan.x, h / 2 + pan.y);
    ctx.scale(scale, scale);
    ctx.translate(-(shape.bounds.xMin + shape.bounds.xMax) / 2, -(shape.bounds.yMin + shape.bounds.yMax) / 2);
    drawShape(ctx, shape, { showFills, showStrokes, showBounds });
  }, [shape, zoom, pan, showFills, showStrokes, showBounds]);

  const exportSvg = () => {
    if (!shape) return;
    const svg = shapeToSvg(shape);
    downloadBytes(new TextEncoder().encode(svg), `${tag.label ?? "shape"}_${tag.characterId}.svg`, "image/svg+xml");
  };

  const exportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      void blob.arrayBuffer().then((b) => downloadBytes(new Uint8Array(b), `${tag.label ?? "shape"}.png`, "image/png"));
    });
  };

  const props = inspectTagProperties(project, tag);

  return (
    <div className="space-y-4">
      {err && <p className="text-sm text-danger">{err}</p>}
      <canvas
        ref={canvasRef}
        className="h-[280px] w-full touch-none rounded-lg border border-border bg-surface-2"
        onPointerDown={(e) => {
          (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onWheel={(e) => {
          e.preventDefault();
          setZoom((z) => Math.min(16, Math.max(0.1, z * (e.deltaY > 0 ? 0.9 : 1.1))));
        }}
      />
      <div className="flex flex-wrap gap-2 text-xs">
        <Toggle label="Fills" on={showFills} set={setShowFills} />
        <Toggle label="Strokes" on={showStrokes} set={setShowStrokes} />
        <Toggle label="Bounds" on={showBounds} set={setShowBounds} />
        <Button variant="secondary" size="sm" onClick={() => setZoom((z) => z * 1.2)}>
          Zoom +
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setZoom((z) => z / 1.2)}>
          Zoom −
        </Button>
        <Button variant="secondary" size="sm" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
          Reset
        </Button>
      </div>
      {shape && (
        <p className="font-mono text-[11px] text-muted">
          id {shape.characterId} · fills {shape.fillCount} · strokes {shape.lineCount} · paths {shape.paths.length}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {Object.entries(props).map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-mono text-xs">{String(v)}</dd>
          </div>
        ))}
      </dl>
      <TagActions
        tagIndex={tagIndex}
        extra={
          <>
            <Button variant="secondary" size="sm" onClick={exportSvg} disabled={!shape}>
              <Download />
              SVG
            </Button>
            <Button variant="secondary" size="sm" onClick={exportPng}>
              <Download />
              PNG
            </Button>
          </>
        }
      />
    </div>
  );
}

function Toggle({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => set(!on)}
      className={`rounded-md border px-2 py-1 ${on ? "border-tint/40 bg-tint/15 text-foreground" : "border-border text-muted"}`}
    >
      {label}
    </button>
  );
}
