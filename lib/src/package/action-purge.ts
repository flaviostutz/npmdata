/* eslint-disable complexity */
/* eslint-disable no-console */
import { NpmdataExtractEntry } from '../types';

import { buildPurgeCommand } from './commands';
import { applySymlinks } from './symlinks';
import { runCommandCapture } from './action-extract';

export function runPurge(
  entries: NpmdataExtractEntry[],
  cliPath: string,
  runCwd: string,
  dryRunFromArgv: boolean,
  silentFromArgv: boolean,
  verboseFromArgv: boolean,
): void {
  if (verboseFromArgv) {
    console.log(
      `[verbose] purge: processing ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} (cwd: ${runCwd})`,
    );
  }
  let totalDeleted = 0;
  let purgeIndex = 0;
  for (const entry of entries) {
    const effectiveSilent = entry.silent || silentFromArgv;
    if (purgeIndex > 0 && !effectiveSilent) {
      process.stdout.write('\n');
    }
    purgeIndex += 1;
    const effectiveEntry: NpmdataExtractEntry = {
      ...entry,
      output: {
        ...entry.output,
        dryRun: entry.output?.dryRun || dryRunFromArgv,
      },
      silent: effectiveSilent,
      verbose: entry.verbose || verboseFromArgv,
    };
    if (verboseFromArgv) {
      console.log(`[verbose] purge: entry package=${entry.package} outputDir=${entry.output.path}`);
    }
    const command = buildPurgeCommand(cliPath, effectiveEntry, runCwd);
    if (verboseFromArgv) {
      console.log(`[verbose] purge: running command: ${command}`);
    }
    const { stdout: purgeStdout, exitCode: purgeExitCode } = runCommandCapture(command, runCwd);
    if (purgeExitCode !== 0) {
      throw Object.assign(new Error('purge failed'), { status: purgeExitCode });
    }
    const purgeMatch = purgeStdout.match(/Purge complete:\s*(\d+) deleted/);
    if (purgeMatch) {
      totalDeleted += Number.parseInt(purgeMatch[1], 10);
    }
    if (!effectiveEntry.output?.dryRun) {
      if (verboseFromArgv) {
        console.log(`[verbose] purge: cleaning up symlinks for ${entry.package}`);
      }
      applySymlinks(effectiveEntry, runCwd);
    }
  }
  if (!silentFromArgv && entries.length > 1) {
    process.stdout.write(`\nTotal purged: ${totalDeleted}${dryRunFromArgv ? ' (dry run)' : ''}\n`);
  }
}
