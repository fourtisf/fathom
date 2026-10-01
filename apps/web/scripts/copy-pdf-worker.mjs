// Serves pdf.js's worker as a static file. Bundling it makes webpack minify an ES module as a script.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve('pdfjs-dist/package.json'));
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'vendor');
mkdirSync(out, { recursive: true });
copyFileSync(join(pkg, 'legacy', 'build', 'pdf.worker.min.mjs'), join(out, 'pdf.worker.min.mjs'));
