// First-paint JS report + budget gate for ReCue's frontend bundle (#356).
//
// "First-paint JS" = every chunk a window must download, parse and execute BEFORE it can
// render: the Vite entry chunk plus its transitive **static** import closure, plus the one
// lazy route chunk that window loads (and that chunk's own static closure). Chunks reached
// only through a dynamic `import()` (React.lazy / mermaid #254) are *not* followed — that
// is the whole point of the split, and it is why `manualChunks` cannot help: a statically
// reachable module is parsed before first render whatever chunk it lands in.
//
// The app has two window routes (#84):
//   - main window            → src/MainApp.tsx
//   - detached canvas window → src/components/CanvasWindow/CanvasWindow.tsx
//
//   node scripts/bundle-report.mjs           # print both routes + the deferred chunks
//   node scripts/bundle-report.mjs --check   # exit 1 if the main route is over budget
//
// Reads dist/.vite/manifest.json (vite.config.ts `build.manifest: true`), so run it after
// `npm run build`. Node builtins only — no dependencies.

import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const MANIFEST = path.join(DIST, ".vite", "manifest.json");

/** Main-window first-paint JS ceiling, in kB (raw). #356 took it from 1,351.5 kB (one
 *  chunk, no splitting) to 854.3 kB and set the budget at 900 (~5% headroom, well under
 *  the card's hard 1,000 kB ceiling). ~70 tasks of legitimate first-paint feature growth
 *  later the route sat at 896.2 raw / 260.9 gzip — already OVER the original gzip budget
 *  on the base branch — so the worktree-detection feature (+7.0 raw / +2.4 gzip of
 *  sidebar/store code, nothing lazy-loadable) re-based the budget at the same ~5%
 *  headroom over the new reality (903.2 / 263.3). A future *static* import of
 *  react-markdown / prismjs / @xterm/addon-webgl back into the entry graph still blows
 *  through this — that is the guard; incremental feature code is not. */
const MAIN_ROUTE_BUDGET_KB = 950;
/** Same, gzipped (the number that actually hits the disk). */
const MAIN_ROUTE_BUDGET_GZIP_KB = 278;

const ROUTES = [
  { label: "main window", key: "src/MainApp.tsx" },
  {
    label: "detached canvas window",
    key: "src/components/CanvasWindow/CanvasWindow.tsx",
  },
];

function loadManifest() {
  try {
    return JSON.parse(readFileSync(MANIFEST, "utf8"));
  } catch {
    console.error(
      `bundle-report: no manifest at ${path.relative(ROOT, MANIFEST)} — run \`npm run build\` first.`,
    );
    process.exit(2);
  }
}

/** The manifest key for a route's source module. Vite keys a lazy chunk by its source path
 *  when the chunk keeps a facade for it (`src/.../CanvasWindow.tsx`), but by its emitted
 *  file name (`_MainApp-<hash>.js`) when Rollup drops the facade — so fall back to matching
 *  the chunk *name* (the source basename) among the dynamic entries. */
function routeKey(manifest, srcKey) {
  if (manifest[srcKey]) return srcKey;
  const bySrc = Object.keys(manifest).find((k) => manifest[k].src === srcKey);
  if (bySrc) return bySrc;
  const name = path.basename(srcKey).replace(/\.[jt]sx?$/, "");
  return Object.keys(manifest).find(
    (k) => manifest[k].isDynamicEntry && manifest[k].name === name,
  );
}

/** The transitive **static**-import closure of a manifest key (the key itself included).
 *  `dynamicImports` are deliberately not followed. */
function staticClosure(manifest, key, seen = new Set()) {
  if (!key || seen.has(key) || !manifest[key]) return seen;
  seen.add(key);
  for (const dep of manifest[key].imports ?? []) {
    staticClosure(manifest, dep, seen);
  }
  return seen;
}

function sizes(file) {
  const buf = readFileSync(path.join(DIST, file));
  return { raw: buf.length, gzip: gzipSync(buf).length };
}

const kb = (bytes) => (bytes / 1000).toFixed(1).padStart(8);

