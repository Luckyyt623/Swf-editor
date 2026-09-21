import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import type { Selection } from "@/lib/swf/types";

export function SearchPanel() {
  const query = useStudio((s) => s.searchQuery);
  const hits = useStudio((s) => s.searchHits);
  const runSearch = useStudio((s) => s.runSearch);
  const setSearchOpen = useStudio((s) => s.setSearchOpen);
  const select = useStudio((s) => s.select);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg/95 pt-[env(safe-area-inset-top)]">
      <div className="flex items-center gap-2 border-b border-border px-2 py-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Search classes, methods, strings, tags, symbols"
          className="h-11 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-3 text-sm"
        />
        <Button variant="ghost" size="icon" onClick={() => setSearchOpen(false)} aria-label="Close search">
          <X />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {hits.length === 0 && query.trim() && (
          <p className="px-4 py-8 text-sm text-muted">No matches.</p>
        )}
        <ul>
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="flex w-full flex-col gap-0.5 border-b border-border px-4 py-3 text-left hover:bg-surface-2"
                onClick={() => {
                  const sel = hitToSelection(h.select);
                  if (sel) select(sel);
                  setSearchOpen(false);
                }}
              >
                <span className="text-sm">{h.preview}</span>
                <span className="font-mono text-[11px] text-subtle">
                  {h.kind}
                  {h.className ? ` · ${h.className}` : ""}
                  {h.method ? ` · ${h.method}` : ""}
                  {h.tag ? ` · ${h.tag}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function hitToSelection(s: {
  kind: string;
  tagIndex?: number;
  block?: number;
  instance?: number;
  method?: number;
}): Selection | null {
  if (s.kind === "tag" && s.tagIndex != null) return { kind: "tag", index: s.tagIndex };
  if (s.kind === "class" && s.block != null && s.instance != null)
    return { kind: "class", block: s.block, instance: s.instance };
  if (s.kind === "method" && s.block != null && s.method != null)
    return { kind: "method", block: s.block, method: s.method };
  if (s.kind === "root") return { kind: "root" };
  return null;
}
