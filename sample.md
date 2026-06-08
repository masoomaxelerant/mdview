# MDView Sample

Welcome to **MDView** — a dedicated viewer for Markdown files, like a PDF reader but for `.md`.

## Why this exists

Most editors (VS Code, Sublime, etc.) open `.md` files in **edit mode** by default. To view the rendered output you have to:

1. Open the file (edit mode)
2. Hit `⌘K V` (or similar) to toggle preview
3. Resize panes

MDView skips all that. Double-click a `.md` file → it opens already rendered.

## Features

- Renders standard GitHub-Flavored Markdown
- Syntax-highlighted code blocks
- Light & dark themes (`⌘⇧T`)
- Find in document (`⌘F`)
- Drag-and-drop files onto the window
- Auto-reloads when the file changes on disk
- Print or save as PDF (`⌘P`)

## Code example

```javascript
function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10)); // 55
```

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"

print(greet("MDView"))
```

## Tables

| Shortcut | Action          |
| -------- | --------------- |
| `⌘O`     | Open file       |
| `⌘R`     | Reload file     |
| `⌘F`     | Find in document|
| `⌘P`     | Print / Save PDF|
| `⌘⇧T`    | Toggle theme    |

## Blockquote

> "The best file viewer is the one that just shows you the file."
> — *Probably someone*

## Task list

- [x] Render Markdown
- [x] Drag and drop support
- [x] File association on macOS
- [ ] Watch this list grow

## Make MDView the default for .md files

On macOS, right-click any `.md` file in Finder → **Get Info** → **Open with** → pick **MDView** → **Change All…**

Now every `.md` file opens in MDView on double-click — exactly like a PDF.
