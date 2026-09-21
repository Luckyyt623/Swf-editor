import { ByteReader, type Matrix, type Rect } from "./binary";
import { TAG } from "./tags";
import { getTagBytes } from "./parser";
import type { SwfProject, SwfTag } from "./types";

export interface ShapePath {
  commands: Array<{ type: "M" | "L" | "Q" | "Z"; x?: number; y?: number; cx?: number; cy?: number }>;
  fill?: string;
  stroke?: string;
  strokeWidth: number;
}

export interface ParsedShape {
  characterId: number;
  bounds: Rect;
  paths: ShapePath[];
  fillCount: number;
  lineCount: number;
  tagCode: number;
}

interface FillStyle {
  color: string;
  bitmapId?: number;
}

interface LineStyle {
  width: number;
  color: string;
}

export function parseShapeTag(project: SwfProject, tag: SwfTag): ParsedShape {
  const data = getTagBytes(project.body, tag);
  const r = new ByteReader(data);
  const characterId = r.ui16();
  const bounds = r.rect();
  const withAlpha = tag.code === TAG.DefineShape3 || tag.code === TAG.DefineShape4;
  if (tag.code === TAG.DefineShape4) {
    r.rect(); 
    r.ui8(); 
  }
  const fills = readFillStyles(r, withAlpha, tag.code);
  const lines = readLineStyles(r, withAlpha, tag.code);
  let numFillBits = r.ub(4);
  let numLineBits = r.ub(4);

  const paths: ShapePath[] = [];
  let x = 0;
  let y = 0;
  let fill0 = 0;
  let fill1 = 0;
  let line = 0;
  let current: ShapePath = { commands: [], strokeWidth: 1 };

  const flush = () => {
    if (current.commands.length) {
      const f = fills[Math.max(fill0, fill1) - 1];
      const l = lines[line - 1];
      current.fill = f?.color;
      current.stroke = l?.color;
      current.strokeWidth = l ? l.width / 20 : 0;
      paths.push(current);
    }
    current = { commands: [], strokeWidth: 1 };
  };

  const move = (nx: number, ny: number) => {
    x = nx;
    y = ny;
    current.commands.push({ type: "M", x, y });
  };

  
  while (true) {
    const typeFlag = r.ub(1);
    if (typeFlag === 0) {
      const flags = r.ub(5);
      if (flags === 0) break;
      const stateNewStyles = (flags & 0x10) !== 0;
      const stateLineStyle = (flags & 0x08) !== 0;
      const stateFillStyle1 = (flags & 0x04) !== 0;
      const stateFillStyle0 = (flags & 0x02) !== 0;
      const stateMoveTo = (flags & 0x01) !== 0;
      if (stateMoveTo) {
        const n = r.ub(5);
        const mx = r.sb(n);
        const my = r.sb(n);
        flush();
        move(mx, my);
      }
      if (stateFillStyle0) fill0 = r.ub(numFillBits);
      if (stateFillStyle1) fill1 = r.ub(numFillBits);
      if (stateLineStyle) line = r.ub(numLineBits);
      if (stateNewStyles) {
        flush();
        fills.length = 0;
        lines.length = 0;
        fills.push(...readFillStyles(r, withAlpha, tag.code));
        lines.push(...readLineStyles(r, withAlpha, tag.code));
        numFillBits = r.ub(4);
        numLineBits = r.ub(4);
      }
    } else {
      const straight = r.ub(1);
      const nBits = r.ub(4) + 2;
      if (current.commands.length === 0) current.commands.push({ type: "M", x, y });
      if (straight) {
        const genLine = r.ub(1);
        let dx = 0;
        let dy = 0;
        if (genLine) {
          dx = r.sb(nBits);
          dy = r.sb(nBits);
        } else {
          const vert = r.ub(1);
          if (vert) dy = r.sb(nBits);
          else dx = r.sb(nBits);
        }
        x += dx;
        y += dy;
        current.commands.push({ type: "L", x, y });
      } else {
        const cdx = r.sb(nBits);
        const cdy = r.sb(nBits);
        const adx = r.sb(nBits);
        const ady = r.sb(nBits);
        const cx = x + cdx;
        const cy = y + cdy;
        x = cx + adx;
        y = cy + ady;
        current.commands.push({ type: "Q", cx, cy, x, y });
      }
    }
  }
  flush();

  return {
    characterId,
    bounds,
    paths,
    fillCount: fills.length,
    lineCount: lines.length,
    tagCode: tag.code,
  };
}

