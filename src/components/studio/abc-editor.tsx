import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useStudio } from "@/store/studio";
import { decompileClass, decompileMethod } from "@/lib/abc/decompile";
import { disassemble } from "@/lib/abc/disasm";
import { findBody, simpleTypeName } from "@/lib/abc/parser";
import { patchAbcString, patchMethodBody } from "@/lib/abc/writer";
import { replaceAbcBlock } from "@/lib/swf/writer";
import { cn } from "@/lib/utils";

type Tab = "as" | "disasm" | "pool";

export function AbcEditor({ block, instance, method }: { block: number; instance?: number; method?: number }) {
  const project = useStudio((s) => s.project)!;
  const abcBlock = project.abcBlocks[block];
  const [tab, setTab] = useState<Tab>("as");
  const [query, setQuery] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");
  const [hexEdit, setHexEdit] = useState("");

  if (!abcBlock) return <p className="text-sm text-muted">ABC block missing.</p>;
  const abc = abcBlock.abc;
  const inst = instance != null ? abc.instances[instance] : abc.instances[0];
  const methodObj = method != null ? abc.methods[method] : undefined;

  const asText = useMemo(() => {
    if (methodObj) {
      return decompileMethod(abc, methodObj.index, methodObj.name || `method${methodObj.index}`, false, "");
    }
    if (inst) return decompileClass(abc, inst);
    return "
  }, [abc, inst, methodObj]);

  const body = methodObj ? findBody(abc, methodObj.index) : inst ? findBody(abc, inst.iinit) : undefined;
  const disasm = useMemo(() => (body ? disassemble(abc, body.code) : []), [abc, body]);

  const filter = query.trim().toLowerCase();
  const asFiltered = filter ? asText.split("\n").filter((l) => l.toLowerCase().includes(filter)).join("\n") : asText;
  const disFiltered = filter ? disasm.filter((l) => l.text.toLowerCase().includes(filter)) : disasm;
  const strings = abc.pool.strings
    .map((s, i) => ({ i, s }))
    .filter((x) => x.i > 0 && (!filter || x.s.toLowerCase().includes(filter)));

  const saveString = () => {
    if (editIdx == null) return;
    try {
      const bytes = patchAbcString(abc, editIdx, editVal);
      replaceAbcBlock(project, block, bytes);
      abcBlock.raw = bytes;
      useStudio.setState({ project: { ...project }, toast: `Constant pool string [${editIdx}] updated` });
      setEditIdx(null);
    } catch (e) {
      useStudio.getState().setToast(e instanceof Error ? e.message : String(e));
    }
  };

  const saveBodyHex = () => {
    if (!methodObj) {
      useStudio.getState().setToast("Select a method to patch bytecode");
      return;
    }
    const hex = hexEdit.replace(/[^0-9a-fA-F]/g, "");
    if (hex.length % 2 !== 0) {
      useStudio.getState().setToast("Hex length must be even");
      return;
    }
    const code = new Uint8Array(hex.length / 2);
    for (let i = 0; i < code.length; i++) code[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    try {
      const bytes = patchMethodBody(abc, methodObj.index, code);
      replaceAbcBlock(project, block, bytes);
      abcBlock.raw = bytes;
      useStudio.setState({ project: { ...project }, toast: "Method body replaced" });
    } catch (e) {
      useStudio.getState().setToast(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {(["as", "disasm", "pool"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium",
              tab === t ? "bg-surface-3 text-foreground" : "text-muted hover:bg-surface-2",
            )}
          >
            {t === "as" ? "ActionScript" : t === "disasm" ? "Bytecode" : "Constant pool"}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search in this view"
        className="h-10 w-full rounded-md border border-border bg-surface-2 px-3 font-mono text-xs text-foreground placeholder:text-subtle"
      />

      {inst && (
        <p className="font-mono text-[11px] text-muted">
          {inst.package ? inst.package + "." : ""}
          {inst.className}
          {inst.superName ? ` extends ${simpleTypeName(inst.superName)}` : ""} · {abc.methods.length} methods ·{" "}
          {abc.pool.strings.length - 1} strings
        </p>
      )}

      {tab === "as" && (
        <div className="space-y-2">
          <div className="rounded-lg border border-tint/25 bg-tint/5 p-3 text-xs text-muted">
            <div className="font-medium text-foreground">How to edit executable code</div>
            <p className="mt-1">This ActionScript view is a decompiled/read-only reconstruction. For real SWF changes, open a method in the tree, switch to <b>Bytecode</b>, edit its hex bytes, then tap <b>Write bytecode</b>. For text, names and messages, use <b>Constant pool</b> and tap a string to edit it.</p>
          </div>
          <pre className="max-h-[65vh] overflow-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] leading-5 text-foreground">
            {asFiltered || "// no match"}
          </pre>
        </div>
      )}

      {tab === "disasm" && (
        <div className="space-y-2">
          <pre className="overflow-x-auto rounded-lg border border-border bg-surface-2 p-3 font-mono text-[11px] leading-5">
            {disFiltered.map((l) => l.text).join("\n") || "// no body"}
          </pre>
          {methodObj && body && (
            <div className="space-y-2">
              <label className="text-xs text-muted">Edit executable method body (hex). Length may change; ABC is rewritten.</label>
              <textarea
                className="h-24 w-full rounded-md border border-border bg-surface-2 p-2 font-mono text-[11px]"
                value={hexEdit || bytesToHex(body.code)}
                onChange={(e) => setHexEdit(e.target.value)}
              />
              <Button size="sm" variant="secondary" onClick={saveBodyHex}>
                Write bytecode
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === "pool" && (
        <div className="space-y-2">
          <ul className="max-h-80 overflow-y-auto rounded-lg border border-border scrollbar-thin">
            {strings.map(({ i, s }) => (
              <li key={i} className="flex items-center gap-2 border-b border-border px-2 py-1.5 font-mono text-[11px]">
                <span className="w-8 text-subtle">{i}</span>
                {editIdx === i ? (
                  <>
                    <input
                      className="h-8 flex-1 rounded-sm border border-border bg-bg px-2"
                      value={editVal}
                      onChange={(e) => setEditVal(e.target.value)}
                    />
                    <Button size="sm" onClick={saveString}>
                      Save
                    </Button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="flex-1 truncate text-left"
                    onClick={() => {
                      setEditIdx(i);
                      setEditVal(s);
                    }}
                  >
                    {JSON.stringify(s)}
                  </button>
                )}
              </li>
            ))}
          </ul>
          <p className="text-xs text-subtle">Tap a string to edit. Saving rewrites the DoABC tag.</p>
        </div>
      )}
    </div>
  );
}

function bytesToHex(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += b[i]!.toString(16).padStart(2, "0") + (i % 16 === 15 ? "\n" : " ");
  return s.trim();
}
