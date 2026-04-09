#!/usr/bin/env node
/**
 * Atomic version bump for the three workspace packages.
 *
 * Usage:
 *   node scripts/release.mjs <newVersion>
 *   e.g. node scripts/release.mjs 0.1.32
 *
 * What it does:
 *   1. Updates `version` in
 *        packages/dock-manager-core/package.json
 *        packages/react-dock-manager/package.json
 *        packages/angular-dock-manager/package.json
 *   2. Updates cross-package dependency references to the core package
 *      in the react + angular wrappers, preserving the existing range
 *      prefix (^, ~, >=, or exact).
 *   3. Verifies the three package.json files parse correctly.
 *
 * It deliberately does NOT: run tests, build, commit, tag, or push.
 * Run `npm run build && npx vitest run --root packages/dock-manager-core`
 * afterwards, then commit / tag / push yourself.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const newVersion = process.argv[2];

if (!newVersion || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(newVersion)) {
  console.error('usage: node scripts/release.mjs <semver>');
  console.error('example: node scripts/release.mjs 0.1.32');
  process.exit(1);
}

const pkgs = [
  'packages/dock-manager-core/package.json',
  'packages/react-dock-manager/package.json',
  'packages/angular-dock-manager/package.json',
];

const CORE_NAME = '@widgetstools/dock-manager-core';

function load(relPath) {
  const full = resolve(root, relPath);
  return { full, json: JSON.parse(readFileSync(full, 'utf8')) };
}

function save(full, json) {
  writeFileSync(full, JSON.stringify(json, null, 2) + '\n');
}

/** Preserve the existing range prefix when rewriting a dep. */
function rewriteRange(oldRange, version) {
  const match = oldRange.match(/^(\^|~|>=|>|<=|<|=)?\s*/);
  const prefix = match ? match[1] ?? '' : '';
  // Default to caret for unpinned exact versions — safer for cross-package consumers.
  return `${prefix || '^'}${version}`;
}

console.log(`Bumping all packages to ${newVersion}`);

for (const rel of pkgs) {
  const { full, json } = load(rel);
  const oldV = json.version;
  json.version = newVersion;

  // Rewrite cross-refs to the core package in deps / peerDeps / devDeps.
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) {
    if (json[field] && json[field][CORE_NAME]) {
      const oldRange = json[field][CORE_NAME];
      const next = rewriteRange(oldRange, newVersion);
      json[field][CORE_NAME] = next;
      console.log(`  ${rel}: ${field}.${CORE_NAME} ${oldRange} → ${next}`);
    }
  }

  save(full, json);
  console.log(`  ${rel}: ${oldV} → ${newVersion}`);
}

// Sanity: re-parse all three files.
for (const rel of pkgs) {
  JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
}

console.log('\nDone. Next steps:');
console.log('  npm run build');
console.log('  npx vitest run --root packages/dock-manager-core');
console.log(`  git add -A && git commit -m "chore: release ${newVersion}"`);
console.log(`  git tag v${newVersion} && git push origin main --follow-tags`);
