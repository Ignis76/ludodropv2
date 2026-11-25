import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, normalizePath } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const outDir = path.join(root, 'dist-pages');
const source = normalizePath(path.join(root, 'src')) + '/';

await build({
  root,
  base: './',
  plugins: [{
    name: 'pages-public-paths',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(source) || !/\.(?:[jt]sx?|json)$/.test(id)) return;
      // Runtime URLs in TSX, catalog data, and model loaders resolve against the document.
      const relative = code.replace(/(?<![\w./-])\/(assets\/|favicon\.svg\b)/g, './$1');
      if (relative !== code) return { code: relative, map: null };
    },
  }],
  build: {
    outDir,
    rollupOptions: {
      output: {
        // CSS variables containing runtime URLs share the same base as index.html.
        assetFileNames: asset => asset.names.some(name => name.endsWith('.css'))
          ? 'ludodrop-[hash][extname]' : 'assets/[name]-[hash][extname]',
      },
    },
  },
});

// Public stylesheets are copied verbatim by Vite and can also be loaded separately.
const fonts = path.join(outDir, 'assets', 'fonts');
for (const name of await readdir(fonts)) {
  if (!name.endsWith('.css')) continue;
  const file = path.join(fonts, name);
  const css = await readFile(file, 'utf8');
  await writeFile(file, css.replaceAll('/assets/fonts/', './'));
}
await writeFile(path.join(outDir, '.nojekyll'), '');
