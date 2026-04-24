import { describe, expect, test } from "bun:test";
import { deriveToolTarget } from "./toolTarget.ts";

describe("deriveToolTarget", () => {
  test("Bash → command", () => {
    expect(deriveToolTarget("Bash", { command: "npm test" })).toBe("npm test");
  });

  test("Edit → basename of file_path", () => {
    expect(
      deriveToolTarget("Edit", { file_path: "/home/u/src/foo.ts" }),
    ).toBe("foo.ts");
  });

  test("Read on Windows path → basename", () => {
    expect(
      deriveToolTarget("Read", {
        file_path: "C:\\Users\\mathe\\Workspace\\foo.ts",
      }),
    ).toBe("foo.ts");
  });

  test("Grep formats pattern + path", () => {
    expect(
      deriveToolTarget("Grep", { pattern: "TODO", path: "src/" }),
    ).toBe('"TODO" src/');
  });

  test("Grep without path omits trailing space", () => {
    expect(deriveToolTarget("Grep", { pattern: "TODO" })).toBe('"TODO"');
  });

  test("WebFetch → hostname", () => {
    expect(
      deriveToolTarget("WebFetch", {
        url: "https://example.com/some/path?q=1",
      }),
    ).toBe("example.com");
  });

  test("WebFetch with invalid URL falls back", () => {
    expect(deriveToolTarget("WebFetch", { url: "not-a-url" })).toBe("not-a-url");
  });

  test("Task → subagent type arrow", () => {
    expect(
      deriveToolTarget("Task", {
        subagent_type: "Explore",
        description: "find it",
      }),
    ).toBe("→ Explore");
  });

  test("unknown tool → empty", () => {
    expect(deriveToolTarget("NewTool", { foo: 1 })).toBe("");
  });

  test("null tool → empty", () => {
    expect(deriveToolTarget(null, { file_path: "/x" })).toBe("");
  });

  test("non-object input → empty", () => {
    expect(deriveToolTarget("Bash", null)).toBe("");
    expect(deriveToolTarget("Bash", "no")).toBe("");
  });
});
