/**
 * Project scanner — gathers real data from the codebase for documentation.
 * Outputs JSON to stdout.
 *
 * Run: npx tsx scripts/scan_project.ts > /tmp/scan.json
 */

import * as fs from "fs";
import * as path from "path";

interface FileInfo {
  path: string;
  lines: number;
  exports: string[];
  imports: string[];
}

function scanFile(filePath: string): FileInfo {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n").length;
  // Extract exports
  const exportMatches = content.matchAll(
    /^export\s+(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/gm,
  );
  const exports = Array.from(exportMatches).map((m) => m[1]);
  // Extract imports (just the source paths)
  const importMatches = content.matchAll(
    /(?:import|export)\s+(?:[\s\S]*?)\s+from\s+["']([^"']+)["']/gm,
  );
  const imports = Array.from(importMatches).map((m) => m[1]);
  return { path: filePath, lines, exports, imports };
}

function walkDir(dir: string, ext: string[] = [".ts", ".tsx"]): string[] {
  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
      results.push(...walkDir(full, ext));
    } else if (ext.some((e) => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

const root = "/home/z/my-project";
const srcFiles = walkDir(path.join(root, "src"));
const scriptFiles = walkDir(path.join(root, "scripts"));

const srcInfos = srcFiles.map((f) => scanFile(f));
const scriptInfos = scriptFiles.map((f) => scanFile(f));

// Build import graph: who imports what (resolved to relative path)
function resolveImport(from: string, to: string): string | null {
  if (to.startsWith("@/")) {
    // @/lib/foo → src/lib/foo
    return path.join(root, "src", to.slice(2)) + ".ts";
  }
  if (to.startsWith("./") || to.startsWith("../")) {
    return path.resolve(path.dirname(from), to) + ".ts";
  }
  return null; // external package
}

const importGraph: Record<string, string[]> = {};
for (const info of srcInfos) {
  const resolved = info.imports
    .map((imp) => resolveImport(info.path, imp))
    .filter((p): p is string => !!p && fs.existsSync(p));
  importGraph[info.path] = resolved;
}

// Who imports each module?
const importedBy: Record<string, string[]> = {};
for (const [importer, imports] of Object.entries(importGraph)) {
  for (const imported of imports) {
    if (!importedBy[imported]) importedBy[imported] = [];
    importedBy[imported].push(importer);
  }
}

// Summary
const summary = {
  generatedAt: new Date().toISOString(),
  root,
  totals: {
    srcFiles: srcInfos.length,
    scriptFiles: scriptInfos.length,
    srcLines: srcInfos.reduce((s, f) => s + f.lines, 0),
    scriptLines: scriptInfos.reduce((s, f) => s + f.lines, 0),
  },
  srcFiles: srcInfos.sort((a, b) => b.lines - a.lines),
  scriptFiles: scriptInfos.sort((a, b) => b.lines - a.lines),
  importGraph,
  importedBy,
};

console.log(JSON.stringify(summary, null, 2));
