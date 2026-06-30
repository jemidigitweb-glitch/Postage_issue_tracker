import { readdirSync, statSync } from "fs";
import path from "path";

export interface FolderItem {
  name: string;
  type: "file" | "folder";
}

const SKIP = new Set([".git", ".next", ".claude", "node_modules", "ui"]);

export function isFolderReadable(relPath: string): boolean {
  const aiosRoot = path.resolve(process.cwd(), "..");
  const absolutePath = path.join(aiosRoot, relPath);
  if (!absolutePath.startsWith(aiosRoot + path.sep)) return false;
  try {
    return statSync(absolutePath).isDirectory();
  } catch {
    return false;
  }
}

export function readFolder(relPath: string): FolderItem[] {
  const aiosRoot = path.resolve(process.cwd(), "..");
  const absolutePath = path.join(aiosRoot, relPath);

  try {
    return readdirSync(absolutePath)
      .filter((name) => !name.startsWith(".") && !SKIP.has(name))
      .map((name) => {
        const stat = statSync(path.join(absolutePath, name));
        return {
          name,
          type: stat.isDirectory() ? ("folder" as const) : ("file" as const),
        };
      })
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}
