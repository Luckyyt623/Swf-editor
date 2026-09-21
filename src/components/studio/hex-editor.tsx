import { useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { hexByte } from "@/lib/utils";

const ROW_H = 22;

export function HexEditor({
  bytes,
  label,
  onCommit,
}: {
  bytes: Uint8Array;
  label: string;
  onCommit?: (next: Uint8Array) => void;
}) {
  const hexEdit = useStudio((s) => s.hexEdit);
  const bytesPerRow = useStudio((s) => s.bytesPerRow) || 16;
  const scroller = useRef<HTMLDivElement>(null);
  const [jump, setJump] = useState("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Uint8Array | null>(null);
  const data = draft ?? bytes;
  const rows = Math.ceil(data.length / bytesPerRow) || 1;

  const highlights = useMemo(() => findQuery(data, query), [data, query]);

  const jumpTo = () => {
    const n = parseInt(jump, 16);
    if (Number.isNaN(n) || !scroller.current) return;
    const row = Math.floor(n / bytesPerRow);
    scroller.current.scrollTop = row * ROW_H;
  };

  const onCell = (offset: number, hex: string) => {
    if (!hexEdit || !onCommit) return;
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) return;
    const next = (draft ?? bytes).slice();
    next[offset] = parseInt(hex, 16);
    setDraft(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted">{label}</h3>
        <span className="font-mono text-[10px] text-subtle">{data.length} bytes</span>
        {hexEdit && onCommit && (
          <Button
            size="sm"
            variant="secondary"
            disabled={!draft}
            onClick={() => {
              if (draft) onCommit(draft);
              setDraft(null);
            }}
          >
            Apply edits
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={jump}
          onChange={(e) => setJump(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && jumpTo()}
          placeholder="offset hex"
          className="h-9 w-28 rounded-md border border-border bg-surface-2 px-2 font-mono text-xs"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search hex or ASCII"
          className="h-9 min-w-0 flex-1 rounded-md border border-border bg-surface-2 px-2 font-mono text-xs"
        />
      </div>
      {!hexEdit && <p className="text-[11px] text-subtle">Read-only. Enable safe hex editing in Settings to patch bytes.</p>}
      <div
        ref={scroller}
        className="h-64 overflow-auto rounded-lg border border-border bg-surface-2 font-mono text-[11px] scrollbar-thin"
      >
        <div style={{ height: rows * ROW_H, position: "relative" }}>
          <VisibleRows
            rows={rows}
            rowH={ROW_H}
            scrollerRef={scroller}
            render={(row) => {
              const off = row * bytesPerRow;
              const slice = data.subarray(off, off + bytesPerRow);
              let ascii = "";
              const cells = [];
              for (let i = 0; i < slice.length; i++) {
                const b = slice[i]!;
                const o = off + i;
                const hit = highlights.has(o);
                ascii += b >= 32 && b < 127 ? String.fromCharCode(b) : ".";
                cells.push(
                  hexEdit && onCommit ? (
                    <input
                      key={o}
                      defaultValue={hexByte(b)}
                      maxLength={2}
                      onBlur={(e) => onCell(o, e.target.value)}
                      className={`w-6 bg-transparent text-center ${hit ? "text-warn" : ""}`}
                    />
                  ) : (
                    <span key={o} className={`inline-block w-6 text-center ${hit ? "text-warn" : ""}`}>
                      {hexByte(b)}
                    </span>
                  ),
                );
              }
              return (
                <div className="absolute flex w-full gap-3 px-2" style={{ top: row * ROW_H, height: ROW_H }}>
                  <span className="w-12 shrink-0 text-subtle">{off.toString(16).padStart(6, "0")}</span>
                  <span className="flex flex-1 flex-wrap">{cells}</span>
                  <span className="w-36 shrink-0 text-muted">{ascii}</span>
                </div>
              );
            }}
          />
        </div>
      </div>
    </div>
  );
}

function VisibleRows({
  rows,
  rowH,
  scrollerRef,
  render,
}: {
  rows: number;
  rowH: number;
  scrollerRef: RefObject<HTMLDivElement | null>;
  render: (row: number) => ReactNode;
}) {
  const [scroll, setScroll] = useState(0);
  const el = scrollerRef.current;
  if (el && el.dataset.bound !== "1") {
    el.dataset.bound = "1";
    el.addEventListener("scroll", () => setScroll(el.scrollTop), { passive: true });
  }
  const height = el?.clientHeight ?? 256;
  const start = Math.max(0, Math.floor(scroll / rowH) - 4);
  const end = Math.min(rows, Math.ceil((scroll + height) / rowH) + 4);
  const out = [];
  for (let i = start; i < end; i++) out.push(<div key={i}>{render(i)}</div>);
  return <>{out}</>;
}

function findQuery(data: Uint8Array, q: string): Set<number> {
  const hits = new Set<number>();
  const t = q.trim();
  if (!t) return hits;
  const hex = t.replace(/\s+/g, "");
  if (/^[0-9a-fA-F]+$/.test(hex) && hex.length % 2 === 0) {
    const needle = new Uint8Array(hex.length / 2);
    for (let i = 0; i < needle.length; i++) needle[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    scan(data, needle, hits);
  }
  const ascii = new TextEncoder().encode(t);
  scan(data, ascii, hits);
  return hits;
}

function scan(data: Uint8Array, needle: Uint8Array, hits: Set<number>) {
  if (!needle.length || needle.length > data.length) return;
  outer: for (let i = 0; i <= data.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (data[i + j] !== needle[j]) continue outer;
    }
    for (let j = 0; j < needle.length; j++) hits.add(i + j);
  }
}
