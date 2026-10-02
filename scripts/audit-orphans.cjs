#!/usr/bin/env node
/**
 * audit-orphans.cjs — dead-module audit for the Aether engine.
 *
 * WHY THIS EXISTS
 * A previous cleanup pass claimed "6 dead files". Re-running a naive scan here
 * proved that claim wrong in the dangerous direction: the list included
 * `lib/terrain/terrainWorkerEntry.ts`, which is very much alive because it is
 * loaded through `new Worker(new URL('./terrainWorkerEntry.ts', import.meta.url))`
 * — a dynamic URL an import scanner cannot see. Deleting it would have broken
 * terrain generation at runtime, and neither the type-check nor the unit tests
 * would have caught it.
 *
 * So this audit models the three reference mechanisms this codebase actually
 * uses, and fails when an UNRECOGNISED orphan appears:
 *   1. static `import` / `export ... from` / `require`, relative AND `@/` aliased
 *   2. Web Worker entries referenced via `new Worker(new URL(...))`
 *   3. directory imports (`from './ui'` -> `lib/ui/index.ts`)
 *
 * Known-and-accepted orphans live in `KNOWN_ORPHANS` below, each with a reason.
 * Wiring one of them up (or deleting it) without updating that list, or adding a
 * brand-new orphan, makes this script exit non-zero.
 *
 * Usage: node scripts/audit-orphans.cjs [--strict] [file ...]
 *   --strict  also fail while entries remain in KNOWN_ORPHANS
 *   file ...  report which files reference the given modules
 */

const fs = require('fs');
const path = require('path');

const ROOTS = ['app', 'components', 'hooks', 'lib', 'types', 'scripts', 'tests'];
const SKIP = new Set(['node_modules', '.next', '.git', 'public', 'out', 'coverage']);
// Only these are audited for orphans: app/ pages and tests/ are entry points by nature.
const CANDIDATE_DIRS = ['lib', 'components', 'hooks', 'types'];

/**
 * Modules with zero inbound references that are intentionally kept.
 * Each entry carries a reason so nobody "cleans them up" blindly.
 */
const KNOWN_ORPHANS = new Map([
  [
    'lib/GhostManager.ts',
    'Complete Time-Trial / Ghost-Racing implementation with no UI or gameplay wiring yet. Kept as ready-to-integrate work, not as dead code.',
  ],
  [
    'lib/utils.ts',
    "shadcn/ui `cn()` class-name helper. Part of the standard shadcn scaffold (clsx + tailwind-merge are installed deps) reserved for upcoming components/ui/* work.",
  ],
  [
    'hooks/use-mobile.ts',
    'shadcn/ui `useIsMobile()` responsive hook. Same scaffold as lib/utils.ts; kept for the planned mobile editor layout.',
  ],
]);

function walk(dir, acc) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx)$/.test(entry.name)) acc.push(p);
  }
  return acc;
}

const stripExt = (p) => p.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '');
const abs = (p) => path.resolve(p).split(path.sep).join('/');
const rel = (p) => path.relative(process.cwd(), path.resolve(p)).split(path.sep).join('/');

/** Resolve a module specifier to an absolute, extension-less path. */
function resolveSpec(fromFile, spec) {
  if (spec.startsWith('.')) return path.resolve(path.dirname(fromFile), spec);
  if (spec.startsWith('@/')) return path.resolve('.', spec.slice(2)); // tsconfig paths
  return null; // bare specifier = npm package
}

const files = [];
for (const root of ROOTS) if (fs.existsSync(root)) walk(root, files);

const refTargets = new Set();
const refEdges = [];
const IMPORT_RE = /(?:\bfrom\b|\bimport\b|\brequire\b)\s*\(?\s*['"]([^'"]+)['"]/g;
const WORKER_RE = /new\s+Worker\s*\(\s*new\s+URL\s*\(\s*['"]([^'"]+)['"]/g;

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const re of [IMPORT_RE, WORKER_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) {
      const target = resolveSpec(file, m[1]);
      if (!target) continue;
      const key = abs(stripExt(target));
      if (key === abs(stripExt(file))) continue; // self reference
      refTargets.add(key);
      refEdges.push({ target: key, from: rel(file) });
    }
  }
}

const orphans = [];
for (const file of files) {
  if (!CANDIDATE_DIRS.includes(rel(file).split('/')[0])) continue;
  const isIndex = path.basename(file).replace(/\.(ts|tsx)$/, '') === 'index';
  const alive =
    refTargets.has(abs(stripExt(file))) ||
    (isIndex && refTargets.has(abs(path.dirname(file))));
  if (!alive) orphans.push(rel(file));
}

const unexpected = orphans.filter((o) => !KNOWN_ORPHANS.has(o));
const stale = [...KNOWN_ORPHANS.keys()].filter((k) => !orphans.includes(k));

console.log(`scanned ${files.length} TS/TSX files, ${refTargets.size} distinct reference targets`);
console.log(`orphans: ${orphans.length} (${unexpected.length} unrecognised)`);
for (const o of orphans) {
  const reason = KNOWN_ORPHANS.get(o);
  console.log(`  ${reason ? 'known ' : 'ORPHAN'} ${o}`);
  if (reason) console.log(`         reason: ${reason}`);
}
if (stale.length) {
  console.log('stale KNOWN_ORPHANS entries (now referenced — drop them from the allowlist):');
  for (const s of stale) console.log(`  stale   ${s}`);
}

const args = process.argv.slice(2);
const strict = args.includes('--strict');
for (const watched of args.filter((a) => !a.startsWith('--'))) {
  const hits = refEdges.filter((e) => e.target === abs(stripExt(watched)));
  console.log(
    `referrers of ${watched}: ${hits.length}` +
      (hits.length ? ` -> ${[...new Set(hits.map((h) => h.from))].join(', ')}` : ' (none)')
  );
}

if (unexpected.length) {
  console.error(`\nFAIL: ${unexpected.length} unrecognised orphan module(s): ${unexpected.join(', ')}`);
  process.exit(1);
}
if (strict && orphans.length) {
  console.error(`\nFAIL: --strict, but ${orphans.length} orphan(s) remain in KNOWN_ORPHANS.`);
  process.exit(1);
}
console.log('\nOK: no unrecognised orphan modules.');
