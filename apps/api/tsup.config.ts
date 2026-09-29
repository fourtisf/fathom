import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Workspace packages ship TS source, so bundle them; Prisma needs its generated client at runtime.
  noExternal: [/^@fathom\//],
  external: ['@prisma/client', '.prisma/client'],
});
