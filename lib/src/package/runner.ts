/* eslint-disable no-console */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { NpmdataConfig, NpmdataExtractEntry } from '../types';

import {
  parseOutputFromArgv,
  parseDryRunFromArgv,
  parseSilentFromArgv,
  parseVerboseFromArgv,
  parseNoGitignoreFromArgv,
  parseUnmanagedFromArgv,
  parsePresetsFromArgv,
  filterEntriesByPresets,
} from './argv';
import { collectAllPresets, printHelp } from './help';
import { runExtract } from './action-extract';
import { runCheck } from './action-check';
import { runList } from './action-list';
import { runPurge } from './action-purge';

type PackageJson = {
  name: string;
  npmdata?: NpmdataConfig;
};

/**
 * Run a given action for a list of pre-loaded npmdata entries.
 * Parses common flags (--presets, --output, --dry-run, --silent, --verbose, --no-gitignore,
 * --unmanaged) from argv and delegates to the appropriate action handler.
 *
 * Called from the CLI when a cosmiconfig configuration file is found and --packages is not
 * provided, so the same runner logic used by embedded data-package runners is reused.
 *
 * @param allEntries - Array of NpmdataExtractEntry loaded from the configuration.
 * @param action     - One of 'extract', 'check', 'list', 'purge'.
 * @param argv       - Full process.argv (or equivalent); [0] and [1] are the node binary and
 *                     script path which are sliced off internally.
 * @param cliPath    - Absolute path to the npmdata CLI main.js that sub-processes will invoke.
 */
export function runEntries(
  allEntries: NpmdataExtractEntry[],
  action: string,
  argv: string[],
  cliPath: string,
  postExtractScript?: string,
): void {
  const userArgs = argv.slice(2);
  const requestedPresets = parsePresetsFromArgv(argv);
  const entries = filterEntriesByPresets(allEntries, requestedPresets);
  const excludedEntries =
    requestedPresets.length > 0 ? allEntries.filter((e) => !entries.includes(e)) : [];

  const parsedOutput = parseOutputFromArgv(userArgs);
  const runCwd = parsedOutput ? path.resolve(process.cwd(), parsedOutput) : process.cwd();
  const dryRunFromArgv = parseDryRunFromArgv(userArgs);
  const silentFromArgv = parseSilentFromArgv(userArgs);
  const verboseFromArgv = parseVerboseFromArgv(userArgs);
  const noGitignoreFromArgv = parseNoGitignoreFromArgv(userArgs);
  const unmanagedFromArgv = parseUnmanagedFromArgv(userArgs);

  if (verboseFromArgv) {
    console.log(`[verbose] runner: action=${action} entries=${entries.length} cwd=${runCwd}`);
  }

  // eslint-disable-next-line functional/no-try-statements
  try {
    if (action === 'extract') {
      runExtract(
        entries,
        excludedEntries,
        cliPath,
        runCwd,
        dryRunFromArgv,
        silentFromArgv,
        verboseFromArgv,
        noGitignoreFromArgv,
        unmanagedFromArgv,
      );
      runPostExtractScript(postExtractScript, userArgs, dryRunFromArgv, verboseFromArgv, runCwd);
    } else if (action === 'check') {
      runCheck(entries, cliPath, runCwd, verboseFromArgv, unmanagedFromArgv);
    } else if (action === 'list') {
      runList(allEntries, cliPath, runCwd, verboseFromArgv);
    } else if (action === 'purge') {
      runPurge(entries, cliPath, runCwd, dryRunFromArgv, silentFromArgv, verboseFromArgv);
    }
  } catch (error: unknown) {
    // The child process already printed the error via stdio:inherit.
    // Exit with the child's exit code to suppress the Node.js stack trace.
    const status = (error as { status?: number })?.status;
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(status ?? 1);
  }
}

/**
 * If a postExtractScript is defined in the npmdata config, run it with the same
 * user arguments that were passed to the extract action.
 * Skipped during dry-run. The script receives the full argv slice (action + flags)
 * as appended arguments so it can inspect or react to them.
 */
