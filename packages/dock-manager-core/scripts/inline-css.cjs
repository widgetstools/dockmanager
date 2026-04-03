/**
 * Post-build script: inlines dock-manager.css into the JS bundles
 * by replacing the __DOCK_CSS_PLACEHOLDER__ sentinel with the actual CSS content.
 */
const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'dist', 'styles', 'dock-manager.css');
const distDir = path.join(__dirname, '..', 'dist');

const css = fs.readFileSync(cssPath, 'utf8');

// Escape the CSS for embedding inside a JS string literal (double-quoted by tsup).
// Order matters: backslashes first, then quotes, then newlines.
const escaped = css
  .replace(/\\/g, '\\\\')
  .replace(/"/g, '\\"')
  .replace(/'/g, "\\'")
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r');

const jsFiles = ['index.js', 'index.cjs'];

for (const file of jsFiles) {
  const filePath = path.join(distDir, file);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('__DOCK_CSS_PLACEHOLDER__')) {
    content = content.replace(/__DOCK_CSS_PLACEHOLDER__/g, escaped);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Inlined CSS into ${file} (${css.length} bytes)`);
  }
}
