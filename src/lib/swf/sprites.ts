import { ByteReader, type Matrix } from "./binary";
import { TAG } from "./tags";
import { getTagBytes } from "./parser";
import type { SwfProject, SwfTag } from "./types";

export interface PlaceRecord {
  depth: number;
  characterId?: number;
  move: boolean;
  matrix?: Matrix;
  name?: string;
  clipDepth?: number;
  ratio?: number;
}

export interface SpriteFrame {
  index: number;
  places: PlaceRecord[];
  label?: string;
}

export interface ParsedSprite {
  characterId: number;
  frameCount: number;
  frames: SpriteFrame[];
  children: { characterId: number; name?: string }[];
  tagIndex: number;
}

export function parseSpriteTag(project: SwfProject, tag: SwfTag): ParsedSprite {
  const data = getTagBytes(project.body, tag);
  const r = new ByteReader(data);
  const characterId = r.ui16();
  const frameCount = r.ui16();
  const display = new Map<number, PlaceRecord>();
  const frames: SpriteFrame[] = [];
  const children = new Map<number, string | undefined>();
  let label: string | undefined;

  while (r.remaining >= 2) {
    const record = r.ui16();
    const code = record >> 6;
    let length = record & 0x3f;
    if (length === 0x3f) length = r.ui32();
    const start = r.pos;
    const payload = r.bytes(length);

    if (code === TAG.End) break;
    if (code === TAG.ShowFrame) {
      frames.push({
        index: frames.length,
        places: [...display.values()].map((p) => ({ ...p })),
        label,
      });
      label = undefined;
    } else if (code === TAG.PlaceObject2 || code === TAG.PlaceObject3) {
      const place = parsePlaceObject2(payload, code === TAG.PlaceObject3);
      if (place.move && display.has(place.depth)) {
        const prev = display.get(place.depth)!;
        display.set(place.depth, { ...prev, ...place, characterId: place.characterId ?? prev.characterId });
      } else {
        display.set(place.depth, place);
      }
      if (place.characterId != null) children.set(place.characterId, place.name);
    } else if (code === TAG.PlaceObject) {
      const pr = new ByteReader(payload);
      const characterIdP = pr.ui16();
      const depth = pr.ui16();
      const matrix = pr.matrix();
      display.set(depth, { depth, characterId: characterIdP, move: false, matrix });
      children.set(characterIdP, undefined);
    } else if (code === TAG.RemoveObject2) {
      const pr = new ByteReader(payload);
      const depth = pr.ui16();
      display.delete(depth);
    } else if (code === TAG.RemoveObject) {
      const pr = new ByteReader(payload);
      pr.ui16();
      display.delete(pr.ui16());
    } else if (code === TAG.FrameLabel) {
      try {
        label = new ByteReader(payload).swfString();
      } catch {
        
      }
    }
    r.seek(start + length);
  }

  if (frames.length === 0) {
    frames.push({ index: 0, places: [...display.values()], label });
  }

  return {
    characterId,
    frameCount: Math.max(frameCount, frames.length),
    frames,
    children: [...children.entries()].map(([id, name]) => ({ characterId: id, name })),
    tagIndex: tag.index,
  };
}

function parsePlaceObject2(data: Uint8Array, isV3: boolean): PlaceRecord {
  const r = new ByteReader(data);
  const flags = r.ui8();
  let flags2 = 0;
  if (isV3) flags2 = r.ui8();
  void flags2;
  const move = (flags & 0x01) !== 0;
  const hasCharacter = (flags & 0x02) !== 0;
  const hasMatrix = (flags & 0x04) !== 0;
  const hasColor = (flags & 0x08) !== 0;
  const hasRatio = (flags & 0x10) !== 0;
  const hasName = (flags & 0x20) !== 0;
  const hasClipDepth = (flags & 0x40) !== 0;
  const depth = r.ui16();
  const rec: PlaceRecord = { depth, move };
  if (hasCharacter) rec.characterId = r.ui16();
  if (hasMatrix) rec.matrix = r.matrix();
  if (hasColor) skipCxform(r);
  if (hasRatio) rec.ratio = r.ui16();
  if (hasName) rec.name = r.swfString();
  if (hasClipDepth) rec.clipDepth = r.ui16();
  return rec;
}

function skipCxform(r: ByteReader) {
  const hasAdd = r.ub(1);
  const hasMul = r.ub(1);
  const nbits = r.ub(4);
  if (hasMul) {
    r.sb(nbits);
    r.sb(nbits);
    r.sb(nbits);
    r.sb(nbits);
  }
  if (hasAdd) {
    r.sb(nbits);
    r.sb(nbits);
    r.sb(nbits);
    r.sb(nbits);
  }
  r.align();
}

export function parseFontMeta(project: SwfProject, tag: SwfTag): { id: number; name: string; glyphs: number } {
  const data = getTagBytes(project.body, tag);
  const r = new ByteReader(data);
  const id = r.ui16();
  if (tag.code === TAG.DefineFont) {
    return { id, name: `Font ${id}`, glyphs: Math.max(0, Math.floor(data.length / 2)) };
  }
  
  const flags = r.ui8();
  const shiftJis = (flags & 0x10) !== 0;
  void shiftJis;
  r.ui8(); 
  const nameLen = r.ui8();
  const nameBytes = r.bytes(nameLen);
  const name = new TextDecoder("utf-8", { fatal: false }).decode(nameBytes).replace(/\0/g, "");
  const glyphs = r.ui16();
  return { id, name: name || `Font ${id}`, glyphs };
}

export function parseSoundMeta(
  project: SwfProject,
  tag: SwfTag,
): {
  id: number;
  format: number;
  formatName: string;
  rate: number;
  bits: number;
  stereo: boolean;
  sampleCount: number;
  data: Uint8Array;
} {
  const data = getTagBytes(project.body, tag);
  const r = new ByteReader(data);
  const id = r.ui16();
  const b = r.ui8();
  const format = b >> 4;
  const rateCode = (b >> 2) & 3;
  const bits = (b >> 1) & 1 ? 16 : 8;
  const stereo = Boolean(b & 1);
  const sampleCount = r.ui32();
  const payload = r.rest().slice();
  const rates = [5512, 11025, 22050, 44100];
  const names = ["PCM-BE", "ADPCM", "MP3", "PCM-LE", "Nellymoser16", "Nellymoser8", "Nellymoser", "Speex"];
  return {
    id,
    format,
    formatName: names[format] ?? `fmt${format}`,
    rate: rates[rateCode] ?? 0,
    bits,
    stereo,
    sampleCount,
    data: payload,
  };
}

export const SOUND_FORMAT: Record<number, string> = {
  0: "PCM-BE",
  1: "ADPCM",
  2: "MP3",
  3: "PCM-LE",
  4: "Nellymoser 16 kHz",
  5: "Nellymoser 8 kHz",
  6: "Nellymoser",
  11: "Speex",
};
