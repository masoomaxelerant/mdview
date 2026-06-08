const { marked } = require('marked');
const hljs = require('highlight.js');
const path = require('path');
const fs = require('fs');

// DOMPurify exports differently in Node vs browser contexts.
// In Electron renderer with nodeIntegration, `window` exists, so it should be
// ready-to-use — but normalize defensively.
const _DOMPurify = require('dompurify');
const purifier = typeof _DOMPurify === 'function' ? _DOMPurify(window) : _DOMPurify;
if (typeof purifier.sanitize !== 'function') {
  console.error('DOMPurify did not initialize correctly');
}

// ── Marked configuration ──────────────────────────────────────────────────────
const renderer = new marked.Renderer();

// Open external links in default browser — tag them for delegated click handling.
// marked v15 passes a single token object; older versions used positional args.
renderer.link = function (hrefOrToken, title, text) {
  let href, linkText, linkTitle;
  if (typeof hrefOrToken === 'object' && hrefOrToken !== null) {
    href = hrefOrToken.href;
    linkTitle = hrefOrToken.title;
    let inline = null;
    if (this && this.parser && Array.isArray(hrefOrToken.tokens)) {
      try {
        inline = this.parser.parseInline(hrefOrToken.tokens);
      } catch (_) {}
    }
    linkText = inline || hrefOrToken.text || '';
  } else {
    href = hrefOrToken;
    linkTitle = title;
    linkText = text;
  }
  const safeHref = (href || '').replace(/"/g, '&quot;');
  const titleAttr = linkTitle ? ` title="${linkTitle}"` : '';
  const external = /^https?:\/\//i.test(safeHref);
  const dataAttr = external ? ' data-external="true"' : '';
  return `<a href="${safeHref}"${titleAttr}${dataAttr}>${linkText}</a>`;
};

marked.setOptions({
  gfm: true,
  breaks: false,
  renderer,
});

function highlightCodeBlocks(root) {
  root.querySelectorAll('pre code').forEach((block) => {
    const langClass = (block.className || '').match(/language-([\w+-]+)/);
    const lang = langClass ? langClass[1] : null;
    try {
      if (lang && hljs.getLanguage(lang)) {
        const result = hljs.highlight(block.textContent, {
          language: lang,
          ignoreIllegals: true,
        });
        block.innerHTML = result.value;
        block.classList.add('hljs');
      } else {
        const result = hljs.highlightAuto(block.textContent);
        block.innerHTML = result.value;
        block.classList.add('hljs');
      }
    } catch (_) {
      // leave as-is
    }
  });
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  currentFile: null,
  rawContent: '',
  baseDir: null,
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const contentEl = document.getElementById('content');
const fileNameEl = document.getElementById('file-name');
const filePathEl = document.getElementById('file-path');
const dropOverlay = document.getElementById('drop-overlay');
const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-input');
const findCount = document.getElementById('find-count');

// ── Render ────────────────────────────────────────────────────────────────────
function render(content) {
  const html = marked.parse(content);
  const clean = purifier.sanitize(html, {
    ADD_ATTR: ['target', 'data-external'],
    ADD_TAGS: ['details', 'summary'],
  });

  // Rewrite relative image/link paths so they resolve from the file's directory
  const wrapper = document.createElement('div');
  wrapper.innerHTML = clean;

  if (state.baseDir) {
    wrapper.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || '';
      if (src && !/^([a-z]+:|data:|\/\/)/i.test(src)) {
        const abs = path.resolve(state.baseDir, src);
        img.setAttribute('src', `file://${abs}`);
      }
    });
  }

  wrapper.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        window.mdview.openExternal(href);
      });
    } else if (href.startsWith('#')) {
      // anchor — let default scroll handle it
    } else if (href && state.baseDir && !href.startsWith('javascript:')) {
      const abs = path.resolve(state.baseDir, href);
      a.addEventListener('click', async (e) => {
        e.preventDefault();
        if (/\.(md|markdown|mdx)$/i.test(abs) && fs.existsSync(abs)) {
          loadFile(abs);
        } else {
          window.mdview.openExternal(`file://${abs}`);
        }
      });
    }
  });

  contentEl.innerHTML = '';
  contentEl.appendChild(wrapper);
  highlightCodeBlocks(contentEl);
  contentEl.scrollTop = 0;
}

async function loadFile(filePath) {
  try {
    const content = await window.mdview.readFile(filePath);
    setFile({
      path: filePath,
      name: path.basename(filePath),
      dir: path.dirname(filePath),
      content,
    });
  } catch (err) {
    contentEl.innerHTML = `<div class="empty-state"><h1>Cannot open file</h1><p>${err.message}</p></div>`;
  }
}

function setFile({ path: filePath, name, dir, content }) {
  state.currentFile = filePath;
  state.rawContent = content;
  state.baseDir = dir;
  fileNameEl.textContent = name;
  filePathEl.textContent = dir;
  document.title = `${name} — MDView`;
  render(content);
}

// ── Event wiring ──────────────────────────────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', () => {
  window.mdview.openDialog();
});

