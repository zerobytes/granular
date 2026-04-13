import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import process from 'node:process';
import { spawn } from 'node:child_process';

const DOCS_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../docs/modules');

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function collectDocs(rootDir, baseDir = rootDir) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const tree = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      tree.push({
        type: 'dir',
        name: entry.name,
        children: collectDocs(fullPath, baseDir),
      });
      continue;
    }
    if (!entry.name.endsWith('.md')) continue;
    tree.push({
      type: 'file',
      name: entry.name,
      relativePath: path.relative(baseDir, fullPath).split(path.sep).join('/'),
    });
  }

  return tree;
}

function flattenDocs(tree, list = []) {
  for (const entry of tree) {
    if (entry.type === 'dir') {
      flattenDocs(entry.children, list);
      continue;
    }
    list.push(entry.relativePath);
  }
  return list;
}

function normalizeDocPath(requested, fallback) {
  const value = requested || fallback;
  const normalized = path.posix.normalize(String(value || '').replace(/^\/+/, ''));
  if (!normalized || normalized.startsWith('..')) return fallback;
  const fullPath = path.join(DOCS_ROOT, normalized);
  if (!fullPath.startsWith(DOCS_ROOT)) return fallback;
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) return fallback;
  return normalized;
}

function renderInline(text, currentDoc) {
  const tokens = [];
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `__CODE_${tokens.length}__`;
    tokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
    const token = `__LINK_${tokens.length}__`;
    let target = href;
    if (!/^(https?:|#|mailto:)/.test(href)) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(currentDoc), href));
      target = `/doc?path=${encodeURIComponent(resolved)}`;
    }
    tokens.push(`<a href="${escapeHtml(target)}">${escapeHtml(label)}</a>`);
    return token;
  });

  for (let i = 0; i < tokens.length; i += 1) {
    html = html.replace(`__CODE_${i}__`, tokens[i]).replace(`__LINK_${i}__`, tokens[i]);
  }

  return html;
}

