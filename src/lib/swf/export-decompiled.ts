import { zipSync, strToU8 } from "fflate";
import type { SwfProject } from "./types";
import { TAG, IMAGE_TAGS, SHAPE_TAGS, SOUND_TAGS } from "./tags";
import { getTagBytes } from "./parser";
import { decodeImageForPreview, rgbaToPng } from "./images";
import { parseShapeTag, shapeToSvg } from "./shapes";
import { decompileClass } from "../abc/decompile";
import { disassemble } from "../abc/disasm";

function safeName(s: string, fallback: string): string {
  const cleaned = (s || "").replace(/[^a-zA-Z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
  return cleaned || fallback;
}

const README_TEXT = `SWF Studio — ordered decompiled export
==========================================

The archive is intentionally numbered to match the SWF Studio mobile explorer.
Android file managers often sort ZIP contents alphabetically, so numeric prefixes
keep the downloaded archive in the same visual order as the Studio tree.

00_Header/        SWF header information.
01_Tags/          Every SWF tag payload, in original tag order.
02_Images/        Decoded bitmap/image assets as PNG.
03_Shapes/        Shape assets as SVG.
04_Sprites/       Sprite/movie-clip tag payloads.
05_Fonts/         Font tag payloads.
06_Sounds/        Raw SWF sound payloads.
07_Text/          Text tag payloads.
08_ActionScript/  Decompiled AS3 plus bytecode disassembly.
09_Binary/        DefineBinaryData payloads.

The ActionScript is a best-effort reconstruction from AVM2 bytecode. It is useful
for reading and reverse-engineering, but it is not guaranteed to be recompilable
source. Executable code can be changed safely through the Studio bytecode editor
and constant-pool string editor.

A <name>.error.txt file means one asset could not be decoded; other files remain
available.
`

export interface DecompiledBundleProgress {
  phase: string;
  percent: number;
}

export async function buildDecompiledBundle(
  project: SwfProject,
  onProgress?: (p: DecompiledBundleProgress) => void,
): Promise<Uint8Array> {
  const files: Record<string, Uint8Array> = {};

  onProgress?.({ phase: "manifest", percent: 5 });
  const manifest = {
    fileName: project.fileName,
    header: project.header,
    tagCount: project.tags.length,
    tags: project.tags.map((t) => ({
      index: t.index,
      code: t.code,
      name: t.name,
      length: t.length,
      characterId: t.characterId,
      label: t.label,
    })),
    symbols: project.symbols,
    exports: project.exports,
    abcBlocks: project.abcBlocks.map((b) => ({
      tagIndex: b.tagIndex,
      name: b.name,
      classCount: b.abc.instances.length,
      classes: b.abc.instances.map((inst) => (inst.package ? `${inst.package}.${inst.className}` : inst.className)),
    })),
    generatedAt: new Date().toISOString(),
    generatedBy: "SWF Studio decompiled export",
  };
  files["00_Header/manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
  files["00_Header/README.txt"] = strToU8(README_TEXT);

  
  for (const tag of project.tags) {
    const order = String(tag.index + 1).padStart(4, "0");
    const label = safeName(tag.label ?? tag.name, tag.name);
    const bytes = getTagBytes(project.body, tag);
    files[`01_Tags/${order}_${label}_${tag.code}.bin`] = bytes;
  }

  
  onProgress?.({ phase: "scripts", percent: 20 });
  let classSeq = 0;
  const usedNames = new Set<string>();
  for (const block of project.abcBlocks) {
    const abc = block.abc;
    for (const inst of abc.instances) {
      classSeq++;
      const qualified = inst.package ? `${inst.package}.${inst.className}` : inst.className;
      let base = safeName(qualified, `Class${classSeq}`);
      if (usedNames.has(base)) base = `${base}_${classSeq}`;
      usedNames.add(base);

      try {
        files[`08_ActionScript/as/${base}.as`] = strToU8(decompileClass(abc, inst));
      } catch (err) {
        files[`08_ActionScript/as/${base}.as`] = strToU8(
          `// decompile failed for ${qualified}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      try {
        const methodIndexes = new Set<number>([inst.iinit]);
        for (const t of inst.traits) if (t.methodIndex != null) methodIndexes.add(t.methodIndex);
        const cls = abc.classes[inst.index];
        if (cls) {
          methodIndexes.add(cls.cinit);
          for (const t of cls.traits) if (t.methodIndex != null) methodIndexes.add(t.methodIndex);
        }
        const out: string[] = [`// ${qualified} — ${methodIndexes.size} method(s)`, ""];
        for (const mi of methodIndexes) {
          const m = abc.methods[mi];
          out.push(`// method #${mi} ${m?.name ?? "(constructor/anonymous)"}`);
          const body = abc.bodies.find((b) => b.method === mi);
          if (body) {
            for (const line of disassemble(abc, body.code)) out.push(line.text);
          } else {
            out.push("
          }
          out.push("");
        }
        files[`08_ActionScript/bytecode/${base}.disasm.txt`] = strToU8(out.join("\n"));
      } catch (err) {
        files[`08_ActionScript/bytecode/${base}.disasm.txt`] = strToU8(
          `// disassembly failed for ${qualified}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  
  onProgress?.({ phase: "images", percent: 50 });
  let imgSeq = 0;
  for (const tag of project.tags) {
    if (!IMAGE_TAGS.has(tag.code)) continue;
    imgSeq++;
    const label = safeName(tag.label ?? `id${tag.characterId ?? tag.index}`, `image${imgSeq}`);
    try {
      const decoded = await decodeImageForPreview(project, tag);
      files[`02_Images/${String(imgSeq).padStart(4, "0")}_${label}.png`] = rgbaToPng(decoded.width, decoded.height, decoded.rgba);
    } catch (err) {
      files[`02_Images/${String(imgSeq).padStart(4, "0")}_${label}.error.txt`] = strToU8(err instanceof Error ? err.message : String(err));
    }
  }

  
  onProgress?.({ phase: "shapes", percent: 70 });
  let shapeSeq = 0;
  for (const tag of project.tags) {
    if (!SHAPE_TAGS.has(tag.code)) continue;
    shapeSeq++;
    const label = safeName(tag.label ?? `id${tag.characterId ?? tag.index}`, `shape${shapeSeq}`);
    try {
      files[`03_Shapes/${String(shapeSeq).padStart(4, "0")}_${label}.svg`] = strToU8(shapeToSvg(parseShapeTag(project, tag)));
    } catch (err) {
      files[`03_Shapes/${String(shapeSeq).padStart(4, "0")}_${label}.error.txt`] = strToU8(err instanceof Error ? err.message : String(err));
    }
  }

  
  
  onProgress?.({ phase: "assets", percent: 85 });
  let spriteSeq = 0;
  let fontSeq = 0;
  let soundSeq = 0;
  let textSeq = 0;
  let binarySeq = 0;
  for (const tag of project.tags) {
    const order = String(tag.index + 1).padStart(4, "0");
    const label = safeName(tag.label ?? tag.name, tag.name);
    const bytes = getTagBytes(project.body, tag);
    if (tag.code === TAG.DefineBinaryData) {
      binarySeq++;
      
      files[`09_Binary/${String(binarySeq).padStart(4, "0")}_${label}.bin`] = bytes.subarray(6);
    } else if (SOUND_TAGS.has(tag.code)) {
      soundSeq++;
      files[`06_Sounds/${String(soundSeq).padStart(4, "0")}_${order}_${label}.raw`] = bytes;
    } else if (SHAPE_TAGS.has(tag.code) === false && tag.name.toLowerCase().includes("sprite")) {
      spriteSeq++;
      files[`04_Sprites/${String(spriteSeq).padStart(4, "0")}_${order}_${label}.bin`] = bytes;
    } else if (tag.name.toLowerCase().includes("font")) {
      fontSeq++;
      files[`05_Fonts/${String(fontSeq).padStart(4, "0")}_${order}_${label}.bin`] = bytes;
    } else if (tag.code === TAG.DefineEditText || tag.code === TAG.DefineText || tag.code === TAG.DefineText2) {
      textSeq++;
      files[`07_Text/${String(textSeq).padStart(4, "0")}_${order}_${label}.bin`] = bytes;
    }
  }

  onProgress?.({ phase: "zip", percent: 95 });
  const zipped = zipSync(files, { level: 6 });
  onProgress?.({ phase: "done", percent: 100 });
  return zipped;
}

export function decompiledBundleFileName(fileName: string): string {
  return fileName.replace(/\.swf$/i, "") + "_decompiled.zip";
}
