### 227. [x] Extend file-viewer syntax highlighting to more languages (C#, Go, Lua, SQL, Ruby, PHP, Gradle…)

**Status:** Done
**Depends on:** none
**Created:** 2026-06-28

**Description**

The universal **FileViewer** already syntax-highlights a curated set of languages via
Prism.js (#44/#150). Extend that curated set to cover the rest of the common languages
the user listed: **Java, Rust, JavaScript, HTML, CSS, C#, JSON, YAML, POM, Gradle, Go,
Lua, SQL, Python, Ruby, PHP**. Keep it **fast and non-blocking**.

**Grounding (current state):**

- **`src/components/FileViewer/fileType.ts`** — a dependency-free pure module:
  `LANG_BY_EXT` (extension → Prism language id, lines 11-42), `fileExt`, `prismLang(file)`
  (lines 60-62), `detectMode(file)` (markdown / code / text). Currently mapped: ts/tsx,
  js/jsx, rust, python, java, json, css/scss, **markup (html/htm/xml/svg/vue)**, bash,
  toml, ini/cfg/conf, properties (+`.env`), yaml.
- **`src/components/FileViewer/prism.ts`** — **statically imports** the curated Prism
  components (lines 5-18: typescript, jsx, tsx, rust, python, java, json, bash, toml,
  ini, properties, yaml, markdown) and exposes pure `highlightToHtml(code, lang)`
  (lines 30-32) that falls back to escaped plain text when `Prism.languages[lang]` is
  absent. The file comment states the rationale: "the curated language set is imported
  statically (small, deterministic — no async flashes)."
- **`fileType.test.ts`** asserts the ext→lang mappings.

**Which of the card's languages are already covered:** Java ✓, Rust ✓, JavaScript ✓,
HTML ✓ (`markup`), CSS ✓, JSON ✓, YAML ✓, Python ✓, **POM** ✓ (Maven `pom.xml` →
`xml` → `markup`, already mapped).

**Missing → to add:** **C#** (`cs`→`csharp`), **Go** (`go`→`go`), **Lua**
(`lua`→`lua`), **SQL** (`sql`→`sql`), **Ruby** (`rb`→`ruby`), **PHP** (`php`→`php`),
**Gradle** (`gradle`→`groovy` for Groovy DSL; `kts`/`kt`→`kotlin` for the Kotlin DSL).

**Decided approach (autonomous — see Notes/ASSUMPTIONS.md):**

**Keep the existing static-import approach (do NOT lazy-load).** The card says "consider
lazy loading … *if a naive approach is slow or hard to maintain*." A naive static
extension is **neither** here: (a) this is a **Tauri desktop app** — the bundle is loaded
from local disk, not over a network, so a few extra tiny Prism components (~KB each) have
negligible load/parse cost; (b) it's trivially maintainable — add an import + a map
entry, exactly as #150 did for Java/ini/properties; and (c) static keeps the
**deterministic, no-async-flash** behavior the current code deliberately chose (lazy
loading would show unhighlighted code then re-highlight — a UX regression). So extend
statically.

1. **`prism.ts`** — add the missing components **in Prism dependency order** (deps before
   dependents): `prism-csharp` (extends clike), `prism-kotlin` (extends clike),
   `prism-groovy` (extends clike), `prism-go`, `prism-lua`, `prism-sql`, `prism-ruby`,
   and **`prism-markup-templating` *before* `prism-php`** (php depends on it). Verify each
   grammar resolves (`Prism.languages.<lang>` defined) so `highlightToHtml` highlights
   rather than falling back.
2. **`fileType.ts`** — add to `LANG_BY_EXT`: `cs: "csharp"`, `go: "go"`, `lua: "lua"`,
   `sql: "sql"`, `rb: "ruby"`, `php: "php"`, `gradle: "groovy"`, `kts: "kotlin"`,
   `kt: "kotlin"` (optionally `phtml: "php"`). POM needs no change (already `xml`→markup);
   optionally confirm `pom.xml` resolves via the existing `xml` mapping.
3. **`fileType.test.ts`** — add assertions for each new mapping (e.g. `prismLang("a.cs")
   === "csharp"`, `…("build.gradle") === "groovy"`, `…("build.gradle.kts") ===
   "kotlin"`, `…("pom.xml") === "markup"`).

**Out of scope:**

- **Lazy loading** — explicitly evaluated and rejected for this desktop app (see rationale
  above); revisit only if a future bundle audit flags Prism as a problem.
- The **diff viewer** — a separate card ("Extend the syntax highlighting … to the diff
  viewer") will reuse `prismLang` + `highlightToHtml`; that task depends on this one.
- Markdown rendering (handled as a render mode, not via this map) and the editable
  raw/textarea path (#148) — unchanged.
- Adding languages beyond the card's list.

**Cross-platform (hard requirement):** pure frontend; language detection is by file
extension (paths are repo-relative `/`-separated from the backend); no OS-specific code;
identical on macOS and Windows.

**Subtasks**

1. [ ] Add the missing Prism component imports to `prism.ts` in dependency order
   (markup-templating before php; clike-based ones after core).
2. [ ] Add the new extension→language entries to `LANG_BY_EXT` in `fileType.ts`.
3. [ ] Extend `fileType.test.ts` with the new mappings (incl. `pom.xml`→markup,
   `.gradle`→groovy, `.gradle.kts`→kotlin).
4. [ ] Sanity-check that opening a `.cs` / `.go` / `.lua` / `.sql` / `.rb` / `.php` /
   `.gradle` / `.gradle.kts` file highlights (not plain-text fallback).
5. [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check` pass (bundle
   builds; no Prism dependency-order errors).

**Acceptance criteria**

- [ ] Opening files of these types in the FileViewer shows **syntax highlighting**: C#
      (`.cs`), Go (`.go`), Lua (`.lua`), SQL (`.sql`), Ruby (`.rb`), PHP (`.php`), Gradle
      (`.gradle` Groovy, `.gradle.kts`/`.kt` Kotlin), plus the already-supported Java,
      Rust, JS/TS, HTML/XML (incl. Maven `pom.xml`), CSS, JSON, YAML, Python.
- [ ] Highlighting appears **immediately with no async flash** (static bundle, as today);
      an uncurated file still falls back to escaped plain text.
- [ ] `prismLang`/`highlightToHtml` remain the pure, reusable surface (so the later
      diff-viewer task can reuse them unchanged).
- [ ] `npm run build`, `npm run lint`, `npm test`, `npm run format:check` pass.

**Notes**

- **Autonomous decisions (user not answering; logged in `ASSUMPTIONS.md`):**
  - *Static imports, not lazy loading* — per the card's own criterion (lazy only "if a
    naive approach is slow or hard to maintain"): a desktop app with local bundle + tiny
    components is neither, and static preserves the deterministic no-flash UX. Documented
    so a reviewer sees the choice was deliberate.
  - *POM = the existing `xml`→`markup` mapping* (Maven `pom.xml` is XML); *Gradle* = Groovy
    (`.gradle`) + Kotlin (`.gradle.kts`/`.kt`).
  - *Mind Prism's dependency order* (markup-templating before php; clike-extenders after
    core) — a wrong order silently disables a grammar.
- **Depends on: none** — extends the shipped FileViewer (#44/#150). The diff-viewer
  highlighting card depends on **this** task (it reuses `prismLang`/`highlightToHtml`).
- References: `src/components/FileViewer/fileType.ts:11-62` (`LANG_BY_EXT`/`prismLang`),
  `prism.ts:5-32` (static imports + `highlightToHtml`), `fileType.test.ts` (mapping tests).
