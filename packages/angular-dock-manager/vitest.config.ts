import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@widgetstools/dock-manager-core': resolve(__dirname, '../dock-manager-core/src/index.ts'),
    },
  },
});
