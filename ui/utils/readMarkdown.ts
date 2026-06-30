import { readFileSync } from "fs";
import path from "path";

export function readMarkdown(slugParts: string[]): string | null {
  const aiosRoot = path.resolve(process.cwd(), "..");
  const relPath = path.join(...slugParts);
  const absolutePath = path.resolve(aiosRoot, relPath);

  // Prevent path traversal — file must stay inside the AIOS root
  if (!absolutePath.startsWith(aiosRoot + path.sep)) {
    return null;
  }

  // Only serve .md files
  if (!absolutePath.toLowerCase().endsWith(".md")) {
    return null;
  }

  try {
    return readFileSync(absolutePath, "utf-8");
  } catch {
    return null;
  }
}