document.getElementById('empty-open')?.addEventListener('click', () => {
  window.mdview.openDialog();
});

document.getElementById('btn-theme').addEventListener('click', toggleTheme);

function toggleTheme() {
  const isDark = document.body.classList.toggle('theme-dark');
  document.body.classList.toggle('theme-light', !isDark);
  document.getElementById('hljs-light').disabled = isDark;
  document.getElementById('hljs-dark').disabled = !isDark;
  localStorage.setItem('mdview.theme', isDark ? 'dark' : 'light');
}

// Restore theme
(function initTheme() {
  const saved = localStorage.getItem('mdview.theme');
  if (saved === 'dark') toggleTheme();
})();

// ── Drag & drop ───────────────────────────────────────────────────────────────
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dragDepth++;
  dropOverlay.classList.add('visible');
});
window.addEventListener('dragover', (e) => {
  e.preventDefault();
});
window.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragDepth--;
  if (dragDepth <= 0) {
    dragDepth = 0;
    dropOverlay.classList.remove('visible');
  }
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  dropOverlay.classList.remove('visible');
  const file = e.dataTransfer.files[0];
  if (!file) return;

  let filePath = null;
  try {
    filePath = window.mdview.pathForFile(file);
  } catch (err) {
    console.warn('pathForFile threw:', err);
  }
  if (!filePath && file.path) filePath = file.path; // legacy Electron

  if (filePath) {
    loadFile(filePath);
  } else {
    console.error('Could not resolve dropped file path', file);
  }
});

// ── IPC from main ─────────────────────────────────────────────────────────────
window.mdview.onFileOpened((data) => setFile(data));

window.mdview.onFileChanged((data) => {
  if (data.path === state.currentFile) {
    const scrollPct =
      contentEl.scrollTop / (contentEl.scrollHeight - contentEl.clientHeight || 1);
    state.rawContent = data.content;
    render(data.content);
    requestAnimationFrame(() => {
      contentEl.scrollTop =
        scrollPct * (contentEl.scrollHeight - contentEl.clientHeight);
    });
  }
});

window.mdview.onAction((action) => {
  if (action === 'reload' && state.currentFile) {
    loadFile(state.currentFile);
  } else if (action === 'print') {
    window.print();
  } else if (action === 'find') {
    openFind();
  } else if (action === 'toggle-theme') {
    toggleTheme();
  }
});

// ── Find in document ──────────────────────────────────────────────────────────
let findHits = [];
let findIndex = 0;

function openFind() {
  findBar.classList.add('visible');
  findInput.focus();
  findInput.select();
}

function closeFind() {
  findBar.classList.remove('visible');
  clearFind();
}

function clearFind() {
  contentEl.querySelectorAll('mark.find-hit').forEach((m) => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });
  findHits = [];
  findIndex = 0;
  findCount.textContent = '0 / 0';
}

function doFind(query) {
  clearFind();
  if (!query) return;
  const walker = document.createTreeWalker(contentEl, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE'))
        return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const targets = [];
  let n;
  while ((n = walker.nextNode())) targets.push(n);
  const q = query.toLowerCase();

  targets.forEach((textNode) => {
    const text = textNode.nodeValue;
    const lower = text.toLowerCase();
    let idx = lower.indexOf(q);
    if (idx === -1) return;
    const frag = document.createDocumentFragment();
    let cursor = 0;
    while (idx !== -1) {
      if (idx > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, idx)));
      const mark = document.createElement('mark');
      mark.className = 'find-hit';
      mark.textContent = text.slice(idx, idx + q.length);
      frag.appendChild(mark);
      findHits.push(mark);
      cursor = idx + q.length;
      idx = lower.indexOf(q, cursor);
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    textNode.parentNode.replaceChild(frag, textNode);
  });

  if (findHits.length) {
    findIndex = 0;
    focusHit();
  }
  updateFindCount();
}

function focusHit() {
  findHits.forEach((m) => m.classList.remove('find-hit-current'));
  const m = findHits[findIndex];
  if (!m) return;
  m.classList.add('find-hit-current');
  m.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function updateFindCount() {
  findCount.textContent = findHits.length
    ? `${findIndex + 1} / ${findHits.length}`
    : '0 / 0';
}

findInput.addEventListener('input', (e) => doFind(e.target.value));
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeFind();
  else if (e.key === 'Enter') {
    if (!findHits.length) return;
    findIndex = (findIndex + (e.shiftKey ? -1 : 1) + findHits.length) % findHits.length;
    focusHit();
    updateFindCount();
  }
});
document.getElementById('find-prev').addEventListener('click', () => {
  if (!findHits.length) return;
  findIndex = (findIndex - 1 + findHits.length) % findHits.length;
  focusHit();
  updateFindCount();
});
document.getElementById('find-next').addEventListener('click', () => {
  if (!findHits.length) return;
  findIndex = (findIndex + 1) % findHits.length;
  focusHit();
  updateFindCount();
});
document.getElementById('find-close').addEventListener('click', closeFind);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && findBar.classList.contains('visible')) {
    closeFind();
  }
});
