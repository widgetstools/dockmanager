import { defineConfig } from 'tsup';
import { copyFileSync } from 'fs';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  external: ['react', 'react-dom'],
  treeshake: true,
  onSuccess: async () => {
    copyFileSync('src/styles.css', 'dist/styles.css');
    console.log('Copied styles.css to dist/');
  },
});