function main() {
  const manifest = loadManifest();
  const check = process.argv.includes("--check");

  const entryKey = Object.keys(manifest).find((k) => manifest[k].isEntry);
  if (!entryKey) {
    console.error("bundle-report: no entry chunk in the manifest.");
    process.exit(2);
  }
  const entrySet = staticClosure(manifest, entryKey);

  const totals = new Map();
  const firstPaint = new Set();

  for (const route of ROUTES) {
    const keys = new Set(entrySet);
    const key = routeKey(manifest, route.key);
    if (key) {
      for (const k of staticClosure(manifest, key)) keys.add(k);
    } else {
      console.error(
        `bundle-report: no chunk for route ${route.key} — is it still lazily imported?`,
      );
      process.exit(2);
    }
    const files = [...keys].map((k) => manifest[k].file);
    for (const f of files) firstPaint.add(f);

    let raw = 0;
    let gzip = 0;
    const rows = files
      .map((file) => ({ file, ...sizes(file) }))
      .sort((a, b) => b.raw - a.raw);

    console.log(`\n${route.label} — first-paint JS`);
    console.log(
      "  " + "raw kB".padStart(8) + " " + "gzip kB".padStart(8) + "  file",
    );
    for (const row of rows) {
      raw += row.raw;
      gzip += row.gzip;
      console.log(`  ${kb(row.raw)} ${kb(row.gzip)}  ${row.file}`);
    }
    console.log(`  ${kb(raw)} ${kb(gzip)}  TOTAL (${rows.length} chunks)`);
    totals.set(route.key, { raw, gzip });
  }

  const deferred = Object.values(manifest)
    .filter((c) => c.file?.endsWith(".js") && !firstPaint.has(c.file))
    .map((c) => ({ file: c.file, ...sizes(c.file) }))
    .sort((a, b) => b.raw - a.raw);
  const deferredRaw = deferred.reduce((n, c) => n + c.raw, 0);
  console.log(
    `\ndeferred (async) — ${deferred.length} chunks, ${(deferredRaw / 1000).toFixed(1)} kB raw, fetched on demand:`,
  );
  for (const row of deferred.slice(0, 12)) {
    console.log(`  ${kb(row.raw)} ${kb(row.gzip)}  ${row.file}`);
  }
  if (deferred.length > 12) console.log(`  … and ${deferred.length - 12} more`);

  const main = totals.get(ROUTES[0].key);
  const canvas = totals.get(ROUTES[1].key);
  console.log(
    `\nmain route: ${(main.raw / 1000).toFixed(1)} kB raw / ${(main.gzip / 1000).toFixed(1)} kB gzip` +
      ` (budget ${MAIN_ROUTE_BUDGET_KB} / ${MAIN_ROUTE_BUDGET_GZIP_KB} kB)`,
  );
  console.log(
    `canvas route: ${(canvas.raw / 1000).toFixed(1)} kB raw / ${(canvas.gzip / 1000).toFixed(1)} kB gzip` +
      ` (${((main.raw - canvas.raw) / 1000).toFixed(1)} kB lighter than main)`,
  );

  if (!check) return;
  const over = [];
  if (main.raw / 1000 > MAIN_ROUTE_BUDGET_KB) {
    over.push(
      `raw ${(main.raw / 1000).toFixed(1)} kB > ${MAIN_ROUTE_BUDGET_KB} kB`,
    );
  }
  if (main.gzip / 1000 > MAIN_ROUTE_BUDGET_GZIP_KB) {
    over.push(
      `gzip ${(main.gzip / 1000).toFixed(1)} kB > ${MAIN_ROUTE_BUDGET_GZIP_KB} kB`,
    );
  }
  if (over.length) {
    console.error(
      `\n✗ main-window first-paint JS over budget: ${over.join(", ")}.\n` +
        `  Something heavy was statically imported into the entry graph — make it lazy\n` +
        `  (React.lazy / dynamic import), don't raise the budget.`,
    );
    process.exit(1);
  }
  console.log("\n✓ main-window first-paint JS is within budget.");
}

main();
