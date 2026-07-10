// Copies static assets into the Next.js standalone build output.
// Replaces `cp -r`, which is POSIX-only and unavailable on plain Windows.
// Run after `next build` (output: "standalone" in next.config.ts).
import { cpSync } from "node:fs";

cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
cpSync("public", ".next/standalone/public", { recursive: true });
