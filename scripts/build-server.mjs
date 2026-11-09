/** Bundles the server (and the shared code it uses) into dist/server with esbuild. */
import { build } from 'esbuild';

await build({
  entryPoints: { index: 'src/server/index.ts', cli: 'src/server/cli.ts' },
  outdir: 'dist/server',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  banner: { js: '// ProtoTrip server – built file, edit src/server instead.' },
});
