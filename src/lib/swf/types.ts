import type { Rect } from "./binary";
import type { AbcFile } from "../abc/types";

export type CompressionKind = "none" | "zlib" | "lzma";

export interface SwfHeader {
  signature: string;
  compression: CompressionKind;
  version: number;
  fileLength: number;
  compressedSize: number;
  frameSize: Rect;
  frameWidth: number;
  frameHeight: number;
  frameRate: number;
  frameCount: number;
  asVersion: 1 | 2 | 3;
}

export interface SwfTag {
  
  id: number;
  index: number;
  code: number;
  name: string;
  
  offset: number;
  
  length: number;
  longHeader: boolean;
  
  headerOffset: number;
  characterId?: number;
  
  data?: Uint8Array;
  label?: string;
}

export interface SymbolBinding {
  characterId: number;
  name: string;
  tagIndex: number;
}

export interface AbcBlock {
  
  tagId: number;
  tagIndex: number;
  flags: number;
  name: string;
  abc: AbcFile;
  
  raw: Uint8Array;
}

export interface SwfProject {
  fileName: string;
  
  originalBytes: Uint8Array;
  
  body: Uint8Array;
  header: SwfHeader;
  tags: SwfTag[];
  
  nextTagId: number;
  abcBlocks: AbcBlock[];
  symbols: SymbolBinding[];
  exports: SymbolBinding[];
  jpegTables?: Uint8Array;
  dirty: boolean;
  backupName: string;
}

export type ProgressFn = (info: { phase: string; percent: number; message: string }) => void;

export interface ValidationCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ValidationResult {
  ok: boolean;
  checks: ValidationCheck[];
}

export type Selection =
  | { kind: "root" }
  | { kind: "header" }
  | { kind: "hex" }
  | { kind: "tag"; index: number }
  | { kind: "abc"; block: number }
  | { kind: "class"; block: number; instance: number }
  | { kind: "method"; block: number; method: number }
  | { kind: "group"; group: ExplorerGroup };

export type ExplorerGroup =
  | "tags"
  | "images"
  | "shapes"
  | "sprites"
  | "fonts"
  | "sounds"
  | "text"
  | "actionscript"
  | "binary";
