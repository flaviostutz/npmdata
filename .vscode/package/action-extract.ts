/* eslint-disable no-console */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { NpmdataExtractEntry } from '../types';

import { buildExtractCommand, buildPurgeCommand } from './commands';
import { applySymlinks } from './symlinks';
import { applyContentReplacements } from './content-replacements';

/**
 * Run a shell command, capturing its stdout while inheriting stderr.
 * The captured stdout is immediately written to process.stdout so the caller
 * sees it in real time (well, after the child exits).  Returns the full
 * captured stdout string and the child's exit code.  Non-zero exit codes do
 * NOT throw; callers are responsible for checking exitCode.
 */
export function runCommandCapture(
  command: string,
  cwd: string,
): { stdout: string; exitCode: number } {
  // eslint-disable-next-line functional/no-try-statements
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const stdout =
      (execSync(command, {
        encoding: 'utf8',
        cwd,
        stdio: ['inherit', 'pipe', 'inherit'],
      }) as string) ?? '';
    process.stdout.write(stdout);
    return { stdout, exitCode: 0 };
  } catch (error: unknown) {
    const err = error as { stdout?: string; status?: number };
    const stdout = err.stdout ?? '';
    process.stdout.write(stdout);
    return { stdout, exitCode: err.status ?? 1 };
  }
}

// eslint-disable-next-line complexity
export function runExtract(
  entries: NpmdataExtractEntry[],
  excludedEntries: NpmdataExtractEntry[],
  cliPath: string,
  runCwd: string,
  dryRunFromArgv: boolean,
  silentFromArgv: boolean,
  verboseFromArgv: boolean,
  noGitignoreFromArgv: boolean,
  unmanagedFromArgv: boolean,
): void {
  if (verboseFromArgv) {
    console.log(
      `[verbose] extract: processing ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} (cwd: ${runCwd})`,
    );
  }
  let totalAdded = 0;
  let totalModified = 0;
  let totalDeleted = 0;
  let totalSkipped = 0;
  let entryIndex = 0;
  for (const entry of entries) {
    const effectiveSilent = entry.silent || silentFromArgv;
    if (entryIndex > 0 && !effectiveSilent) {
      process.stdout.write('\n');
    }
    entryIndex += 1;
    const effectiveEntry: NpmdataExtractEntry = {
      ...entry,
      output: {
        ...entry.output,
        dryRun: entry.output?.dryRun || dryRunFromArgv,
        ...(noGitignoreFromArgv ? { gitignore: false } : {}),
        ...(unmanagedFromArgv ? { unmanaged: true } : {}),
      },
      silent: effectiveSilent,
      verbose: entry.verbose || verboseFromArgv,
    };
    if (verboseFromArgv) {
      console.log(
        `[verbose] extract: entry package=${entry.package} outputDir=${entry.output.path}`,
      );
    }
    fs.mkdirSync(path.resolve(runCwd, entry.output.path), { recursive: true });
    const command = buildExtractCommand(cliPath, effectiveEntry, runCwd);
    if (verboseFromArgv) {
      console.log(`[verbose] extract: running command: ${command}`);
    }
    const { stdout: extractStdout, exitCode: extractExitCode } = runCommandCapture(command, runCwd);
    if (extractExitCode !== 0) {
      throw Object.assign(new Error('extract failed'), { status: extractExitCode });
    }
    const extractMatch = extractStdout.match(
      /Extraction complete:\s*(\d+) added,\s*(\d+) modified,\s*(\d+) deleted,\s*(\d+) skipped/,
    );
    if (extractMatch) {
      totalAdded += Number.parseInt(extractMatch[1], 10);
      totalModified += Number.parseInt(extractMatch[2], 10);
      totalDeleted += Number.parseInt(extractMatch[3], 10);
      totalSkipped += Number.parseInt(extractMatch[4], 10);
    }
    if (!effectiveEntry.output?.dryRun) {
      if (verboseFromArgv) {
        console.log(`[verbose] extract: applying symlinks for ${entry.package}`);
      }
      applySymlinks(effectiveEntry, runCwd);
      if (verboseFromArgv) {
        console.log(`[verbose] extract: applying content replacements for ${entry.package}`);
      }
      applyContentReplacements(entry, runCwd);
    }
  }

  // When a tag filter is active, purge managed files from excluded entries so that
  // the output directory contains only files from the currently active tag group.
  // Suppress the "Purging managed files..." banner for these implicit purges.
  for (const entry of excludedEntries) {
    if (verboseFromArgv) {
      console.log(`[verbose] extract: purging excluded entry ${entry.package} (tag filter active)`);
    }
    const effectiveEntry: NpmdataExtractEntry = {
      ...entry,
      output: {
        ...entry.output,
        dryRun: entry.output?.dryRun || dryRunFromArgv,
      },
      silent: true,
    };
    const command = buildPurgeCommand(cliPath, effectiveEntry, runCwd);
    execSync(command, { stdio: 'inherit', cwd: runCwd });
  }

  if (!silentFromArgv && entries.length > 1) {
    process.stdout.write(
      `\nTotal extracted: ${totalAdded} added, ${totalModified} modified, ${totalDeleted} deleted, ${totalSkipped} skipped${dryRunFromArgv ? ' (dry run)' : ''}\n`,
    );
  }
}
