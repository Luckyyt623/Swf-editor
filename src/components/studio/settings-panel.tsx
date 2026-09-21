import type { RefObject } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";

export function SettingsPanel({ fileRef }: { fileRef: RefObject<HTMLInputElement | null> }) {
  const setSettingsOpen = useStudio((s) => s.setSettingsOpen);
  const autoBackup = useStudio((s) => s.autoBackup);
  const hexEdit = useStudio((s) => s.hexEdit);
  const preserveDimensions = useStudio((s) => s.preserveDimensions);
  const preserveTransparency = useStudio((s) => s.preserveTransparency);
  const setFlag = useStudio((s) => s.setFlag);
  const save = useStudio((s) => s.save);
  const openDemo = useStudio((s) => s.openDemo);
  const project = useStudio((s) => s.project);
  const storedSession = useStudio((s) => s.storedSession);
  const bundleBusy = useStudio((s) => s.bundleBusy);
  const storageBusy = useStudio((s) => s.storageBusy);
  const downloadDecompiledBundle = useStudio((s) => s.downloadDecompiledBundle);
  const saveToStorage = useStudio((s) => s.saveToStorage);
  const loadFromStorage = useStudio((s) => s.loadFromStorage);
  const clearStorage = useStudio((s) => s.clearStorage);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 md:items-center">
      <div className="w-full max-w-md rounded-t-xl border border-border bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:rounded-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Settings</h2>
          <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(false)} aria-label="Close">
            <X />
          </Button>
        </div>
        <ul className="space-y-3 text-sm">
          <Toggle
            label="Backup original on first save"
            checked={autoBackup}
            onChange={(v) => setFlag("autoBackup", v)}
          />
          <Toggle label="Safe hex editing" checked={hexEdit} onChange={(v) => setFlag("hexEdit", v)} />
          <Toggle
            label="Preserve image dimensions"
            checked={preserveDimensions}
            onChange={(v) => setFlag("preserveDimensions", v)}
          />
          <Toggle
            label="Preserve transparency"
            checked={preserveTransparency}
            onChange={(v) => setFlag("preserveTransparency", v)}
          />
        </ul>
        <div className="mt-5 flex flex-col gap-2">
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Open SWF
          </Button>
          <Button variant="secondary" onClick={() => void openDemo()}>
            Load demo SWF
          </Button>
          <Button variant="secondary" onClick={() => save(true)} disabled={!project}>
            Save as
          </Button>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-medium text-subtle uppercase tracking-wide">Decompiled export</h3>
          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              disabled={!project || bundleBusy}
              onClick={() => void downloadDecompiledBundle()}
            >
              {bundleBusy ? "Building…" : "Download decompiled bundle (.zip)"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-subtle">
            A zip with decompiled ActionScript, bytecode disassembly, and every extracted image/shape/binary/sound
            asset. Read-only — doesn't change the file you're editing.
          </p>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-medium text-subtle uppercase tracking-wide">Browser storage</h3>
          <div className="flex flex-col gap-2">
            <Button variant="secondary" disabled={!project || storageBusy} onClick={() => void saveToStorage()}>
              {storageBusy ? "Saving…" : "Save to browser storage"}
            </Button>
            <Button variant="secondary" disabled={!storedSession} onClick={() => void loadFromStorage()}>
              {storedSession ? `Load ${storedSession.fileName}` : "No file saved"}
            </Button>
            {storedSession && (
              <Button variant="ghost" onClick={() => void clearStorage()}>
                Clear saved file
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-subtle">
            Keeps a copy of your current file in this browser (IndexedDB) so it survives a reload. It stays on this
            device only — nothing is uploaded.
          </p>
        </div>

        <p className="mt-4 text-xs text-subtle">
          Files are parsed on-device. Save downloads the rebuilt SWF (and a backup copy when enabled). LZMA (ZWS)
          opens when possible; saves use zlib CWS.
        </p>
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-10 rounded-full ${checked ? "bg-tint" : "bg-surface-3"}`}
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-accent transition-transform ${checked ? "left-4" : "left-0.5"}`}
        />
      </button>
    </li>
  );
}