function renderMarkdown(markdown, currentDoc) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let inCode = false;
  let codeLang = '';
  let inUl = false;
  let inOl = false;
  let paragraph = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${renderInline(paragraph.join(' '), currentDoc)}</p>`);
    paragraph = [];
  };

  const closeLists = () => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };

  for (const line of lines) {
    if (line.startsWith('```')) {
      flushParagraph();
      closeLists();
      if (!inCode) {
        inCode = true;
        codeLang = line.slice(3).trim();
        out.push(`<pre><code${codeLang ? ` class="lang-${escapeHtml(codeLang)}"` : ''}>`);
      } else {
        inCode = false;
        codeLang = '';
        out.push('</code></pre>');
      }
      continue;
    }

    if (inCode) {
      out.push(`${escapeHtml(line)}\n`);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeLists();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph();
      closeLists();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(heading[2], currentDoc)}</h${level}>`);
      continue;
    }

    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      flushParagraph();
      if (inOl) {
        out.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        out.push('<ul>');
        inUl = true;
      }
      out.push(`<li>${renderInline(ul[1], currentDoc)}</li>`);
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      flushParagraph();
      if (inUl) {
        out.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        out.push('<ol>');
        inOl = true;
      }
      out.push(`<li>${renderInline(ol[1], currentDoc)}</li>`);
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  closeLists();
  if (inCode) out.push('</code></pre>');
  return out.join('\n');
}

function renderNav(tree, currentDoc) {
  const parts = [];

  const walk = (entries, depth = 0) => {
    for (const entry of entries) {
      if (entry.type === 'dir') {
        parts.push(`<div class="nav-group" style="--depth:${depth}"><span>${escapeHtml(entry.name)}</span></div>`);
        walk(entry.children, depth + 1);
        continue;
      }
      const active = entry.relativePath === currentDoc ? 'active' : '';
      parts.push(
        `<a class="nav-link ${active}" style="--depth:${depth}" href="/doc?path=${encodeURIComponent(entry.relativePath)}">${escapeHtml(entry.relativePath)}</a>`,
      );
    }
  };

  walk(tree);
  return parts.join('\n');
}

function renderPage({ currentDoc, tree, markdown }) {
  const title = currentDoc.replace(/\.md$/, '');
  const nav = renderNav(tree, currentDoc);
  const content = renderMarkdown(markdown, currentDoc);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} · Granular Module Docs</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b1020;
        --panel: #121a31;
        --panel-2: #16203c;
        --line: #263556;
        --text: #e7eefc;
        --muted: #98a6c8;
        --accent: #8bb9ff;
        --code: #0f1730;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: var(--bg);
        color: var(--text);
      }
      .layout {
        display: grid;
        grid-template-columns: 320px minmax(0, 1fr);
        min-height: 100vh;
      }
      aside {
        border-right: 1px solid var(--line);
        background: var(--panel);
        padding: 20px 16px;
        overflow: auto;
      }
      main {
        padding: 32px;
        overflow: auto;
      }
      .brand {
        font-size: 14px;
        font-weight: 700;
        letter-spacing: .04em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 16px;
      }
      .nav-group {
        padding-left: calc(var(--depth) * 14px);
        margin: 14px 0 6px;
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: .06em;
      }
      .nav-link {
        display: block;
        padding: 8px 10px;
        padding-left: calc(var(--depth) * 14px + 10px);
        color: var(--text);
        text-decoration: none;
        border-radius: 8px;
        margin-bottom: 2px;
        font-size: 14px;
      }
      .nav-link:hover, .nav-link.active {
        background: var(--panel-2);
      }
      .content {
        max-width: 920px;
        margin: 0 auto;
      }
      h1, h2, h3, h4, h5, h6 { line-height: 1.15; margin: 1.4em 0 .6em; }
      h1 { margin-top: 0; font-size: 2.2rem; }
      p, li { line-height: 1.75; color: var(--text); }
      ul, ol { padding-left: 24px; }
      a { color: var(--accent); }
      code {
        background: var(--code);
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: .15rem .4rem;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      pre {
        background: var(--code);
        border: 1px solid var(--line);
        border-radius: 12px;
        padding: 16px;
        overflow: auto;
      }
      pre code {
        background: transparent;
        border: 0;
        padding: 0;
      }
      .path {
        color: var(--muted);
        margin-bottom: 20px;
        font-size: 14px;
      }
      @media (max-width: 960px) {
        .layout { grid-template-columns: 1fr; }
        aside { border-right: 0; border-bottom: 1px solid var(--line); max-height: 40vh; }
        main { padding: 20px; }
      }
    </style>
  </head>
  <body>
    <div class="layout">
      <aside>
        <div class="brand">Granular Module Docs</div>
        ${nav}
      </aside>
      <main>
        <div class="content">
          <div class="path">${escapeHtml(currentDoc)}</div>
          ${content}
        </div>
      </main>
    </div>
  </body>
</html>`;
}

function openUrl(url) {
  const platform = process.platform;
  if (platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
}

function parseArgs(args) {
  const options = {
    host: '127.0.0.1',
    port: 4178,
    open: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--host' && args[i + 1]) {
      options.host = args[++i];
      continue;
    }
    if (arg === '--port' && args[i + 1]) {
      const nextPort = Number(args[++i]);
      if (Number.isFinite(nextPort) && nextPort >= 0) {
        options.port = nextPort;
      }
      continue;
    }
    if (arg === '--open') {
      options.open = true;
    }
  }

  return options;
}

export async function runModuleDocsServer(args = []) {
  const options = Array.isArray(args) ? parseArgs(args) : { ...args };
  const tree = collectDocs(DOCS_ROOT);
  const docs = flattenDocs(tree);
  const defaultDoc = docs.includes('README.md') ? 'README.md' : docs[0];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${options.host}:${options.port}`);
    const requested = url.searchParams.get('path');
    const currentDoc = normalizeDocPath(requested, defaultDoc);
    const filePath = path.join(DOCS_ROOT, currentDoc);
    const markdown = fs.readFileSync(filePath, 'utf8');
    const html = renderPage({ currentDoc, tree, markdown });

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, options.host, resolve);
  });

  const address = server.address();
  const host = options.host.includes(':') ? `[${options.host}]` : options.host;
  const url = `http://${host}:${address.port}/`;
  console.log(`Module docs available at ${url}`);
  if (options.open) openUrl(url);

  await new Promise((resolve) => {
    const shutdown = () => {
      server.close(() => resolve());
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await runModuleDocsServer(process.argv.slice(2));
}
