import { useEffect, useRef, useState } from "react";
import {
  FolderOpen,
  Save,
  Search,
  Settings,
  Download,
  MoreVertical,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { Explorer } from "./explorer";
import { Inspector } from "./inspector";
import { SearchPanel } from "./search-panel";
import { SettingsPanel } from "./settings-panel";
import { cn } from "@/lib/utils";
import { SwfPlayer } from "./swf-player";

export function StudioApp() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [playerOpen, setPlayerOpen] = useState(false);
  const status = useStudio((s) => s.status);
  const progress = useStudio((s) => s.progress);
  const project = useStudio((s) => s.project);
  const toast = useStudio((s) => s.toast);
  const openBytes = useStudio((s) => s.openBytes);
  const openDemo = useStudio((s) => s.openDemo);
  const save = useStudio((s) => s.save);
  const setSearchOpen = useStudio((s) => s.setSearchOpen);
  const setSettingsOpen = useStudio((s) => s.setSettingsOpen);
  const searchOpen = useStudio((s) => s.searchOpen);
  const settingsOpen = useStudio((s) => s.settingsOpen);
  const setToast = useStudio((s) => s.setToast);
  const selection = useStudio((s) => s.selection);
  const select = useStudio((s) => s.select);
  const storedSession = useStudio((s) => s.storedSession);
  const refreshStoredSession = useStudio((s) => s.refreshStoredSession);
  const loadFromStorage = useStudio((s) => s.loadFromStorage);

  useEffect(() => {
    void refreshStoredSession();
  }, [refreshStoredSession]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const buf = new Uint8Array(await file.arrayBuffer());
    await openBytes(buf, file.name);
  };

  const showDetail = selection.kind !== "root" && status === "ready";

  return (
    <div className="flex h-dvh flex-col bg-bg text-foreground">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 pt-[env(safe-area-inset-top)] md:px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Mark />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium tracking-tight">SWF Studio</div>
            <div className="truncate font-mono text-[11px] text-muted">
              {project ? project.fileName : "No file open"}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" aria-label="Open SWF" onClick={() => fileRef.current?.click()}>
          <FolderOpen />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Save"
          disabled={!project}
          onClick={() => save(false)}
        >
          <Save />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="hidden sm:inline-flex"
          aria-label="Save as"
          disabled={!project}
          onClick={() => save(true)}
        >
          <Download />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Play SWF"
          disabled={!project || status !== "ready"}
          onClick={() => setPlayerOpen(true)}
        >
          <Play />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Search"
          disabled={!project}
          onClick={() => setSearchOpen(true)}
        >
          <Search />
        </Button>
        <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".swf,application/x-shockwave-flash,application/octet-stream"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </header>

      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cn(
            "min-h-0 w-full overflow-hidden md:w-[340px] md:shrink-0 md:border-r md:border-border",
            showDetail && "hidden md:block",
          )}
        >
          {status === "empty" || status === "error" ? (
            <EmptyState
              error={useStudio.getState().error}
              onOpen={() => fileRef.current?.click()}
              onDemo={() => void openDemo()}
              storedSession={storedSession}
              onResume={() => void loadFromStorage()}
            />
          ) : status === "parsing" ? (
            <ParseProgress progress={progress} />
          ) : (
            <Explorer />
          )}
        </aside>
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 overflow-hidden",
            !showDetail && "hidden md:flex",
            showDetail && "flex",
          )}
        >
          {status === "ready" ? (
            <Inspector onBack={() => select({ kind: "root" })} />
          ) : (
            <div className="hidden flex-1 items-center justify-center text-sm text-muted md:flex">
              Open a SWF to inspect tags, images, and ActionScript.
            </div>
          )}
        </main>
      </div>

      {searchOpen && <SearchPanel />}
      {settingsOpen && <SettingsPanel fileRef={fileRef} />}
      {playerOpen && project && <SwfPlayer onClose={() => setPlayerOpen(false)} />}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-foreground shadow-lg">
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}

function Mark() {
  return (
    <div
      className="flex size-8 items-center justify-center rounded-md border border-border bg-surface-2 font-mono text-[10px] text-tint"
      aria-hidden
    >
      SWF
    </div>
  );
}

function EmptyState({
  onOpen,
  onDemo,
  error,
  storedSession,
  onResume,
}: {
  onOpen: () => void;
  onDemo: () => void;
  error?: string;
  storedSession?: { fileName: string; savedAt: number } | null;
  onResume?: () => void;
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-6 px-6 py-10">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Inspect and rebuild SWF files</h1>
        <p className="mt-2 max-w-sm text-sm text-muted">
          Open a Flash SWF from device storage. Tags, bitmaps, sprites, and ABC are parsed locally — nothing is
          uploaded.
        </p>
      </div>
      {error && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
      {storedSession && onResume && (
        <button
          type="button"
          onClick={onResume}
          className="rounded-md border border-tint/40 bg-tint/10 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-tint/15"
        >
          <div className="font-medium">Resume {storedSession.fileName}</div>
          <div className="text-xs text-muted">Saved in this browser {formatSavedAt(storedSession.savedAt)}</div>
        </button>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button onClick={onOpen} className="h-11">
          <FolderOpen />
          Open SWF
        </Button>
        <Button variant="secondary" onClick={onDemo} className="h-11">
          Load demo SWF
        </Button>
      </div>
      <ul className="space-y-1 font-mono text-xs text-subtle">
        <li>CWS / FWS / ZWS</li>
        <li>DefineBitsLossless · JPEG · Shape · Sprite · DoABC</li>
        <li>Validate, backup, recompress on save</li>
      </ul>
    </div>
  );
}

function formatSavedAt(ms: number): string {
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return new Date(ms).toLocaleDateString();
}

function ParseProgress({ progress }: { progress: { percent: number; message: string; phase: string } }) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 px-6">
      <div className="text-sm font-medium">Parsing SWF</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div
          className="h-full bg-tint transition-[width] duration-(--motion-fast)"
          style={{ width: `${Math.max(4, progress.percent)}%` }}
        />
      </div>
      <div className="font-mono text-xs text-muted">
        {progress.phase} · {progress.message}
      </div>
    </div>
  );
}

export function OverflowHint() {
  return <MoreVertical className="size-4" />;
}
