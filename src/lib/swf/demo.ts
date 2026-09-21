import { AbcBuilder, ctorBody, cinitBody, simpleVoidBody, u30 } from "../abc/builder";
import { ByteWriter } from "./binary";
import { TAG } from "./tags";
import { encodeLossless2, encodePngAsJpeg2, rgbaToPng } from "./images";
import { compressSwf } from "./compress";

function tag(code: number, data: Uint8Array): Uint8Array {
  const w = new ByteWriter();
  if (data.length >= 63) {
    w.ui16((code << 6) | 0x3f);
    w.ui32(data.length);
  } else {
    w.ui16((code << 6) | data.length);
  }
  w.bytes(data);
  return w.toBytes();
}

function fileAttributes(): Uint8Array {
  const w = new ByteWriter();
  w.ui32(0x08 | 0x01);
  return tag(TAG.FileAttributes, w.toBytes());
}

function bg(color: number): Uint8Array {
  const w = new ByteWriter();
  w.rgb(color);
  return tag(TAG.SetBackgroundColor, w.toBytes());
}

function solidRectShape(id: number, x: number, y: number, w: number, h: number, color: number): Uint8Array {
  const tw = new ByteWriter();
  tw.ui16(id);
  tw.rect({ xMin: x, xMax: x + w, yMin: y, yMax: y + h });
  tw.ui8(1);
  tw.ui8(0x00);
  tw.ui8((color >> 16) & 0xff);
  tw.ui8((color >> 8) & 0xff);
  tw.ui8(color & 0xff);
  tw.ui8(255);
  tw.ui8(0);
  tw.ub(4, 1);
  tw.ub(4, 0);
  tw.ub(1, 0);
  tw.ub(5, 0x03);
  const nbits = 16;
  tw.ub(5, nbits);
  tw.sb(nbits, x);
  tw.sb(nbits, y);
  tw.ub(1, 1);
  const line = (dx: number, dy: number) => {
    tw.ub(1, 1);
    tw.ub(1, 1);
    tw.ub(4, 14);
    tw.ub(1, 1);
    tw.sb(16, dx);
    tw.sb(16, dy);
  };
  line(w, 0);
  line(0, h);
  line(-w, 0);
  line(0, -h);
  tw.ub(1, 0);
  tw.ub(5, 0);
  tw.align();
  return tag(TAG.DefineShape3, tw.toBytes());
}

function spriteWithShape(id: number, shapeId: number, frames: number): Uint8Array {
  const inner = new ByteWriter();
  inner.ui16(id);
  inner.ui16(frames);
  for (let f = 0; f < frames; f++) {
    const place = new ByteWriter();
    place.ui8(0x06);
    place.ui16(1);
    place.ui16(shapeId);
    place.ub(1, 0);
    place.ub(1, 0);
    place.ub(5, 14);
    place.sb(14, f * 40);
    place.sb(14, 0);
    place.align();
    const pd = place.toBytes();
    if (pd.length >= 63) {
      inner.ui16((TAG.PlaceObject2 << 6) | 0x3f);
      inner.ui32(pd.length);
    } else inner.ui16((TAG.PlaceObject2 << 6) | pd.length);
    inner.bytes(pd);
    inner.ui16(TAG.ShowFrame << 6);
  }
  inner.ui16(0);
  return tag(TAG.DefineSprite, inner.toBytes());
}

function checker(width: number, height: number, a: [number, number, number], b: [number, number, number]): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = ((x >> 3) + (y >> 3)) % 2 === 0;
      const c = on ? a : b;
      const i = (y * width + x) * 4;
      rgba[i] = c[0]!;
      rgba[i + 1] = c[1]!;
      rgba[i + 2] = c[2]!;
      rgba[i + 3] = 255;
    }
  }
  return rgba;
}

function snakeSheet(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const cx = width / 2;
      const cy = height / 2;
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const ring = Math.sin(d / 5 + x / 12);
      rgba[i] = 40 + Math.floor(80 * (0.5 + 0.5 * ring));
      rgba[i + 1] = 160 + Math.floor(60 * (0.5 + 0.5 * Math.cos(x / 9)));
      rgba[i + 2] = 90 + Math.floor(40 * (y / height));
      rgba[i + 3] = d < Math.min(width, height) / 2 - 2 ? 255 : 0;
    }
  }
  return rgba;
}

