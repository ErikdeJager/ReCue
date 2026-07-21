import { describe, expect, it } from "vitest";

import {
  detectMode,
  fileExt,
  fileIconKind,
  isViewableFile,
  prismLang,
} from "./fileType";

describe("file type detection (#44)", () => {
  it("treats markdown as render mode", () => {
    expect(detectMode("README.md")).toBe("markdown");
    expect(detectMode("docs/PLAN.markdown")).toBe("markdown");
  });

  it("treats curated code extensions as code with a Prism language", () => {
    expect(detectMode("src/main.rs")).toBe("code");
    expect(prismLang("src/main.rs")).toBe("rust");
    expect(prismLang("a/b/App.tsx")).toBe("tsx");
    expect(prismLang("x.py")).toBe("python");
    expect(prismLang("Cargo.toml")).toBe("toml");
  });

  it("highlights Java + config formats (#150)", () => {
    expect(detectMode("src/Main.java")).toBe("code");
    expect(prismLang("src/Main.java")).toBe("java");
    expect(prismLang("settings.ini")).toBe("ini");
    expect(prismLang("app.cfg")).toBe("ini");
    expect(prismLang("nginx.conf")).toBe("ini");
    expect(prismLang("gradle.properties")).toBe("properties");
  });

  it("highlights the extended language set (#227)", () => {
    expect(detectMode("Service.cs")).toBe("code");
    expect(prismLang("Service.cs")).toBe("csharp");
    expect(prismLang("main.go")).toBe("go");
    expect(prismLang("init.lua")).toBe("lua");
    expect(prismLang("schema.sql")).toBe("sql");
    expect(prismLang("app.rb")).toBe("ruby");
    expect(prismLang("index.php")).toBe("php");
    expect(prismLang("page.phtml")).toBe("php");
    // Gradle: Groovy DSL vs Kotlin DSL by extension.
    expect(prismLang("build.gradle")).toBe("groovy");
    expect(prismLang("build.gradle.kts")).toBe("kotlin");
    expect(prismLang("Build.kt")).toBe("kotlin");
    // POM is XML → markup via the existing mapping (no new entry needed).
    expect(prismLang("pom.xml")).toBe("markup");
  });

  it("highlights .env dotfiles by filename (no extension) (#150)", () => {
    expect(detectMode(".env")).toBe("code");
    expect(prismLang(".env")).toBe("properties");
    expect(prismLang("project/.env.local")).toBe("properties");
    expect(prismLang(".env.production")).toBe("properties");
    // A normal dotfile is still plain text, not a config grammar.
    expect(prismLang(".gitignore")).toBeUndefined();
  });

  it("treats unknown / plain files as raw text", () => {
    expect(detectMode("notes.txt")).toBe("text");
    expect(detectMode("LICENSE")).toBe("text");
    expect(detectMode("data.unknownext")).toBe("text");
    expect(prismLang("notes.txt")).toBeUndefined();
  });

  it("extracts the extension case-insensitively, ignoring dotfiles", () => {
    expect(fileExt("Main.RS")).toBe("rs");
    expect(fileExt("a/b/c.test.ts")).toBe("ts");
    expect(fileExt(".gitignore")).toBe("");
    expect(fileExt("Makefile")).toBe("");
  });
});

describe("viewability gate for the all-types file tree (task 455)", () => {
  it("treats text, code, extensionless, and svg files as viewable", () => {
    expect(isViewableFile("a.md")).toBe(true);
    expect(isViewableFile("src/x.ts")).toBe(true);
    expect(isViewableFile("LICENSE")).toBe(true);
    expect(isViewableFile("Dockerfile")).toBe(true);
    // SVG is markup the viewer highlights — never a binary.
    expect(isViewableFile("icon.svg")).toBe(true);
  });

  it("treats the mirrored SKIP_EXTS binary formats as non-viewable", () => {
    expect(isViewableFile("logo.png")).toBe(false);
    expect(isViewableFile("a.zip")).toBe(false);
    expect(isViewableFile("x.dylib")).toBe(false);
    expect(isViewableFile("movie.mp4")).toBe(false);
  });

  it("matches case-insensitively and across Windows separators", () => {
    expect(isViewableFile("LOGO.PNG")).toBe(false);
    expect(isViewableFile("sub\\logo.png")).toBe(false);
    expect(isViewableFile("sub\\notes.md")).toBe(true);
  });

  it("picks the row icon family: text, image, or generic binary", () => {
    expect(fileIconKind("README.md")).toBe("text");
    expect(fileIconKind("LICENSE")).toBe("text");
    expect(fileIconKind("icon.svg")).toBe("text");
    expect(fileIconKind("logo.png")).toBe("image");
    expect(fileIconKind("photo.JPEG")).toBe("image");
    expect(fileIconKind("bundle.zip")).toBe("binary");
    expect(fileIconKind("track.mp3")).toBe("binary");
  });
});
