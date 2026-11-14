import { rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
const execFileAsync = promisify(execFile);

// Prepare and verify on the destination volume BEFORE quitting the running app.
export async function stageAppUpdate(source: string, target: string, operations = {
  copy: async (from: string, to: string) => { await execFileAsync("ditto", [from,to]); },
  verify: async (path: string) => { await execFileAsync("codesign",["--verify","--deep","--strict",path]); }
}): Promise<string> {
  const staged = `${target.replace(/\.app$/, "")}.update-${randomUUID()}.app`;
  try { await operations.copy(source,staged); await operations.verify(staged); return staged; }
  catch(error) { await rm(staged,{recursive:true,force:true}); throw error; }
}

export function buildUpdateActivationScript(): string {
  return [
    'set -eu',
    'PID=$1; STAGED=$2; TARGET=$3; BACKUP=$4; MOUNT=$5; TEMP=$6; LOG=$7',
    'exec >>"$LOG" 2>&1',
    'for _ in $(seq 1 150); do',
    '  if ! kill -0 "$PID" 2>/dev/null; then break; fi',
    '  sleep 0.2',
    'done',
    'if kill -0 "$PID" 2>/dev/null; then echo "App wurde nicht beendet; Update nicht aktiviert."; exit 1; fi',
    'test -d "$STAGED"',
    'mv "$TARGET" "$BACKUP"',
    'if ! mv "$STAGED" "$TARGET"; then mv "$BACKUP" "$TARGET"; echo "Update fehlgeschlagen; bisherige App wiederhergestellt."; exit 1; fi',
    // Keep the old app as a recoverable backup. Never remove quarantine here.
    'if ! open -n "$TARGET"; then mv "$TARGET" "$STAGED"; mv "$BACKUP" "$TARGET"; echo "Start fehlgeschlagen; bisherige App wiederhergestellt."; exit 1; fi',
    'hdiutil detach "$MOUNT" -quiet || true',
    'rm -rf "$TEMP"',
    'echo "Update aktiviert; bisherige App als Backup erhalten."'
  ].join('\n');
}
