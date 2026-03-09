import { NpmdataExtractEntry } from '../types';

/**
 * Collects all unique presets that appear across the given npmdata entries, sorted alphabetically.
 */
export function collectAllPresets(entries: NpmdataExtractEntry[]): string[] {
  const presetSet = new Set<string>();
  for (const entry of entries) {
    if (entry.presets) {
      for (const preset of entry.presets) {
        presetSet.add(preset);
      }
    }
  }
  return Array.from(presetSet).sort();
}

/**
 * Prints a help message to stdout, listing the extract action, all options, and available presets.
 */
export function printHelp(packageName: string, availablePresets: string[]): void {
  const presetsLine =
    availablePresets.length > 0 ? availablePresets.join(', ') : '(none defined in package.json)';
  const examplePreset = availablePresets.length > 0 ? availablePresets[0] : 'my-preset';
  process.stdout.write(
    [
      `Usage: ${packageName} <action> [options]`,
      '',
      'Actions:',
      '  extract  Extract files from the source package(s) defined in package.json',
      '  check    Verify local files are in sync with the source package(s)',
      '  list     List all files managed by npmdata in the output directories',
      '  purge    Remove all managed files previously extracted',
      '',
      'Options:',
      '  --help              Show this help message',
      '  --output, -o <dir>  Base directory for resolving all outputDir paths (default: cwd)',
      '  --dry-run           Simulate changes without writing or deleting any files',
      '  --presets <preset1,preset2>  Limit to entries whose presets overlap (comma-separated)',
      '  --no-gitignore      Disable .gitignore management for every entry (overrides per-entry setting)',
      '  --unmanaged         Run every entry in unmanaged mode (overrides per-entry setting)',
      '  --verbose, -v       Print detailed progress information for each step',
      '',
      `Available presets: ${presetsLine}`,
      '',
      'Examples:',
      `  ${packageName} extract`,
      '    Extract files for all entries defined in package.json',
      '',
      `  ${packageName} extract --output <dir>`,
      '    Extract files, resolving all outputDir paths relative to <dir> instead of cwd',
      '',
      `  ${packageName} extract --dry-run`,
      '    Preview what would be extracted without writing any files',
      '',
      `  ${packageName} extract --presets ${examplePreset}`,
      `    Extract files only for entries tagged "${examplePreset}"`,
      '',
      `  ${packageName} check`,
      '    Check if local files are in sync with the source packages',
      '',
      `  ${packageName} list`,
      '    List all files managed by npmdata in the output directories',
      '',
      `  ${packageName} purge`,
      '    Remove all managed files from the output directories',
      '',
    ].join('\n'),
  );
}
