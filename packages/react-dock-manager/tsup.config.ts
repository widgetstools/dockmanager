import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

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
    // Read the react-dock-manager styles
    const reactStyles = readFileSync('src/styles.css', 'utf-8');

    // Resolve core CSS via the sibling package in the monorepo
    const coreStylesPath = resolve(
      __dirname, '..', 'dock-manager-core', 'dist', 'styles', 'dock-manager.css'
    );
    const coreStyles = readFileSync(coreStylesPath, 'utf-8');

    // Inline: replace the @import with the actual core CSS content
    const inlined = reactStyles.replace(
      /@import\s+['"]@widgetstools\/dock-manager-core\/styles\.css['"];?\s*/,
      coreStyles + '\n'
    );

    writeFileSync('dist/styles.css', inlined);
    console.log('Built styles.css with inlined core CSS');
  },
});
