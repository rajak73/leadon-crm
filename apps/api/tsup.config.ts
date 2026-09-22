import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts', 'src/scripts/seed.ts', 'src/scripts/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  clean: true,
  sourcemap: true,
  // Bundle the workspace shared package; keep node_modules external.
  noExternal: ['@leados/shared'],
});
