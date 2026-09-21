# SWF Studio

**Browser-based Flash SWF Decompiler & Editor**

Open source tool to inspect, decompile, edit and rebuild Adobe Flash (SWF) files — entirely in the browser. No installation required.

Inspired by [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler), rebuilt from scratch for the modern web.

---

## Features

- **SWF Parsing** — Supports uncompressed, zlib and LZMA compressed SWF files
- **Tag Explorer** — Browse all tags with character IDs, names and structure
- **ActionScript Support**
  - ABC (ActionScript 3) parsing
  - Disassembly (p-code)
  - Basic decompilation
  - Method & class inspection
- **Asset Viewers**
  - Shapes
  - Sprites / MovieClips
  - Images (JPEG, PNG, etc.)
- **Hex Editor** — Low-level tag data inspection and editing
- **SWF Rebuild** — Modify tags and export a new valid SWF
- **Player** — Preview SWF using Ruffle
- **Search** — Search across tags and scripts
- **Validation** — Basic structural checks
- **Local Storage** — Auto-save session support

---

## Tech Stack

- **React 19** + TypeScript
- **Vite**
- **TanStack Router** + React Query
- **Zustand** (state management)
- **Tailwind CSS**
- Custom SWF & ABC binary parsers (written from scratch)

---

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm / pnpm / yarn

### Installation

```bash
git clone https://github.com/Luckyyt623/Swf-editor.git
cd swf-studio
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:8080](http://localhost:8080)

### Build

```bash
npm run build
```

---

## Usage

1. Click **Open** and select any `.swf` file
2. Browse the tag tree on the left
3. Inspect shapes, sprites, images and scripts
4. Edit tag data (hex) or ABC if needed
5. Save / Export the modified SWF

You can also try the built-in demo SWF from the UI.

---

## Project Structure

```
src/
├── components/studio/     # Main UI components
├── lib/
│   ├── swf/               # SWF binary parser, writer, shapes, sprites...
│   └── abc/               # ActionScript Bytecode parser & decompiler
├── store/                 # Zustand store
└── routes/                # App routes
```

---

## Limitations (Current)

- AS1 / AS2 support is limited
- Decompiler is basic (not as advanced as JPEXS yet)
- No full timeline editing
- Some complex tags are shown as raw data only
- Mobile UI is usable but not fully optimized

---

## Roadmap

- [ ] Better ActionScript 3 decompilation
- [ ] AS1/AS2 support
- [ ] Shape & morphshape visual editor
- [ ] Sound extraction & replacement
- [ ] Font viewing
- [ ] Improved mobile experience
- [ ] Export to FLA / XFL (experimental)
- [ ] P2P collaboration features

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

Please keep pull requests focused and describe the changes clearly.

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## Credits & Inspiration

- [JPEXS Free Flash Decompiler](https://github.com/jindrapetrik/jpexs-decompiler) — The legendary desktop tool that inspired this project
- [Ruffle](https://ruffle.rs/) — For SWF playback in the browser
- Adobe SWF File Format Specification

---

## Author

Built with ❤️ by [@Lucky~]

---

**Note:** This tool is intended for educational purposes, research, and recovering your own content. Please respect copyright laws.
