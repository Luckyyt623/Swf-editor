import { ByteWriter } from "./binary";
import { compressSwf } from "./compress";
import { TAG } from "./tags";
import type { CompressionKind, SwfProject, SwfTag } from "./types";
import { getTagBytes } from "./parser";
import { writeAbc } from "../abc/writer";

export function serializeUncompressed(project: SwfProject): Uint8Array {
  const header = project.header;
  const w = new ByteWriter();
  w.ui8(0x46);
  w.ui8(0x57);
  w.ui8(0x53);
  w.ui8(header.version);
  w.ui32(0); 
  w.rect(header.frameSize);
  w.ui16(Math.round(header.frameRate * 256));
  w.ui16(header.frameCount);

  const tags = [...project.tags];
  if (tags.length === 0 || tags[tags.length - 1]!.code !== TAG.End) {
    tags.push({
      id: -1,
      index: tags.length,
      code: TAG.End,
      name: "End",
      offset: 0,
      length: 0,
      longHeader: false,
      headerOffset: 0,
      data: new Uint8Array(0),
    });
  }

  for (const tag of tags) {
    writeTag(w, project, tag);
  }

  const bytes = w.toBytes();
  const len = bytes.length;
  bytes[4] = len & 0xff;
  bytes[5] = (len >> 8) & 0xff;
  bytes[6] = (len >> 16) & 0xff;
  bytes[7] = (len >> 24) & 0xff;
  return bytes;
}

function writeTag(w: ByteWriter, project: SwfProject, tag: SwfTag) {
  const data = getTagBytes(project.body, tag);
  const code = tag.code;
  const length = data.length;
  if (length >= 63 || tag.longHeader) {
    w.ui16((code << 6) | 0x3f);
    w.ui32(length);
  } else {
    w.ui16((code << 6) | (length & 0x3f));
  }
  w.bytes(data);
}

export function rebuildSwf(project: SwfProject, compression?: CompressionKind): Uint8Array {
  const uncompressed = serializeUncompressed(project);
  const kind = compression ?? project.header.compression;
  
  const outKind: CompressionKind = kind === "lzma" ? "zlib" : kind;
  return compressSwf(uncompressed, outKind);
}

export function setTagData(project: SwfProject, index: number, data: Uint8Array) {
  const tag = project.tags[index];
  if (!tag) throw new Error("No such tag");
  tag.data = data.slice();
  tag.length = data.length;
  if (data.length >= 2 && tag.characterId != null) {
    tag.characterId = data[0]! | (data[1]! << 8);
  }
  project.dirty = true;
}

export function deleteTag(project: SwfProject, index: number) {
  const tag = project.tags[index];
  if (!tag) throw new Error("No such tag");
  if (tag.code === TAG.End) throw new Error("Cannot delete the End tag");
  if (tag.code === TAG.FileAttributes) throw new Error("Cannot delete FileAttributes");
  project.tags.splice(index, 1);
  reindex(project);
  project.dirty = true;
}

export function duplicateTag(project: SwfProject, index: number) {
  const tag = project.tags[index];
  if (!tag) throw new Error("No such tag");
  if (tag.code === TAG.End) throw new Error("Cannot duplicate the End tag");
  const data = getTagBytes(project.body, tag).slice();
  const copy: SwfTag = {
    ...tag,
    id: project.nextTagId++,
    data,
    length: data.length,
    label: tag.label ? `${tag.label}_copy` : tag.label,
  };
  const insertAt = Math.min(index + 1, project.tags.length - 1);
  project.tags.splice(insertAt, 0, copy);
  reindex(project);
  project.dirty = true;
}

export function moveTag(project: SwfProject, from: number, to: number) {
  if (from === to) return;
  const tag = project.tags[from];
  if (!tag) throw new Error("No such tag");
  if (tag.code === TAG.End) throw new Error("Cannot move the End tag");
  const last = project.tags.length - 1;
  const dest = Math.max(0, Math.min(to, last - (project.tags[last]?.code === TAG.End ? 1 : 0)));
  project.tags.splice(from, 1);
  project.tags.splice(dest, 0, tag);
  reindex(project);
  project.dirty = true;
}

function reindex(project: SwfProject) {
  project.tags.forEach((t, i) => {
    t.index = i;
  });
  
  
  
  
  const byId = new Map(project.tags.map((t) => [t.id, t]));
  project.abcBlocks = project.abcBlocks.filter((block) => {
    const tag = byId.get(block.tagId);
    if (!tag) return false;
    block.tagIndex = tag.index;
    return true;
  });
}

export function replaceAbcBlock(project: SwfProject, blockIndex: number, abcBytes: Uint8Array) {
  const block = project.abcBlocks[blockIndex];
  if (!block) throw new Error("No such ABC block");
  const tag = project.tags[block.tagIndex];
  if (!tag) throw new Error("ABC tag missing");
  const w = new ByteWriter();
  if (tag.code === TAG.DoABC) {
    w.ui32(block.flags);
    w.swfString(block.name);
  }
  w.bytes(abcBytes);
  setTagData(project, tag.index, w.toBytes());
  block.raw = abcBytes;
}

export function rebuildAbcAndReplace(project: SwfProject, blockIndex: number) {
  const block = project.abcBlocks[blockIndex];
  if (!block) throw new Error("No such ABC block");
  const bytes = writeAbc(block.abc);
  replaceAbcBlock(project, blockIndex, bytes);
}
