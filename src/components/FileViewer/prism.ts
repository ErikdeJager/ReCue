// Prism setup (#44): the curated language set is imported statically (small,
// deterministic — no async flashes); uncurated languages fall back to escaped
// plain text. Order matters — tsx depends on jsx + typescript, both of which
// depend on javascript (in Prism core, alongside markup/css/clike).
import Prism from "prismjs";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-python";
import "prismjs/components/prism-java"; // extends clike (Prism core), #150
import "prismjs/components/prism-json";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-toml";
import "prismjs/components/prism-ini"; // INI / .env / config (#150)
import "prismjs/components/prism-properties"; // .properties / .env (#150)
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
// Additional curated languages (#227). Dependency order matters: clike-based grammars
// (csharp/kotlin/groovy) come after core (clike ships in Prism core), and
// markup-templating MUST precede php (php extends it) — a wrong order silently
// disables the grammar, dropping it to the plain-text fallback.
import "prismjs/components/prism-csharp"; // C# (.cs) — extends clike
import "prismjs/components/prism-kotlin"; // Gradle Kotlin DSL (.gradle.kts/.kt) — extends clike
import "prismjs/components/prism-groovy"; // Gradle Groovy DSL (.gradle) — extends clike
import "prismjs/components/prism-go"; // Go (.go)
import "prismjs/components/prism-lua"; // Lua (.lua)
import "prismjs/components/prism-sql"; // SQL (.sql)
import "prismjs/components/prism-ruby"; // Ruby (.rb)
import "prismjs/components/prism-markup-templating"; // required by php (must precede it)
import "prismjs/components/prism-php"; // PHP (.php) — depends on markup-templating

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Highlight `code` for `lang` into Prism token markup. Prism HTML-escapes the
 * source and only adds its own `<span class="token …">` wrappers, so the result
 * is safe to inject — no raw file HTML reaches the DOM. Falls back to escaped
 * plain text when the language isn't in the curated bundle.
 */
export function highlightToHtml(code: string, lang: string): string {
  const grammar = Prism.languages[lang];
  return grammar ? Prism.highlight(code, grammar, lang) : escapeHtml(code);
}
