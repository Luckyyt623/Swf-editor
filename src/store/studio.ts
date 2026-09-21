import { create } from "zustand";
import type { Selection, SwfProject, ValidationResult } from "@/lib/swf/types";
import { parseSwf } from "@/lib/swf/parser";
import { rebuildSwf, setTagData, deleteTag, duplicateTag, moveTag, rebuildAbcAndReplace } from "@/lib/swf/writer";
import { validateProject } from "@/lib/swf/validate";
import { buildDemoSwf, demoSwfFileName } from "@/lib/swf/demo";
import { downloadBytes } from "@/lib/utils";
import { modifiedFileName } from "@/lib/swf/parser";
import { searchProject, type SearchHit } from "@/lib/swf/search";
import { buildDecompiledBundle, decompiledBundleFileName } from "@/lib/swf/export-decompiled";
import { saveSession, loadSession, clearSession, peekSession, storageAvailable } from "@/lib/storage";

interface StudioState {
  status: "empty" | "parsing" | "ready" | "error";
  error?: string;
  progress: { phase: string; percent: number; message: string };
  project: SwfProject | null;
  selection: Selection;
  searchOpen: boolean;
  settingsOpen: boolean;
  validation: ValidationResult | null;
  searchQuery: string;
  searchHits: SearchHit[];
  autoBackup: boolean;
  backupSaved: boolean;
  hexEdit: boolean;
  bytesPerRow: number;
  preserveDimensions: boolean;
  preserveTransparency: boolean;
  lastRebuilt: Uint8Array | null;
  toast: string | null;
  storedSession: { fileName: string; savedAt: number } | null;
  bundleBusy: boolean;
  storageBusy: boolean;
  openBytes: (bytes: Uint8Array, fileName: string) => Promise<void>;
  openDemo: () => Promise<void>;
  select: (s: Selection) => void;
  setSearchOpen: (v: boolean) => void;
  setSettingsOpen: (v: boolean) => void;
  runSearch: (q: string) => void;
  save: (asNew?: boolean) => void;
  validate: () => ValidationResult | null;
  mutateTagData: (index: number, data: Uint8Array) => void;
  removeTag: (index: number) => void;
  dupTag: (index: number) => void;
  shiftTag: (index: number, dir: -1 | 1) => void;
  patchAbc: (block: number) => void;
  setToast: (msg: string | null) => void;
  setFlag: (k: "autoBackup" | "hexEdit" | "preserveDimensions" | "preserveTransparency", v: boolean) => void;
  downloadDecompiledBundle: () => Promise<void>;
  refreshStoredSession: () => Promise<void>;
  saveToStorage: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  clearStorage: () => Promise<void>;
}

function persistSettings(s: Partial<StudioState>) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      "swf-studio-settings",
      JSON.stringify({
        autoBackup: s.autoBackup,
        hexEdit: s.hexEdit,
        bytesPerRow: s.bytesPerRow,
        preserveDimensions: s.preserveDimensions,
        preserveTransparency: s.preserveTransparency,
      }),
    );
  } catch {
    
  }
}

function loadSettings(): Partial<StudioState> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem("swf-studio-settings");
    if (!raw) return {};
    return JSON.parse(raw) as Partial<StudioState>;
  } catch {
    return {};
  }
}

