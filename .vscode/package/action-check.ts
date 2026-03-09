/* eslint-disable no-console */
import { NpmdataExtractEntry } from '../types';

import { buildCheckCommand } from './commands';
import { checkContentReplacements } from './content-replacements';
import { runCommandCapture } from './action-extract';

export function runCheck(
  entries: NpmdataExtractEntry[],
  cliPath: string,
  runCwd: string,
  verboseFromArgv: boolean,
  unmanagedFromArgv: boolean,
): void {
  const managedEntries = entries.filter((entry) => {
    const isUnmanaged = entry.output?.unmanaged || unmanagedFromArgv;
    if (isUnmanaged && verboseFromArgv) {
      console.log(
        `[verbose] check: skipping unmanaged entry package=${entry.package} outputDir=${entry.output.path}`,
      );
    }
    return !isUnmanaged;
  });
  if (verboseFromArgv) {
    console.log(
      `[verbose] check: verifying ${managedEntries.length} entr${managedEntries.length === 1 ? 'y' : 'ies'} (cwd: ${runCwd})`,
    );
  }
  let outOfSyncFiles: string[] = [];
  let checkIndex = 0;
  for (const entry of managedEntries) {
    if (checkIndex > 0) {
      process.stdout.write('\n');
    }
    checkIndex += 1;
    if (verboseFromArgv) {
      console.log(
        `[verbose] check: checking package=${entry.package} outputDir=${entry.output.path}`,
      );
    }
    const effectiveEntry: NpmdataExtractEntry = {
      ...entry,
      verbose: entry.verbose || verboseFromArgv,
    };
    const command = buildCheckCommand(cliPath, effectiveEntry, runCwd);
    if (verboseFromArgv) {
      console.log(`[verbose] check: running command: ${command}`);
    }
    const { exitCode: checkExitCode } = runCommandCapture(command, runCwd);
    if (checkExitCode !== 0) {
      throw Object.assign(new Error('check failed'), { status: checkExitCode });
    }
    if (verboseFromArgv) {
      console.log(`[verbose] check: checking content replacements for ${entry.package}`);
    }
    const entryOutOfSync = checkContentReplacements(entry, runCwd);
    for (const f of entryOutOfSync) {
      process.stderr.write(`content-replacement out of sync: ${f}\n`);
    }
    // eslint-disable-next-line functional/immutable-data
    outOfSyncFiles = [...outOfSyncFiles, ...entryOutOfSync];
  }
  if (outOfSyncFiles.length > 0) {
    throw Object.assign(new Error('content-replacements out of sync'), { status: 1 });
  }
  if (managedEntries.length > 1) {
    process.stdout.write(`\nTotal checked: ${managedEntries.length} packages\n`);
  }
}
