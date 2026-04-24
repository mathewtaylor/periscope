import { describe, expect, test } from "bun:test";
import { extractColumns, IngestError, isValidEventName } from "./ingest.ts";

describe("isValidEventName", () => {
  test("accepts Claude Code event names", () => {
    for (const name of [
      "SessionStart",
      "PreToolUse",
      "PostToolUseFailure",
      "Notification",
      "A",
    ]) {
      expect(isValidEventName(name)).toBe(true);
    }
  });
  test("rejects bad names", () => {
    for (const name of ["", "1abc", "with space", "dash-case", "a".repeat(65)]) {
      expect(isValidEventName(name)).toBe(false);
    }
  });
});

describe("extractColumns", () => {
  test("extracts correlation fields", () => {
    const body = JSON.stringify({
      session_id: "s1",
      hook_event_name: "PreToolUse",
      cwd: "/tmp/demo",
      agent_id: "a1",
      agent_type: "Explore",
      tool_name: "Edit",
      tool_use_id: "u1",
      tool_input: { file_path: "/tmp/x.ts" },
    });
    const row = extractColumns("PreToolUse", body);
    expect(row.event).toBe("PreToolUse");
    expect(row.session_id).toBe("s1");
    expect(row.cwd).toBe("/tmp/demo");
    expect(row.agent_id).toBe("a1");
    expect(row.agent_type).toBe("Explore");
    expect(row.tool_name).toBe("Edit");
    expect(row.tool_use_id).toBe("u1");
    expect(row.payload).toBe(body);
  });

  test("fills missing optional fields with null", () => {
    const row = extractColumns(
      "SessionStart",
      JSON.stringify({ session_id: "s1" }),
    );
    expect(row.agent_id).toBeNull();
    expect(row.tool_name).toBeNull();
    expect(row.tool_use_id).toBeNull();
    expect(row.cwd).toBeNull();
  });

  test("rejects invalid event name with 400", () => {
    try {
      extractColumns("bad name", JSON.stringify({ session_id: "s1" }));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IngestError);
      expect((err as IngestError).status).toBe(400);
    }
  });

  test("rejects missing session_id with 400", () => {
    try {
      extractColumns("SessionStart", JSON.stringify({ foo: "bar" }));
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IngestError);
      expect((err as IngestError).status).toBe(400);
    }
  });

  test("rejects invalid JSON with 400", () => {
    try {
      extractColumns("SessionStart", "not-json");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(IngestError);
      expect((err as IngestError).status).toBe(400);
    }
  });
});