function runPostExtractScript(
  postExtractScript: string | undefined,
  userArgs: string[],
  dryRun: boolean,
  verbose: boolean,
  cwd: string,
): void {
  if (!postExtractScript || dryRun) return;
  if (verbose) {
    console.log('[verbose] runner: running npmdata:postExtract script');
  }
  const scriptArgs = userArgs.join(' ');
  const command = scriptArgs ? `${postExtractScript} ${scriptArgs}` : postExtractScript;
  execSync(command, { stdio: 'inherit', cwd });
}

/**
 * Runs extraction for each entry defined in the publishable package's package.json "npmdata" array.
 * Invokes the npmdata CLI once per entry so that all CLI output and error handling is preserved.
 * Called from the minimal generated bin script with its own __dirname as binDir.
 *
 * Pass --presets <preset1,preset2> to limit processing to entries whose presets overlap with the given list.
 */
export function run(binDir: string, argv: string[] = process.argv): void {
  const pkgJsonPath = path.join(binDir, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath).toString()) as PackageJson;

  const allEntries: NpmdataExtractEntry[] =
    pkg.npmdata?.sets && pkg.npmdata.sets.length > 0
      ? pkg.npmdata.sets
      : [{ package: pkg.name, output: { path: '.' } }];

  const userArgs = argv.slice(2);

  if (userArgs.includes('--help')) {
    printHelp(pkg.name, collectAllPresets(allEntries));
    return;
  }

  // Default to 'extract' when no action is provided or the first arg is a flag.
  const action = userArgs.length === 0 || userArgs[0].startsWith('-') ? 'extract' : userArgs[0];

  if (!['extract', 'check', 'list', 'purge'].includes(action)) {
    process.stderr.write(
      `Error: unknown action '${action}'. Use 'extract', 'check', 'list', or 'purge'.\n\n`,
    );
    printHelp(pkg.name, collectAllPresets(allEntries));
    return;
  }

  const requestedPresets = parsePresetsFromArgv(argv);
  const entries = filterEntriesByPresets(allEntries, requestedPresets);
  const excludedEntries =
    requestedPresets.length > 0 ? allEntries.filter((e) => !entries.includes(e)) : [];

  const cliPath = require.resolve('npmdata/dist/main.js', { paths: [binDir] });
  const parsedOutput = parseOutputFromArgv(userArgs);
  const runCwd = parsedOutput ? path.resolve(process.cwd(), parsedOutput) : process.cwd();
  const dryRunFromArgv = parseDryRunFromArgv(userArgs);
  const silentFromArgv = parseSilentFromArgv(userArgs);
  const verboseFromArgv = parseVerboseFromArgv(userArgs);
  const noGitignoreFromArgv = parseNoGitignoreFromArgv(userArgs);
  const unmanagedFromArgv = parseUnmanagedFromArgv(userArgs);

  if (verboseFromArgv) {
    console.log(`[verbose] runner: action=${action} entries=${entries.length} cwd=${runCwd}`);
  }

  // eslint-disable-next-line functional/no-try-statements
  try {
    if (action === 'extract') {
      runExtract(
        entries,
        excludedEntries,
        cliPath,
        runCwd,
        dryRunFromArgv,
        silentFromArgv,
        verboseFromArgv,
        noGitignoreFromArgv,
        unmanagedFromArgv,
      );
      runPostExtractScript(
        pkg.npmdata?.postExtractScript,
        userArgs,
        dryRunFromArgv,
        verboseFromArgv,
        runCwd,
      );
    } else if (action === 'check') {
      runCheck(entries, cliPath, runCwd, verboseFromArgv, unmanagedFromArgv);
    } else if (action === 'list') {
      runList(allEntries, cliPath, runCwd, verboseFromArgv);
    } else if (action === 'purge') {
      runPurge(entries, cliPath, runCwd, dryRunFromArgv, silentFromArgv, verboseFromArgv);
    }
  } catch (error: unknown) {
    // The child process already printed the error via stdio:inherit.
    // Exit with the child's exit code to suppress the Node.js stack trace.
    const status = (error as { status?: number })?.status;
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(status ?? 1);
  }
}