function buildAbc(): Uint8Array {
  const b = new AbcBuilder();
  b.internQName("", "Object");
  b.internQName("flash.display", "Sprite");
  b.internQName("flash.display", "BitmapData");
  const addChildQ = b.internQName("", "addChild");
  ["snake", "bitmap", "texture", "segmants", "lossless_sheet", "Segment", "Snake", "Main"].forEach((s) =>
    b.internString(s),
  );

  const cinit = b.addMethod({
    name: "cinit",
    params: [],
    returnType: "void",
    code: cinitBody(),
    maxStack: 1,
    localCount: 1,
    maxScope: 2,
  });

  const mainCtor = b.addMethod({
    name: "Main",
    params: [],
    returnType: "void",
    code: ctorBody(),
    maxStack: 2,
    localCount: 1,
    maxScope: 2,
  });

  const mainInit = b.addMethod({
    name: "init",
    params: [],
    returnType: "void",
    code: simpleVoidBody([0xd0, 0x5d, ...u30(addChildQ), 0x4f, ...u30(addChildQ), ...u30(0)]),
    maxStack: 4,
    localCount: 1,
    maxScope: 2,
  });

  const segCtor = b.addMethod({
    name: "Segment",
    params: [
      { name: "id", type: "int" },
      { name: "texture", type: "flash.display.BitmapData" },
    ],
    returnType: "void",
    code: ctorBody(),
    maxStack: 3,
    localCount: 3,
    maxScope: 2,
  });

  const segRender = b.addMethod({
    name: "render",
    params: [],
    returnType: "void",
    code: simpleVoidBody([
      0xd0,
      0x66,
      ...u30(b.internQName("", "texture")),
      0x2c,
      ...u30(b.internString("draw")),
      0x29,
    ]),
    maxStack: 3,
    localCount: 1,
    maxScope: 2,
  });

  const segUpdate = b.addMethod({
    name: "update",
    params: [{ name: "dt", type: "Number" }],
    returnType: "void",
    code: simpleVoidBody([0xd1, 0x29]),
    maxStack: 2,
    localCount: 2,
    maxScope: 2,
  });

  const snakeCtor = b.addMethod({
    name: "Snake",
    params: [],
    returnType: "void",
    code: ctorBody(),
    maxStack: 2,
    localCount: 1,
    maxScope: 2,
  });

  const snakeDraw = b.addMethod({
    name: "draw",
    params: [],
    returnType: "void",
    code: simpleVoidBody([
      0xd0,
      0x5d,
      ...u30(b.internQName("", "render")),
      0x4f,
      ...u30(b.internQName("", "render")),
      ...u30(0),
    ]),
    maxStack: 4,
    localCount: 1,
    maxScope: 2,
  });

  const atlasCtor = b.addMethod({
    name: "BitmapAtlas",
    params: [],
    returnType: "void",
    code: ctorBody(),
    maxStack: 2,
    localCount: 1,
    maxScope: 2,
  });

  b.addClass({
    pkg: "",
    name: "Main",
    superName: "flash.display.Sprite",
    iinit: mainCtor,
    cinit,
    instanceTraits: [{ name: "init", kind: "method", method: mainInit }],
    staticTraits: [],
  });
  b.addClass({
    pkg: "",
    name: "Segment",
    superName: "Object",
    iinit: segCtor,
    cinit,
    instanceTraits: [
      { name: "texture", kind: "slot", type: "flash.display.BitmapData" },
      { name: "render", kind: "method", method: segRender },
      { name: "update", kind: "method", method: segUpdate },
    ],
    staticTraits: [],
  });
  b.addClass({
    pkg: "",
    name: "Snake",
    superName: "Object",
    iinit: snakeCtor,
    cinit,
    instanceTraits: [{ name: "draw", kind: "method", method: snakeDraw }],
    staticTraits: [],
  });
  b.addClass({
    pkg: "com.game",
    name: "BitmapAtlas",
    superName: "Object",
    iinit: atlasCtor,
    cinit,
    instanceTraits: [],
    staticTraits: [],
  });

  return b.toBytes();
}

