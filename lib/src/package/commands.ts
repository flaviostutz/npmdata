import path from 'node:path';

import { NpmdataExtractEntry } from '../types';
import { parsePackageSpec } from '../utils';

function parseEntryPackageName(spec: string): { name: string } {
  const { name } = parsePackageSpec(spec);
  return { name };
}

/**
 * Build a CLI command string that extracts files from the entry's package into its output directory.
 */
export function buildExtractCommand(
  cliPath: string,
  entry: NpmdataExtractEntry,
  cwd: string = process.cwd(),
): string {
  const outputFlag = ` --output "${path.resolve(cwd, entry.output.path)}"`;
  const forceFlag = entry.output?.force ? ' --force' : '';
  const keepExistingFlag = entry.output?.keepExisting ? ' --keep-existing' : '';
  const gitignoreFlag = entry.output?.gitignore === false ? ' --no-gitignore' : '';
  const unmanagedFlag = entry.output?.unmanaged ? ' --unmanaged' : '';
  const silentFlag = entry.silent ? ' --silent' : '';
  const verboseFlag = entry.verbose ? ' --verbose' : '';
  const dryRunFlag = entry.output?.dryRun ? ' --dry-run' : '';
  const upgradeFlag = entry.upgrade ? ' --upgrade' : '';
  const filesFlag =
    entry.selector?.files && entry.selector.files.length > 0
      ? ` --files "${entry.selector.files.join(',')}"`
      : '';
  const contentRegexFlag =
    entry.selector?.contentRegexes && entry.selector.contentRegexes.length > 0
      ? ` --content-regex "${entry.selector.contentRegexes.join(',')}"`
      : '';
  return `node "${cliPath}" extract --packages "${entry.package}"${outputFlag}${forceFlag}${keepExistingFlag}${gitignoreFlag}${unmanagedFlag}${silentFlag}${verboseFlag}${dryRunFlag}${upgradeFlag}${filesFlag}${contentRegexFlag}`;
}

/**
 * Build a CLI command string that checks whether local files are in sync with the entry's package.
 */
export function buildCheckCommand(
  cliPath: string,
  entry: NpmdataExtractEntry,
  cwd: string = process.cwd(),
): string {
  const outputFlag = ` --output "${path.resolve(cwd, entry.output.path)}"`;
  const verboseFlag = entry.verbose ? ' --verbose' : '';
  const filesFlag =
    entry.selector?.files && entry.selector.files.length > 0
      ? ` --files "${entry.selector.files.join(',')}"`
      : '';
  const contentRegexFlag =
    entry.selector?.contentRegexes && entry.selector.contentRegexes.length > 0
      ? ` --content-regex "${entry.selector.contentRegexes.join(',')}"`
      : '';
  return `node "${cliPath}" check --packages "${entry.package}"${outputFlag}${verboseFlag}${filesFlag}${contentRegexFlag}`;
}

/**
 * Build a CLI command string that lists all managed files in the given output directory.
 */
export function buildListCommand(
  cliPath: string,
  outputDir: string,
  cwd: string = process.cwd(),
  verbose = false,
): string {
  const resolvedOutput = path.resolve(cwd, outputDir);
  const verboseFlag = verbose ? ' --verbose' : '';
  return `node "${cliPath}" list --output "${resolvedOutput}"${verboseFlag}`;
}

/**
 * Build a CLI command string that purges (removes) all managed files for the entry's package
 * from its output directory. No package installation is required.
 */
export function buildPurgeCommand(
  cliPath: string,
  entry: NpmdataExtractEntry,
  cwd: string = process.cwd(),
): string {
  const { name } = parseEntryPackageName(entry.package);
  const outputFlag = ` --output "${path.resolve(cwd, entry.output.path)}"`;
  // Propagate silent/dry-run/verbose settings from the entry if present.
  const silentFlag = entry.silent ? ' --silent' : '';
  const verboseFlag = entry.verbose ? ' --verbose' : '';
  const dryRunFlag = entry.output?.dryRun ? ' --dry-run' : '';
  return `node "${cliPath}" purge --packages "${name}"${outputFlag}${silentFlag}${verboseFlag}${dryRunFlag}`;
}
