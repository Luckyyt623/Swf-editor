import { useEffect, useRef, useState } from "react";
import { Maximize2, Pause, Play, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { rebuildSwf } from "@/lib/swf/writer";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    RufflePlayer?: {
      newest: () => {
        createPlayer: () => RufflePlayerElement;
      };
    };
  }
}

interface RufflePlayerElement extends HTMLElement {
  load: (options: Record<string, unknown>) => Promise<void>;
  play: () => void;
  pause: () => void;
  reload: () => Promise<void>;
  setFullscreen?: (enabled: boolean) => void;
  requestFullscreen?: () => void;
}

let rufflePromise: Promise<void> | null = null;

function loadRuffle(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Ruffle requires a browser"));
  if (window.RufflePlayer) return Promise.resolve();
  if (rufflePromise) return rufflePromise;

  rufflePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-swf-studio-ruffle="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Could not load the Ruffle player")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://unpkg.com/@ruffle-rs/ruffle@0.6.0";
    script.async = true;
    script.dataset.swfStudioRuffle = "1";
    script.onload = () => (window.RufflePlayer ? resolve() : reject(new Error("Ruffle loaded without its player API")));
    script.onerror = () => reject(new Error("Could not load Ruffle. Internet access is required for the first load."));
    document.head.appendChild(script);
  });
  return rufflePromise;
}

export function SwfPlayer({ onClose }: { onClose: () => void }) {
  const project = useStudio((s) => s.project)!;
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<RufflePlayerElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let player: RufflePlayerElement | null = null;

    const start = async () => {
      try {
        setLoading(true);
        setError(null);
        const bytes = rebuildSwf(project);
        await loadRuffle();
        if (cancelled || !hostRef.current || !window.RufflePlayer) return;

        player = window.RufflePlayer.newest().createPlayer();
        player.style.width = "100%";
        player.style.height = "100%";
        player.style.display = "block";
        player.style.border = "0";
        hostRef.current.replaceChildren(player);
        playerRef.current = player;

        await player.load({
          data: bytes,
          autoplay: "on",
          allowFullscreen: true,
          scale: "showAll",
          letterbox: "fullscreen",
          preferredRenderer: "webgl",
          contextMenu: true,
          showSwfDownload: false,
          warnOnUnsupportedContent: true,
          upgradeToHttps: true,
        });
        if (!cancelled) setPlaying(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void start();
    return () => {
      cancelled = true;
      player?.remove();
      playerRef.current = null;
    };
  }, [project]);

  const togglePlay = () => {
    const player = playerRef.current;
    if (!player) return;
    if (playing) player.pause();
    else player.play();
    setPlaying((v) => !v);
  };

  const reload = async () => {
    try {
      setError(null);
      setLoading(true);
      await playerRef.current?.reload();
      setPlaying(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const fullscreen = () => {
    const player = playerRef.current;
    if (!player) return;
    if (player.requestFullscreen) player.requestFullscreen();
    else player.setFullscreen?.(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95 p-2 pt-[env(safe-area-inset-top)] md:p-4">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 pb-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">SWF Preview</div>
          <div className="truncate font-mono text-[10px] text-muted">{project.fileName} · {project.header.frameRate.toFixed(2)} FPS · {project.header.frameCount} frames</div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"} disabled={loading || Boolean(error)}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => void reload()} aria-label="Reload" disabled={loading || Boolean(error)}>
          <RotateCcw />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={fullscreen} aria-label="Fullscreen" disabled={loading || Boolean(error)}>
          <Maximize2 />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close preview">
          <X />
        </Button>
      </div>

      <div className="relative mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-hidden rounded-xl border border-white/10 bg-[#111] shadow-2xl">
        <div ref={hostRef} className="h-full w-full" />
        {(loading || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0b0b0b] p-6 text-center">
            <div className="max-w-md space-y-2">
              <div className={cn("text-sm", error ? "text-danger" : "text-muted")}>
                {error ?? "Starting SWF player…"}
              </div>
              {error && (
                <p className="text-xs text-subtle">
                  The preview uses Ruffle in the browser. The SWF itself stays local; Ruffle is loaded from the official web package.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
