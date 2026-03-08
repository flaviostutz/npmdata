import { NpmdataExtractEntry } from '../types';

/**
 * Parses --output (or -o) from an argv array and returns the path string.
 * Returns undefined when the flag is not present.
 */
export function parseOutputFromArgv(argv: string[]): string | undefined {
  const idx = argv.findIndex((a) => a === '--output' || a === '-o');
  if (idx === -1 || idx + 1 >= argv.length) {
    // eslint-disable-next-line no-undefined
    return undefined;
  }
  return argv[idx + 1];
}

/**
 * Returns true when --dry-run appears in the argv array.
 */
export function parseDryRunFromArgv(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

/**
 * Returns true when --silent appears in the argv array.
 */
export function parseSilentFromArgv(argv: string[]): boolean {
  return argv.includes('--silent');
}

/**
 * Returns true when --verbose or -v appears in the argv array.
 */
export function parseVerboseFromArgv(argv: string[]): boolean {
  return argv.includes('--verbose') || argv.includes('-v');
}

/**
 * Returns true when --no-gitignore appears in the argv array.
 * When true, overrides the gitignore setting of every entry to false.
 */
export function parseNoGitignoreFromArgv(argv: string[]): boolean {
  return argv.includes('--no-gitignore');
}

/**
 * Returns true when --unmanaged appears in the argv array.
 * When true, overrides the unmanaged setting of every entry to true.
 */
export function parseUnmanagedFromArgv(argv: string[]): boolean {
  return argv.includes('--unmanaged');
}

/**
 * Parses --presets from an argv array and returns the list of requested presets (split by comma).
 * Returns an empty array when --presets is not present.
 */
export function parsePresetsFromArgv(argv: string[]): string[] {
  const idx = argv.indexOf('--presets');
  if (idx === -1 || idx + 1 >= argv.length) {
    return [];
  }
  return argv[idx + 1]
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Filter entries by requested presets. When no presets are requested all entries pass through.
 * When presets are requested only entries that share at least one preset with the requested list
 * are included.
 */
export function filterEntriesByPresets(
  entries: NpmdataExtractEntry[],
  requestedPresets: string[],
): NpmdataExtractEntry[] {
  if (requestedPresets.length === 0) {
    return entries;
  }
  return entries.filter(
    (entry) => entry.presets && entry.presets.some((t) => requestedPresets.includes(t)),
  );
}