function readFillStyles(r: ByteReader, withAlpha: boolean, tagCode: number): FillStyle[] {
  let count = r.ui8();
  if (count === 0xff && (tagCode === TAG.DefineShape2 || tagCode === TAG.DefineShape3 || tagCode === TAG.DefineShape4)) {
    count = r.ui16();
  }
  const fills: FillStyle[] = [];
  for (let i = 0; i < count; i++) fills.push(readFillStyle(r, withAlpha));
  return fills;
}

function readFillStyle(r: ByteReader, withAlpha: boolean): FillStyle {
  const type = r.ui8();
  if (type === 0x00) {
    return { color: readColor(r, withAlpha) };
  }
  if (type === 0x10 || type === 0x12 || type === 0x13) {
    skipMatrix(r);
    const spread = r.ub(2);
    const interp = r.ub(2);
    void spread;
    void interp;
    const n = r.ub(4);
    for (let i = 0; i <= n; i++) {
      r.ui8();
      readColor(r, withAlpha);
    }
    if (type === 0x13) r.si16();
    return { color: "rgba(180,200,220,0.45)" };
  }
  if (type === 0x40 || type === 0x41 || type === 0x42 || type === 0x43) {
    const bitmapId = r.ui16();
    skipMatrix(r);
    return { color: "rgba(140,160,190,0.5)", bitmapId };
  }
  return { color: "#8899aa" };
}

function readLineStyles(r: ByteReader, withAlpha: boolean, tagCode: number): LineStyle[] {
  let count = r.ui8();
  if (count === 0xff && (tagCode === TAG.DefineShape2 || tagCode === TAG.DefineShape3 || tagCode === TAG.DefineShape4)) {
    count = r.ui16();
  }
  const lines: LineStyle[] = [];
  for (let i = 0; i < count; i++) {
    if (tagCode === TAG.DefineShape4) {
      const width = r.ui16();
      r.ui16(); 
      const color = readColor(r, true);
      
      lines.push({ width, color });
    } else {
      const width = r.ui16();
      const color = readColor(r, withAlpha);
      lines.push({ width, color });
    }
  }
  return lines;
}

function readColor(r: ByteReader, withAlpha: boolean): string {
  const red = r.ui8();
  const green = r.ui8();
  const blue = r.ui8();
  const alpha = withAlpha ? r.ui8() : 255;
  return `rgba(${red},${green},${blue},${(alpha / 255).toFixed(3)})`;
}

function skipMatrix(r: ByteReader) {
  r.matrix();
}

export function shapeToSvg(shape: ParsedShape): string {
  const b = shape.bounds;
  const w = Math.max(1, b.xMax - b.xMin);
  const h = Math.max(1, b.yMax - b.yMin);
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.xMin} ${b.yMin} ${w} ${h}" width="${w / 20}" height="${h / 20}">`,
  );
  for (const p of shape.paths) {
    const d = p.commands
      .map((c) => {
        if (c.type === "M") return `M ${c.x} ${c.y}`;
        if (c.type === "L") return `L ${c.x} ${c.y}`;
        if (c.type === "Q") return `Q ${c.cx} ${c.cy} ${c.x} ${c.y}`;
        return "Z";
      })
      .join(" ");
    const fill = p.fill ?? "none";
    const stroke = p.stroke ?? "none";
    const sw = p.strokeWidth || 0;
    parts.push(`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${sw * 20}"/>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

export function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ParsedShape,
  opts: { showFills: boolean; showStrokes: boolean; showBounds: boolean },
) {
  const b = shape.bounds;
  ctx.save();
  if (opts.showBounds) {
    ctx.strokeStyle = "rgba(197,204,214,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(b.xMin, b.yMin, b.xMax - b.xMin, b.yMax - b.yMin);
    ctx.setLineDash([]);
  }
  for (const p of shape.paths) {
    ctx.beginPath();
    for (const c of p.commands) {
      if (c.type === "M") ctx.moveTo(c.x ?? 0, c.y ?? 0);
      else if (c.type === "L") ctx.lineTo(c.x ?? 0, c.y ?? 0);
      else if (c.type === "Q") ctx.quadraticCurveTo(c.cx ?? 0, c.cy ?? 0, c.x ?? 0, c.y ?? 0);
      else ctx.closePath();
    }
    if (opts.showFills && p.fill) {
      ctx.fillStyle = p.fill;
      ctx.fill();
    }
    if (opts.showStrokes && p.stroke && p.strokeWidth > 0) {
      ctx.strokeStyle = p.stroke;
      ctx.lineWidth = p.strokeWidth * 20;
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function identityMatrix(): Matrix {
  return { scaleX: 1, scaleY: 1, rotateSkew0: 0, rotateSkew1: 0, translateX: 0, translateY: 0 };
}
