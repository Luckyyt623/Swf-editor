import { useStudio } from "@/store/studio";
import { formatBytes } from "@/lib/utils";
import { ValidationPanel } from "./validation-panel";
import { Kv } from "./kv";

export function HeaderView() {
  const project = useStudio((s) => s.project);
  if (!project) return null;
  const h = project.header;
  const abcMethods = project.abcBlocks.reduce((s, b) => s + b.abc.methods.length, 0);
  const classes = project.abcBlocks.reduce((s, b) => s + b.abc.instances.length, 0);
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">SWF header</h2>
        <Kv
          items={[
            { k: "Version", v: String(h.version) },
            { k: "Compression", v: h.compression },
            { k: "File size", v: formatBytes(h.compressedSize) },
            { k: "Uncompressed", v: formatBytes(project.body.length) },
            { k: "Frame rate", v: `${h.frameRate} fps` },
            { k: "Frame count", v: String(h.frameCount) },
            { k: "Stage", v: `${h.frameWidth} × ${h.frameHeight}` },
            { k: "AS version", v: `AS${h.asVersion}` },
            { k: "Tags", v: String(project.tags.length) },
            { k: "ABC blocks", v: String(project.abcBlocks.length) },
            { k: "Classes", v: String(classes) },
            { k: "Methods", v: String(abcMethods) },
          ]}
        />
      </section>
      <ValidationPanel />
    </div>
  );
}