function doAbc(abc: Uint8Array): Uint8Array {
  const w = new ByteWriter();
  w.ui32(1);
  w.swfString("frame1");
  w.bytes(abc);
  return tag(TAG.DoABC, w.toBytes());
}

function symbolClass(entries: { id: number; name: string }[]): Uint8Array {
  const w = new ByteWriter();
  w.ui16(entries.length);
  for (const e of entries) {
    w.ui16(e.id);
    w.swfString(e.name);
  }
  return tag(TAG.SymbolClass, w.toBytes());
}

function exportAssets(entries: { id: number; name: string }[]): Uint8Array {
  const w = new ByteWriter();
  w.ui16(entries.length);
  for (const e of entries) {
    w.ui16(e.id);
    w.swfString(e.name);
  }
  return tag(TAG.ExportAssets, w.toBytes());
}

function binaryData(id: number, payload: Uint8Array): Uint8Array {
  const w = new ByteWriter();
  w.ui16(id);
  w.ui32(0);
  w.bytes(payload);
  return tag(TAG.DefineBinaryData, w.toBytes());
}

function defineSoundSilence(id: number): Uint8Array {
  const samples = new Uint8Array(64);
  const w = new ByteWriter();
  w.ui16(id);
  const format = 3;
  const rate = 1;
  w.ui8((format << 4) | (rate << 2));
  w.ui32(64);
  w.bytes(samples);
  return tag(TAG.DefineSound, w.toBytes());
}

export function buildDemoSwf(): Uint8Array {
  const stageW = 550 * 20;
  const stageH = 400 * 20;
  const segs = snakeSheet(64, 64);
  const sheet = checker(128, 64, [32, 48, 64], [180, 200, 210]);
  const tex = checker(48, 48, [200, 90, 70], [40, 40, 50]);
  const png = rgbaToPng(48, 48, tex);
  const abc = buildAbc();

  const tags: Uint8Array[] = [];
  tags.push(fileAttributes());
  tags.push(bg(0x0a0c10));
  tags.push(tag(TAG.DefineBitsLossless2, encodeLossless2(1, 64, 64, segs)));
  tags.push(tag(TAG.DefineBitsLossless2, encodeLossless2(2, 128, 64, sheet)));
  tags.push(tag(TAG.DefineBitsJPEG2, encodePngAsJpeg2(3, png)));
  tags.push(solidRectShape(10, 0, 0, 400, 400, 0x2ee6a6));
  tags.push(solidRectShape(11, 0, 0, 800, 400, 0x6d8fad));
  tags.push(spriteWithShape(20, 10, 8));
  tags.push(defineSoundSilence(30));
  tags.push(binaryData(40, new TextEncoder().encode("SWF Studio demo payload: texture atlas metadata")));
  tags.push(doAbc(abc));
  tags.push(
    exportAssets([
      { id: 1, name: "segmants" },
      { id: 2, name: "lossless_sheet" },
      { id: 3, name: "texture" },
    ]),
  );
  tags.push(
    symbolClass([
      { id: 0, name: "Main" },
      { id: 20, name: "Snake" },
      { id: 1, name: "Segment" },
    ]),
  );
  const show = new ByteWriter();
  show.ui16(TAG.ShowFrame << 6);
  tags.push(show.toBytes());
  const end = new ByteWriter();
  end.ui16(0);
  tags.push(end.toBytes());

  const body = new ByteWriter();
  body.ui8(0x46);
  body.ui8(0x57);
  body.ui8(0x53);
  body.ui8(14);
  body.ui32(0);
  body.rect({ xMin: 0, xMax: stageW, yMin: 0, yMax: stageH });
  body.ui16(24 * 256);
  body.ui16(1);
  for (const t of tags) body.bytes(t);
  const uncompressed = body.toBytes();
  const len = uncompressed.length;
  uncompressed[4] = len & 0xff;
  uncompressed[5] = (len >> 8) & 0xff;
  uncompressed[6] = (len >> 16) & 0xff;
  uncompressed[7] = (len >> 24) & 0xff;

  return compressSwf(uncompressed, "zlib");
}

export function demoSwfFileName() {
  return "slither_android.swf";
}
