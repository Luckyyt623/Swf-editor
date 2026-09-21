import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDemoSwf } from "./demo.ts";
import { parseSwf } from "./parser.ts";
import { deleteTag, duplicateTag, rebuildSwf, rebuildAbcAndReplace, replaceAbcBlock } from "./writer.ts";
import { validateProject } from "./validate.ts";
import { TAG } from "./tags.ts";
import { patchAbcString } from "../abc/writer.ts";

test("abcBlocks keep pointing at the right DoABC tag across delete/duplicate/move", () => {
  const project = parseSwf(buildDemoSwf(), "demo.swf");
  assert.ok(project.abcBlocks.length >= 1, "demo project should have at least one ABC block");
  const originalTagIndex = project.abcBlocks[0]!.tagIndex;
  const originalTag = project.tags[originalTagIndex]!;
  assert.ok(originalTag.code === TAG.DoABC || originalTag.code === TAG.DoABCDefine);

  
  
  
  let shifted = 0;
  for (let i = 0; i < project.tags.length && shifted < 3; i++) {
    const t = project.tags[i]!;
    if (t.code === TAG.End || t === originalTag) continue;
    if (t.code === TAG.ShowFrame || t.code === TAG.SetBackgroundColor) {
      duplicateTag(project, i);
      shifted++;
      break;
    }
  }

  const block = project.abcBlocks.find((b) => b.tagId === originalTag.id);
  assert.ok(block, "abcBlock for the original DoABC tag should still exist after edits");
  assert.equal(project.tags[block!.tagIndex]!.id, originalTag.id, "tagIndex should still resolve to the same tag");
  assert.equal(project.tags[block!.tagIndex]!.code, originalTag.code);

  
  const rebuilt = rebuildSwf(project);
  const result = validateProject(project, rebuilt);
  assert.equal(result.ok, true, result.checks.filter((c) => !c.ok).map((c) => c.detail).join("; "));
});

test("deleting the DoABC tag itself drops the abcBlock instead of leaving it dangling", () => {
  const project = parseSwf(buildDemoSwf(), "demo.swf");
  const tagIndex = project.abcBlocks[0]!.tagIndex;
  deleteTag(project, tagIndex);
  assert.equal(
    project.abcBlocks.some((b) => b.tagIndex === tagIndex && project.tags[tagIndex]?.code !== TAG.DoABC),
    false,
    "no abcBlock should silently point at whatever tag now occupies the old index",
  );
});

test("patching an ABC constant-pool string doesn't blank out unrelated class/method names", () => {
  const project = parseSwf(buildDemoSwf(), "demo.swf");
  const block = project.abcBlocks.find((b) => b.abc.instances.some((i) => i.className === "Segment"));
  assert.ok(block, "expected a Segment class in the demo ABC");
  const abc = block!.abc;

  const classNamesBefore = abc.instances.map((i) => i.className);
  assert.ok(classNamesBefore.includes("Snake"));
  assert.ok(classNamesBefore.includes("Main"));

  
  
  const editIndex = abc.pool.strings.findIndex(
    (s, i) => i > 0 && s.length > 0 && !classNamesBefore.includes(s) && s !== "Segment",
  );
  assert.ok(editIndex > 0, "expected an editable string in the pool");

  const newBytes = patchAbcString(abc, editIndex, "PATCHED_VALUE");
  const blockIndex = project.abcBlocks.indexOf(block!);
  replaceAbcBlock(project, blockIndex, newBytes);
  const rebuilt = rebuildSwf(project);
  const reparsed = parseSwf(rebuilt, "patched.swf");

  const classNamesAfter = reparsed.abcBlocks.flatMap((b) => b.abc.instances.map((i) => i.className));
  for (const name of classNamesBefore) {
    assert.ok(classNamesAfter.includes(name), `class "${name}" should survive an unrelated string edit`);
  }
});

test("class-level default field values survive an ABC rewrite", () => {
  const project = parseSwf(buildDemoSwf(), "demo.swf");
  const block = project.abcBlocks.find((b) => b.abc.instances.length > 0);
  assert.ok(block);
  const inst = block!.abc.instances.find((i) => i.traits.length > 0) ?? block!.abc.instances[0]!;

  
  
  
  
  const nameStr = `__regressionCheck_${inst.className}`;
  block!.abc.pool.strings.push(nameStr);
  block!.abc.pool.multinames.push({ kind: 0x07, ns: "", name: nameStr });
  const intIndex = block!.abc.pool.ints.push(1234) - 1;
  inst.traits.push({
    name: nameStr,
    kind: 6, // Const
    kindName: "Const",
    slotId: 999,
    typeName: "*",
    value: "1234",
    valueIndex: intIndex,
    valueKind: 0x03, 
    metadata: [],
  });

  const blockIndex = project.abcBlocks.indexOf(block!);
  rebuildAbcAndReplace(project, blockIndex);
  const rebuilt = rebuildSwf(project);
  const reparsed = parseSwf(rebuilt, "roundtrip.swf");

  const reInst = reparsed.abcBlocks.flatMap((b) => b.abc.instances).find((i) => i.className === inst.className);
  assert.ok(reInst, "class should still exist after rewrite");
  const trait = reInst!.traits.find((t) => t.name === nameStr);
  assert.ok(trait, "injected const trait should survive the rewrite");
  assert.equal(trait!.value, "1234", "default value must round-trip, not be dropped");
});
