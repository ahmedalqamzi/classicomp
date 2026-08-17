// Regenerates src/data/tracked-projects.json from the Classic Game Ports
// tracker checkout (see TRACKER_DIR in generate-tracked-catalog.mjs).
// Usage: node scripts/bundle-catalog-generator.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import esbuild from 'esbuild';

const dir = dirname(fileURLToPath(import.meta.url));
const outfile = join(dir, '.catalog-generator.bundle.mjs');

await esbuild.build({
  entryPoints: [join(dir, 'generate-tracked-catalog.mjs')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile,
  plugins: [
    {
      // The tracker's seed module imports its database helpers, which are not
      // needed to read the seed records.
      name: 'stub-db',
      setup(build) {
        build.onResolve({ filter: /db\/projects\.js$/ }, () => ({
          path: join(dir, 'catalog-db-stub.mjs'),
        }));
      },
    },
  ],
});
await import(outfile);
