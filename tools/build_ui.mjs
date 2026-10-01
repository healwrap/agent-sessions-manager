import { build } from 'vite';
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const configFile = resolve(root, 'frontend/vite.config.ts');
await build({ configFile });
const shellDir = resolve(root, 'build/ui-shell');
await build({ configFile, publicDir: false, build: {
  ssr: resolve(root, 'frontend/src/shell.tsx'), outDir: shellDir, emptyOutDir: true,
  rollupOptions: { output: { entryFileNames: 'shell.mjs' } },
} });
const { render } = await import(pathToFileURL(resolve(shellDir, 'shell.mjs')));
const file = resolve(root, 'frontend/dist/index.html');
const html = (await readFile(file, 'utf8')).replace('<div id="root"></div>', `<div id="root">${render()}</div>`);
await writeFile(file, html);
// The native loader paints the same shell before the sidecar becomes ready.
// Only the served page hydrates React; the loader keeps its tiny recovery script.
const loader = resolve(root, 'desktop/loader');
await mkdir(loader, { recursive: true });
await rm(resolve(loader, 'assets'), { recursive: true, force: true });
await cp(resolve(root, 'frontend/dist/assets'), resolve(loader, 'assets'), { recursive: true, force: true });
await cp(resolve(root, 'frontend/dist/icons.svg'), resolve(loader, 'icons.svg'));
await cp(resolve(root, 'frontend/dist/theme-boot.js'), resolve(loader, 'theme-boot.js'));
const native = html.replace(/<script type="module"[^>]*><\/script>/g, '')
  .replace('</head>', '<link rel="stylesheet" href="/boot.css"><script src="/boot.js" defer></script></head>')
  .replace('</body>', '<div class="boot-recovery" hidden><button id="restart">重新启动</button></div></body>');
await writeFile(resolve(loader, 'index.html'), native);
console.log('Pre-rendered shell and native startup page ready.');
