function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx >= 0 ? path.slice(idx + 1) : path;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function deriveToolTarget(
  toolName: string | null,
  toolInput: unknown,
): string {
  if (!toolName) return "";
  if (!toolInput || typeof toolInput !== "object") return "";
  const input = toolInput as Record<string, unknown>;

  switch (toolName) {
    case "Bash":
      return asString(input.command);
    case "Edit":
    case "Write":
    case "Read":
      return basename(asString(input.file_path));
    case "Grep": {
      const pattern = asString(input.pattern);
      const path = asString(input.path);
      return path ? `"${pattern}" ${path}` : `"${pattern}"`;
    }
    case "Glob":
      return asString(input.pattern);
    case "WebFetch": {
      const url = asString(input.url);
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    }
    case "WebSearch":
      return asString(input.query);
    case "Task":
    case "Agent": {
      const sub = asString(input.subagent_type) || asString(input.description);
      return sub ? `→ ${sub}` : "";
    }
    default:
      return "";
  }
}
