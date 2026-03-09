/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

import { minimatch } from 'minimatch';

import { NpmdataExtractEntry } from '../types';
import { readCsvMarker } from '../utils';

/**
 * From the flat list of managed file paths (relative to outputDir) recorded in
 * the .npmdata marker, derive every unique path that can be symlinked: each
 * file itself plus every intermediate ancestor directory.
 *
 * Example: 'skills/skill-a/README.md' yields
 *   'skills', 'skills/skill-a', 'skills/skill-a/README.md'
 */
function managedPathsWithAncestors(managedFiles: ReturnType<typeof readCsvMarker>): string[] {
  const paths = new Set<string>();
  for (const mf of managedFiles) {
    paths.add(mf.path);
    const parts = mf.path.split('/');
    // Add each ancestor directory by accumulating path segments.
    parts.slice(0, -1).reduce((prefix, seg) => {
      const ancestor = prefix ? `${prefix}/${seg}` : seg;
      paths.add(ancestor);
      return ancestor;
    }, '');
  }
  return Array.from(paths);
}

/**
 * Read the .npmdata marker from outputDir and return managed file metadata.
 * Returns an empty array when the marker does not exist.
 */
function readManagedFiles(outputDir: string): ReturnType<typeof readCsvMarker> {
  const markerPath = path.join(outputDir, '.npmdata');
  return fs.existsSync(markerPath) ? readCsvMarker(markerPath) : [];
}

/**
 * Collect all existing symlinks in `targetDir` whose resolved (or as-written)
 * link target starts with `outputDir`.  Returns a map of basename → resolved
 * target path.  Dead symlinks that still point into outputDir are included so
 * that they can be cleaned up.
 */
function collectManagedSymlinks(targetDir: string, outputDir: string): Map<string, string> {
  const owned = new Map<string, string>();
  if (!fs.existsSync(targetDir)) return owned;

  // Resolve outputDir through any intermediate symlinks (e.g. /var → /private/var on macOS)
  // so prefix comparisons work correctly on all platforms.
  let resolvedOutputDir = outputDir;
  try {
    resolvedOutputDir = fs.realpathSync(outputDir);
  } catch {
    // If outputDir does not exist, fall back to the raw path.
  }

  const normalizedOutput = resolvedOutputDir.endsWith(path.sep)
    ? resolvedOutputDir
    : `${resolvedOutputDir}${path.sep}`;

  for (const name of fs.readdirSync(targetDir)) {
    const symlinkPath = path.join(targetDir, name);
    const lstat = fs.lstatSync(symlinkPath);
    if (lstat.isSymbolicLink()) {
      // Try to resolve (handles live symlinks).
      try {
        const resolved = fs.realpathSync(symlinkPath);
        if (resolved === resolvedOutputDir || resolved.startsWith(normalizedOutput)) {
          owned.set(name, resolved);
        }
      } catch {
        // Dead symlink – read the raw link target to see if it points into outputDir.
        const rawTarget = fs.readlinkSync(symlinkPath);
        const absTarget = path.resolve(targetDir, rawTarget);
        const resolvedAbsTarget = absTarget; // raw path is enough for dead-link check
        if (
          resolvedAbsTarget === outputDir ||
          resolvedAbsTarget.startsWith(`${outputDir}${path.sep}`)
        ) {
          owned.set(name, absTarget);
        }
      }
    }
  }
  return owned;
}

/**
 * Determine the symlink action for a single target path.
 * Returns 'create' when the path does not exist, 'update' when an out-of-date
 * managed symlink exists, or 'skip' when nothing should be done.
 */
function symlinkAction(
  symlinkPath: string,
  sourcePath: string,
  isManaged: boolean,
): 'create' | 'update' | 'skip' {
  try {
    const lstat = fs.lstatSync(symlinkPath);
    if (!lstat.isSymbolicLink()) return 'skip'; // Non-symlink – never clobber.
    if (!isManaged) return 'skip'; // Not managed by npmdata – leave alone.

    // Managed symlink: only recreate if the target has drifted.
    try {
      return fs.realpathSync(symlinkPath) === sourcePath ? 'skip' : 'update';
    } catch {
      return 'update'; // Dead link – recreate.
    }
  } catch {
    return 'create'; // Path does not exist.
  }
}

/**
 * Apply the symlink configs from an extraction entry.
 *
 * For each config:
 *  1. Expands the `source` glob inside the resolved `outputDir`.
 *  2. Ensures the `target` directory exists.
 *  3. Removes stale symlinks from the target dir that previously pointed into
 *     outputDir but are no longer matched by the current glob result.
 *  4. Creates (or updates) symlinks for every matched file/directory.
 *
 * Only symlinks whose targets live inside outputDir are managed; any other
 * symlinks in the target directory are left untouched.
 */
export function applySymlinks(entry: NpmdataExtractEntry, cwd: string = process.cwd()): void {
  if (!entry.output?.symlinks || entry.output.symlinks.length === 0) return;

  const outputDir = path.resolve(cwd, entry.output.path);
  const allManagedPaths = managedPathsWithAncestors(readManagedFiles(outputDir));

  for (const cfg of entry.output.symlinks!) {
    const targetDir = path.resolve(outputDir, cfg.target);
    fs.mkdirSync(targetDir, { recursive: true });

    // Build desired symlink map from managed paths (files + ancestor dirs) matching the source pattern.
    const desired = new Map<string, string>();
    for (const relPath of allManagedPaths) {
      if (minimatch(relPath, cfg.source, { dot: true })) {
        const absMatch = path.join(outputDir, relPath);
        desired.set(path.basename(absMatch), absMatch);
      }
    }

    // Remove stale managed symlinks that are no longer in the desired set.
    const existing = collectManagedSymlinks(targetDir, outputDir);
    for (const [basename] of existing) {
      if (!desired.has(basename)) {
        const symlinkPath = path.join(targetDir, basename);
        fs.unlinkSync(symlinkPath);
        if (!entry.silent) {
          console.log(`D\t${path.relative(cwd, symlinkPath)}`);
        }
      }
    }

    // Create or update symlinks.
    for (const [basename, sourcePath] of desired) {
      const symlinkPath = path.join(targetDir, basename);
      const action = symlinkAction(symlinkPath, sourcePath, existing.has(basename));

      if (action === 'update') {
        fs.unlinkSync(symlinkPath);
        fs.symlinkSync(sourcePath, symlinkPath);
        if (!entry.silent) {
          console.log(`M\t${path.relative(cwd, symlinkPath)}`);
        }
      } else if (action === 'create') {
        fs.symlinkSync(sourcePath, symlinkPath);
        if (!entry.silent) {
          console.log(`A\t${path.relative(cwd, symlinkPath)}`);
        }
      }
      // 'skip' → do nothing
    }
  }
}
