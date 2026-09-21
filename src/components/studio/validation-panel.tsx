import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { cn } from "@/lib/utils";

export function ValidationPanel() {
  const validation = useStudio((s) => s.validation);
  const validate = useStudio((s) => s.validate);
  const save = useStudio((s) => s.save);
  const project = useStudio((s) => s.project);

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted">Rebuild validation</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => validate()} disabled={!project}>
            Run
          </Button>
          <Button size="sm" onClick={() => save(false)} disabled={!project}>
            Save
          </Button>
        </div>
      </div>
      <ul className="space-y-1.5">
        {(validation?.checks ?? DEFAULT_CHECKS).map((c) => (
          <li key={c.id} className="flex items-start gap-2 font-mono text-xs">
            <span
              className={cn(
                "mt-0.5 flex size-4 items-center justify-center rounded-sm",
                c.ok ? "bg-success/15 text-success" : "bg-danger/15 text-danger",
              )}
            >
              {c.ok ? <Check className="size-3" /> : <X className="size-3" />}
            </span>
            <span className="flex-1">
              {c.label}
              {c.detail && <span className="text-subtle"> — {c.detail}</span>}
            </span>
          </li>
        ))}
      </ul>
      {validation && !validation.ok && (
        <p className="mt-3 text-xs text-danger">Validation failed. The original file will not be overwritten.</p>
      )}
    </section>
  );
}

const DEFAULT_CHECKS = [
  { id: "header", label: "SWF header valid", ok: false, detail: "not run" },
  { id: "tags", label: "Tag structure valid", ok: false, detail: "not run" },
  { id: "tagLengths", label: "Tag lengths valid", ok: false, detail: "not run" },
  { id: "abc", label: "ABC structure valid", ok: false, detail: "not run" },
  { id: "cpool", label: "Constant pool valid", ok: false, detail: "not run" },
  { id: "bodies", label: "Method bodies valid", ok: false, detail: "not run" },
  { id: "fileLength", label: "File length valid", ok: false, detail: "not run" },
  { id: "compression", label: "Compression valid", ok: false, detail: "not run" },
];
