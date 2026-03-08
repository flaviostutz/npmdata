import fs from 'node:fs';
import path from 'node:path';

import { minimatch } from 'minimatch';

import { NpmdataExtractEntry } from '../types';
import { readCsvMarker } from '../utils';

function readManagedFiles(outputDir: string): ReturnType<typeof readCsvMarker> {
  const markerPath = path.join(outputDir, '.npmdata');
  return fs.existsSync(markerPath) ? readCsvMarker(markerPath) : [];
}

/**
 * Apply the content-replacement configs from an extraction entry.
 *
 * For each config:
 *  1. Expands the `files` glob inside `cwd`.
 *  2. Reads each matched file.
 *  3. Applies the regex replacement (global, multiline).
 *  4. Writes the file back only when the content changed.
 */
export function applyContentReplacements(
  entry: NpmdataExtractEntry,
  cwd: string = process.cwd(),
): void {
  if (!entry.output?.contentReplacements || entry.output.contentReplacements.length === 0) return;

  const outputDir = path.resolve(cwd, entry.output.path);
  const managedFiles = readManagedFiles(outputDir);

  for (const cfg of entry.output.contentReplacements) {
    const regex = new RegExp(cfg.match, 'gm');
    for (const mf of managedFiles) {
      if (minimatch(mf.path, cfg.files, { dot: true })) {
        const filePath = path.join(outputDir, mf.path);
        if (fs.existsSync(filePath)) {
          const original = fs.readFileSync(filePath, 'utf8');
          const updated = original.replace(regex, cfg.replace);
          if (updated !== original) {
            // Files extracted by npmdata are set to read-only (0o444).
            // Temporarily make the file writable, apply the replacement, then restore read-only.
            fs.chmodSync(filePath, 0o644);
            fs.writeFileSync(filePath, updated, 'utf8');
            fs.chmodSync(filePath, 0o444);
          }
        }
      }
    }
  }
}

/**
 * Check whether the content-replacement configs from an extraction entry are
 * currently in effect in the workspace.
 *
 * Returns a list of file paths where the replacement pattern still matches
 * (i.e. the replacement has not been applied or has drifted).  An empty list
 * means everything is in sync.
 */
export function checkContentReplacements(
  entry: NpmdataExtractEntry,
  cwd: string = process.cwd(),
): string[] {
  if (!entry.output?.contentReplacements || entry.output.contentReplacements.length === 0)
    return [];

  const outputDir = path.resolve(cwd, entry.output.path);
  const managedFiles = readManagedFiles(outputDir);
  const outOfSync: string[] = [];

  for (const cfg of entry.output.contentReplacements) {
    const regex = new RegExp(cfg.match, 'gm');
    for (const mf of managedFiles) {
      if (minimatch(mf.path, cfg.files, { dot: true })) {
        const filePath = path.join(outputDir, mf.path);
        if (fs.existsSync(filePath)) {
          const content = fs.readFileSync(filePath, 'utf8');
          // A file is out of sync when applying the replacement would change it.
          const expected = content.replace(regex, cfg.replace);
          if (expected !== content) {
            // eslint-disable-next-line functional/immutable-data
            outOfSync.push(filePath);
          }
        }
      }
    }
  }

  return outOfSync;
}