export const useStudio = create<StudioState>((set, get) => ({
  status: "empty",
  progress: { phase: "idle", percent: 0, message: "" },
  project: null,
  selection: { kind: "root" },
  searchOpen: false,
  settingsOpen: false,
  validation: null,
  searchQuery: "",
  searchHits: [],
  autoBackup: true,
  backupSaved: false,
  hexEdit: false,
  bytesPerRow: 16,
  preserveDimensions: true,
  preserveTransparency: true,
  lastRebuilt: null,
  toast: null,
  storedSession: null,
  bundleBusy: false,
  storageBusy: false,
  ...loadSettings(),

  setToast: (msg) => set({ toast: msg }),
  setFlag: (k, v) => {
    set({ [k]: v } as Partial<StudioState>);
    persistSettings({ ...get(), [k]: v });
  },
  select: (s) => set({ selection: s }),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setSettingsOpen: (v) => set({ settingsOpen: v }),
  runSearch: (q) => {
    const project = get().project;
    set({ searchQuery: q, searchHits: project ? searchProject(project, q) : [] });
  },

  openBytes: async (bytes, fileName) => {
    set({
      status: "parsing",
      error: undefined,
      progress: { phase: "read", percent: 2, message: "Opening file" },
      backupSaved: false,
      lastRebuilt: null,
      validation: null,
    });
    try {
      
      await new Promise((r) => setTimeout(r, 30));
      const project = parseSwf(bytes, fileName, (p) => set({ progress: p }));
      set({
        status: "ready",
        project,
        selection: { kind: "root" },
        progress: { phase: "done", percent: 100, message: "Ready" },
        toast: `Opened ${fileName} · ${project.tags.length} tags`,
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        toast: "Failed to parse SWF",
      });
    }
  },

  openDemo: async () => {
    const bytes = buildDemoSwf();
    await get().openBytes(bytes, demoSwfFileName());
  },

  mutateTagData: (index, data) => {
    const project = get().project;
    if (!project) return;
    setTagData(project, index, data);
    set({ project: { ...project }, toast: `Tag #${index} updated` });
  },

  removeTag: (index) => {
    const project = get().project;
    if (!project) return;
    try {
      deleteTag(project, index);
      set({ project: { ...project }, selection: { kind: "root" }, toast: "Tag deleted" });
    } catch (err) {
      set({ toast: err instanceof Error ? err.message : String(err) });
    }
  },

  dupTag: (index) => {
    const project = get().project;
    if (!project) return;
    try {
      duplicateTag(project, index);
      set({ project: { ...project }, toast: "Tag duplicated" });
    } catch (err) {
      set({ toast: err instanceof Error ? err.message : String(err) });
    }
  },

  shiftTag: (index, dir) => {
    const project = get().project;
    if (!project) return;
    try {
      moveTag(project, index, index + dir);
      set({ project: { ...project }, selection: { kind: "tag", index: index + dir } });
    } catch (err) {
      set({ toast: err instanceof Error ? err.message : String(err) });
    }
  },

  patchAbc: (block) => {
    const project = get().project;
    if (!project) return;
    try {
      rebuildAbcAndReplace(project, block);
      set({ project: { ...project }, toast: "ABC reassembled into SWF" });
    } catch (err) {
      set({ toast: err instanceof Error ? err.message : String(err) });
    }
  },

  validate: () => {
    const project = get().project;
    if (!project) return null;
    try {
      const rebuilt = rebuildSwf(project);
      const result = validateProject(project, rebuilt);
      set({ validation: result, lastRebuilt: result.ok ? rebuilt : null });
      return result;
    } catch (err) {
      const result: ValidationResult = {
        ok: false,
        checks: [
          {
            id: "rebuild",
            label: "Rebuild",
            ok: false,
            detail: err instanceof Error ? err.message : String(err),
          },
        ],
      };
      set({ validation: result, lastRebuilt: null });
      return result;
    }
  },

  save: (asNew = false) => {
    const project = get().project;
    if (!project) return;
    const result = get().validate();
    if (!result?.ok || !get().lastRebuilt) {
      set({ toast: "Validation failed — original file was not overwritten" });
      return;
    }
    const rebuilt = get().lastRebuilt!;
    if (get().autoBackup && !get().backupSaved) {
      downloadBytes(project.originalBytes, project.backupName, "application/x-shockwave-flash");
      set({ backupSaved: true });
    }
    const name = asNew ? modifiedFileName(project.fileName) : project.fileName.replace(/\.swf$/i, "") + (asNew ? "" : "") + (asNew ? "" : ".swf");
    const outName = asNew ? modifiedFileName(project.fileName) : project.fileName.endsWith(".swf") ? project.fileName : project.fileName + ".swf";
    downloadBytes(rebuilt, asNew ? outName : project.fileName, "application/x-shockwave-flash");
    project.dirty = false;
    set({ project: { ...project }, toast: `Saved ${asNew ? outName : name}` });
  },

  
  
  downloadDecompiledBundle: async () => {
    const project = get().project;
    if (!project || get().bundleBusy) return;
    set({ bundleBusy: true, toast: "Building decompiled export…" });
    try {
      const zip = await buildDecompiledBundle(project);
      downloadBytes(zip, decompiledBundleFileName(project.fileName), "application/zip");
      set({ toast: "Decompiled bundle downloaded" });
    } catch (err) {
      set({ toast: `Export failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ bundleBusy: false });
    }
  },

  refreshStoredSession: async () => {
    if (!storageAvailable()) return;
    try {
      const meta = await peekSession();
      set({ storedSession: meta });
    } catch {
      
    }
  },

  
  
  
  saveToStorage: async () => {
    const project = get().project;
    if (!project) return;
    if (!storageAvailable()) {
      set({ toast: "Browser storage isn't available here" });
      return;
    }
    set({ storageBusy: true });
    try {
      const result = get().validate();
      const bytes = result?.ok && get().lastRebuilt ? get().lastRebuilt! : project.originalBytes;
      await saveSession(project.fileName, bytes);
      await get().refreshStoredSession();
      set({
        toast:
          result?.ok
            ? `Saved to browser storage (${project.fileName})`
            : `Saved original to browser storage — current edits don't validate yet`,
      });
    } catch (err) {
      set({ toast: `Save to storage failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      set({ storageBusy: false });
    }
  },

  loadFromStorage: async () => {
    if (!storageAvailable()) {
      set({ toast: "Browser storage isn't available here" });
      return;
    }
    try {
      const session = await loadSession();
      if (!session) {
        set({ toast: "No file saved in browser storage" });
        return;
      }
      await get().openBytes(session.bytes, session.fileName);
    } catch (err) {
      set({ toast: `Load failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  },

  clearStorage: async () => {
    if (!storageAvailable()) return;
    try {
      await clearSession();
      set({ storedSession: null, toast: "Cleared saved file" });
    } catch (err) {
      set({ toast: err instanceof Error ? err.message : String(err) });
    }
  },
}));
