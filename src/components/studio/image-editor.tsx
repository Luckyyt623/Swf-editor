import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { decodeImageForPreview, imageToCanvas, replaceImageFromFile, rgbaToPng, type DecodedImage } from "@/lib/swf/images";
import { inspectTagProperties } from "@/lib/swf/parser";
import { downloadBytes } from "@/lib/utils";
import { TagActions } from "./tag-actions";

const cache = new Map<string, DecodedImage>();

export function ImageEditor({ tagIndex }: { tagIndex: number }) {
  const project = useStudio((s) => s.project)!;
  const tag = project.tags[tagIndex]!;
  const preserveDimensions = useStudio((s) => s.preserveDimensions);
  const preserveTransparency = useStudio((s) => s.preserveTransparency);
  const [img, setImg] = useState<DecodedImage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const key = `${project.fileName}:${tagIndex}:${tag.length}:${project.dirty}`;

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    const hit = cache.get(key);
    const run = async () => {
      try {
        const decoded = hit ?? (await decodeImageForPreview(project, tag));
        if (cancelled) return;
        cache.set(key, decoded);
        setImg(decoded);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [key, project, tag]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !img || !img.width) return;
    const src = imageToCanvas(img);
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(src, 0, 0);
    return () => {
      src.width = 0;
      src.height = 0;
    };
  }, [img]);

  const exportPng = () => {
    if (!img) return;
    const png = rgbaToPng(img.width, img.height, img.rgba);
    downloadBytes(png, `${tag.label ?? "image"}_${tag.characterId ?? tag.index}.png`, "image/png");
  };

  const onReplace = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = await replaceImageFromFile(project, tagIndex, file, {
        preserveDimensions,
        preserveTransparency,
        original: img ?? undefined,
      });
      cache.clear();
      setImg(next);
      useStudio.getState().setToast("Image replaced — save to rebuild SWF");
      useStudio.setState({ project: { ...project } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const props = inspectTagProperties(project, tag);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-surface-2 p-3">
        {err && <p className="text-sm text-danger">{err}</p>}
        {!err && !img && <p className="text-sm text-muted">Decoding image…</p>}
        <canvas
          ref={canvasRef}
          className="checkerboard mx-auto max-h-80 max-w-full"
        />
        {img && (
          <p className="mt-2 text-center font-mono text-[11px] text-muted">
            {img.width}×{img.height} · {img.source} · id {img.characterId}
            {img.hasAlpha ? " · alpha" : ""}
          </p>
        )}
      </div>
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
            <Button variant="secondary" size="sm" onClick={exportPng} disabled={!img}>
              <Download />
              Export PNG
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              <ImagePlus />
              Replace
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={(e) => void onReplace(e.target.files?.[0])}
            />
          </>
        }
      />
      <p className="text-xs text-subtle">
        Replacement is reinserted as DefineBitsLossless2 (32-bit ARGB) so dimensions and transparency survive. JPEG
        files keep JPEG2 only when the original tag is JPEG2 and transparency is off.
      </p>
    </div>
  );
}
