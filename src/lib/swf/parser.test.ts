import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDemoSwf } from "./demo.ts";
import { parseSwf } from "./parser.ts";
import { rebuildSwf } from "./writer.ts";
import { validateProject } from "./validate.ts";
import { IMAGE_TAGS } from "./tags.ts";
import { decodeImageTag } from "./images.ts";
import { searchProject } from "./search.ts";

test("demo SWF parses with real tags, images, and ABC classes", () => {
  const bytes = buildDemoSwf();
  assert.ok(bytes.length > 64);
  assert.equal(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!), "CWS");

  const project = parseSwf(bytes, "slither_android.swf");
  assert.equal(project.header.version, 14);
  assert.equal(project.header.compression, "zlib");
  assert.ok(project.header.frameWidth > 0);
  assert.ok(project.tags.length > 8);
  assert.equal(project.tags[project.tags.length - 1]!.code, 0);

  const images = project.tags.filter((t) => IMAGE_TAGS.has(t.code));
  assert.ok(images.length >= 3);
  const names = new Set(project.exports.map((e) => e.name));
  assert.ok(names.has("segmants"));
  assert.ok(names.has("lossless_sheet"));
  assert.ok(names.has("texture"));

  const decoded = decodeImageTag(project, images[0]!);
  assert.ok(decoded.width >= 8);
  assert.ok(decoded.height >= 8);
  assert.equal(decoded.rgba.length, decoded.width * decoded.height * 4);

  const classNames = project.abcBlocks.flatMap((b) => b.abc.instances.map((i) => i.className));
  assert.ok(classNames.includes("Main"));
  assert.ok(classNames.includes("Segment"));
  assert.ok(classNames.includes("Snake"));

  const hits = searchProject(project, "render");
  assert.ok(hits.length > 0);

  const rebuilt = rebuildSwf(project);
  const result = validateProject(project, rebuilt);
  assert.equal(result.ok, true, result.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.detail}`).join("; "));

  const round = parseSwf(rebuilt, "round.swf");
  assert.equal(round.tags.length, project.tags.length);
  assert.ok(round.abcBlocks.length >= 1);
  assert.ok(round.abcBlocks[0]!.abc.instances.some((i) => i.className === "Segment"));
});
