/* eslint-disable no-console */
import { execSync } from 'node:child_process';
import path from 'node:path';

import { NpmdataExtractEntry } from '../types';

import { buildListCommand } from './commands';

export function runList(
  allEntries: NpmdataExtractEntry[],
  cliPath: string,
  runCwd: string,
  verboseFromArgv: boolean,
): void {
  // Collect unique resolved output dirs (tag filter not applied; list is informational).
  const seenDirs = new Set<string>();
  if (verboseFromArgv) {
    console.log(
      `[verbose] list: listing managed files across ${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'} (cwd: ${runCwd})`,
    );
  }
  for (const entry of allEntries) {
    const resolvedDir = path.resolve(runCwd, entry.output.path);
    if (!seenDirs.has(resolvedDir)) {
      seenDirs.add(resolvedDir);
      if (verboseFromArgv) {
        console.log(`[verbose] list: scanning directory ${resolvedDir}`);
      }
      const command = buildListCommand(cliPath, entry.output.path, runCwd, verboseFromArgv);
      execSync(command, { stdio: 'inherit', cwd: runCwd });
    }
  }
}
