# MDView

A standalone desktop viewer for Markdown files — opens `.md` files **directly in rendered view**, like a PDF reader.

Most editors (VS Code, Sublime, etc.) open `.md` files in **edit mode** by default and require a keyboard shortcut to toggle a preview pane. MDView skips all of that: double-click a `.md` file, see the rendered output. That's it.

## Features

- 📄 GitHub-flavored Markdown rendering (tables, task lists, fenced code, etc.)
- 🎨 Syntax-highlighted code blocks (powered by highlight.js)
- 🌗 Light and dark themes
- 🔍 Find-in-document (`⌘F`)
- 🪟 Drag-and-drop files onto the window
- ♻️ Auto-reloads when the file changes on disk (preserves scroll position)
- 🖨 Print or save as PDF (`⌘P`)
- 🔗 External links open in your default browser, relative links resolve from the file's folder
- 🛡 HTML output sanitized with DOMPurify

## Install

Pre-built installers will be published on the [Releases](https://github.com/masoomaxelerant/mdview/releases) page.

For now you can run it from source — see [Development](#development) below.

## Make MDView the default `.md` opener

On macOS:

1. Right-click any `.md` file in Finder → **Get Info**
2. Under **Open with**, pick **MDView**
3. Click **Change All…**

Every `.md` file now opens in MDView on double-click, exactly like a PDF.

## Keyboard shortcuts

| Shortcut | Action               |
| -------- | -------------------- |
| `⌘O`     | Open a file          |
| `⌘R`     | Reload current file  |
| `⌘F`     | Find in document     |
| `⌘P`     | Print / Save as PDF  |
| `⌘⇧T`    | Toggle light/dark    |
| `⌘+` / `⌘-` | Zoom in / out     |
| `⌘0`     | Reset zoom           |

## Development

Requirements: Node.js 18+ and npm.

```bash
git clone https://github.com/masoomaxelerant/mdview.git
cd mdview
npm install
npm start              # launch the app
npm start -- sample.md # launch with a file open
```

### Project layout

```
mdview/
├── main.js              # Electron main process (window, menus, file I/O)
├── preload.js           # IPC bridge to renderer
└── renderer/
    ├── index.html       # UI shell
    ├── styles.css       # GitHub-flavored theme (light & dark)
    └── renderer.js      # marked + DOMPurify + highlight.js pipeline
```

## Build a distributable

```bash
npm run build:mac      # macOS .dmg
npm run build:win      # Windows installer
npm run build:linux    # Linux AppImage
```

Output lands in `dist/`.

## License

MIT
