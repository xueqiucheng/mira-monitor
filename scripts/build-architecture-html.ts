import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

const projectRoot = process.cwd();
const inPath = join(projectRoot, "docs/architecture.md");
const outPath = join(projectRoot, "docs/architecture.html");

const md = readFileSync(inPath, "utf-8");
marked.setOptions({ gfm: true, breaks: false });
const body = marked.parse(md, { async: false }) as string;

const css = `
:root {
  color-scheme: dark;
  --bg: #09090b;
  --bg-2: #0f0f12;
  --bg-3: #18181b;
  --border: #27272a;
  --text: #e4e4e7;
  --text-muted: #a1a1aa;
  --text-dim: #71717a;
  --heading: #fafafa;
  --link: #06b6d4;
  --code-bg: #0e0e12;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2.5rem 1.5rem 6rem;
}

h1, h2, h3, h4, h5 {
  color: var(--heading);
  font-weight: 600;
  letter-spacing: -0.01em;
  scroll-margin-top: 1.5rem;
}

h1 {
  font-size: 1.95rem;
  margin: 0 0 1.5rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--border);
}

h2 {
  font-size: 1.45rem;
  margin: 3rem 0 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}

h3 {
  font-size: 1.18rem;
  margin: 2.2rem 0 0.75rem;
}

h4 {
  font-size: 1rem;
  margin: 1.5rem 0 0.5rem;
  color: var(--text);
}

p { margin: 0.75rem 0; }
li { margin: 0.25rem 0; }
ul, ol { padding-left: 1.5rem; }

a {
  color: var(--link);
  text-decoration: none;
}
a:hover { text-decoration: underline; }

strong { color: var(--heading); font-weight: 600; }

code {
  font-family: "Geist Mono", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.85em;
  background: var(--bg-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.1em 0.4em;
  color: #f4f4f5;
}

pre {
  background: var(--code-bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1rem 1.25rem;
  overflow-x: auto;
  margin: 1.25rem 0;
  font-size: 0.825rem;
  line-height: 1.55;
}

pre code {
  background: transparent;
  border: none;
  padding: 0;
  font-size: inherit;
  color: #e4e4e7;
  white-space: pre;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.25rem 0;
  font-size: 0.875rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}

th, td {
  text-align: left;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}

th {
  background: var(--bg-2);
  color: var(--heading);
  font-weight: 600;
  border-bottom: 1.5px solid var(--border);
  font-size: 0.825rem;
}

tbody tr:last-child td { border-bottom: none; }
tbody tr:hover { background: var(--bg-3); }

td code { white-space: nowrap; }

hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 2.5rem 0;
}

blockquote {
  border-left: 3px solid var(--link);
  margin: 1rem 0;
  padding: 0.25rem 0 0.25rem 1rem;
  color: var(--text-muted);
  background: rgba(6, 182, 212, 0.05);
}

.doc-meta {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-family: "Geist Mono", monospace;
  margin-bottom: 2rem;
  padding: 0.5rem 0;
}
`;

const html = `<!doctype html>
<html lang="zh" class="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mira Monitor 架构</title>
<style>${css}</style>
</head>
<body>
<div class="container">
<div class="doc-meta">source: docs/architecture.md · 生成时间: ${new Date().toISOString()}</div>
${body}
</div>
</body>
</html>
`;

writeFileSync(outPath, html);
console.log(`generated: ${outPath} (${(html.length / 1024).toFixed(1)}KB)`);
