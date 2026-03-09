import fs from 'node:fs';
import path from 'node:path';

import ignore from 'ignore';

import { hasManagedFilesUnder, readCsvMarker } from '../utils';

import { MARKER_FILE, GITIGNORE_FILE, GITIGNORE_START, GITIGNORE_END } from './constants';

/**
 * Read the .gitignore at dir and return parsed patterns, excluding the npmdata-managed
 * section.  These are the "external" patterns (e.g. node_modules, dist) that were written
 * by the project author rather than by npmdata itself.
 */
export function readExternalGitignore(dir: string): ReturnType<typeof ignore> {
  const ig = ignore();
  const gitignorePath = path.join(dir, GITIGNORE_FILE);
  if (!fs.existsSync(gitignorePath)) return ig;

  let content = fs.readFileSync(gitignorePath, 'utf8');

  // Strip out the npmdata-managed block so we only act on external entries.
  const startIdx = content.indexOf(GITIGNORE_START);
  const endIdx = content.indexOf(GITIGNORE_END);
  if (startIdx !== -1 && endIdx !== -1 && startIdx < endIdx) {
    content = content.slice(0, startIdx) + content.slice(endIdx + GITIGNORE_END.length);
  }

  ig.add(content);
  return ig;
}

/**
 * Update (or create) a .gitignore in the given directory so that the managed
 * files and the .npmdata marker file are ignored by git.
 * If managedFilenames is empty the npmdata section is removed; if the
 * resulting file is empty it is deleted.
 * When addEntries is false, only existing sections are updated/removed — no new
 * section is written if one did not already exist.
 */
export function updateGitignoreForDir(
  dir: string,
  managedFilenames: string[],
  addEntries = true,
): void {
  const gitignorePath = path.join(dir, GITIGNORE_FILE);

  let existingContent = '';
  if (fs.existsSync(gitignorePath)) {
    existingContent = fs.readFileSync(gitignorePath, 'utf8');
  }

  const startIdx = existingContent.indexOf(GITIGNORE_START);
  const endIdx = existingContent.indexOf(GITIGNORE_END);
  const hasExistingSection = startIdx !== -1 && endIdx !== -1 && startIdx < endIdx;

  // When not adding entries and there is no existing section, there is nothing to clean up.
  if (!addEntries && !hasExistingSection) return;

  let beforeSection = existingContent;
  let afterSection = '';

  if (hasExistingSection) {
    beforeSection = existingContent.slice(0, startIdx).trimEnd();
    afterSection = existingContent.slice(endIdx + GITIGNORE_END.length).trimStart();
  }

  if (managedFilenames.length === 0) {
    // Remove the managed section entirely.
    const updatedContent = [beforeSection, afterSection].filter(Boolean).join('\n');
    if (updatedContent.trim()) {
      fs.writeFileSync(gitignorePath, `${updatedContent.trimEnd()}\n`, 'utf8');
    } else if (fs.existsSync(gitignorePath)) {
      fs.unlinkSync(gitignorePath);
    }
    return;
  }

  // When addEntries is false, only update an existing section (stale entries removed);
  // if there is no existing section do not create one (already returned above).
  const section = [GITIGNORE_START, MARKER_FILE, ...managedFilenames.sort(), GITIGNORE_END].join(
    '\n',
  );

  const parts = [beforeSection, section, afterSection].filter(Boolean);
  const updatedContent = `${parts.join('\n')}\n`;
  fs.writeFileSync(gitignorePath, updatedContent, 'utf8');
}

/**
 * Optimise the list of managed file paths for use in .gitignore.
 * When every file inside a directory (recursively, excluding MARKER_FILE, GITIGNORE_FILE, and
 * symlinks) is present in managedPaths, the whole directory is represented as "dir/" rather than
 * listing each file individually.  Root-level files (no slash) are always emitted as-is.
 *
 * @param managedPaths - Paths relative to outputDir (e.g. ["docs/guide.md", "README.md"])
 * @param outputDir    - Absolute path to the root used to inspect actual disk contents
 */
export function compressGitignoreEntries(managedPaths: string[], outputDir: string): string[] {
  const managedSet = new Set(managedPaths);
  const gitignore = readExternalGitignore(outputDir);

  // Returns true when every non-special, non-symlink file inside absDir (recursively)
  // appears in managedSet under its full outputDir-relative path (relDir prefix included).
  const isDirFullyManaged = (absDir: string, relDir: string): boolean => {
    if (!fs.existsSync(absDir)) return false;
    for (const entry of fs.readdirSync(absDir)) {
      if (entry === MARKER_FILE || entry === GITIGNORE_FILE) continue;
      const absEntry = path.join(absDir, entry);
      const relEntry = `${relDir}/${entry}`;
      const lstat = fs.lstatSync(absEntry);
      if (lstat.isSymbolicLink()) continue;
      if (lstat.isDirectory()) {
        // Skip gitignored subdirs that have no managed files — they are not our concern
        // and traversing them (e.g. node_modules) causes serious performance problems.
        if (gitignore.ignores(entry) && !hasManagedFilesUnder(relEntry, managedSet)) {
          continue;
        }
        if (!isDirFullyManaged(absEntry, relEntry)) return false;
      } else if (!managedSet.has(relEntry)) return false;
    }
    return true;
  };

  // paths: managed paths relative to the current directory scope
  // absRoot: absolute path of the current directory scope
  // relRoot: path of the current scope relative to outputDir (empty string at top level)
  const compress = (paths: string[], absRoot: string, relRoot: string): string[] => {
    const result: string[] = [];
    const subdirNames = new Set<string>();

    for (const p of paths) {
      const slashIdx = p.indexOf('/');
      if (slashIdx === -1) {
        // File lives directly in this scope — emit its full outputDir-relative path
        result.push(relRoot ? `${relRoot}/${p}` : p);
      } else {
        subdirNames.add(p.slice(0, slashIdx));
      }
    }

    for (const dirName of subdirNames) {
      const absDir = path.join(absRoot, dirName);
      const relDir = relRoot ? `${relRoot}/${dirName}` : dirName;
      const prefix = `${dirName}/`;
      const subPaths = paths.filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length));

      if (isDirFullyManaged(absDir, relDir)) {
        result.push(`${relDir}/`);
      } else {
        result.push(...compress(subPaths, absDir, relDir));
      }
    }

    return result;
  };

  return compress(managedPaths, outputDir, '');
}

/**
 * Find the nearest .npmdata marker file by walking up from fromDir to outputDir (inclusive).
 * Returns the path to the marker file, or null if none found within the outputDir boundary.
 */
export function findNearestMarkerPath(fromDir: string, outputDir: string): string | null {
  let dir = fromDir;
  const resolvedOutput = path.resolve(outputDir);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const markerPath = path.join(dir, MARKER_FILE);
    if (fs.existsSync(markerPath)) return markerPath;

    if (path.resolve(dir) === resolvedOutput) break;

    const parent = path.dirname(dir);
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }

  // eslint-disable-next-line unicorn/no-null
  return null;
}

/**
 * Write one .gitignore at outputDir containing all managed file paths (relative to outputDir),
 * and remove any npmdata sections from .gitignore files in subdirectories.
 * When addEntries is false, existing sections are updated/removed but no new
 * sections are created — use this to clean up without opting into gitignore management.
 */
export function updateGitignores(outputDir: string, addEntries = true): void {
  if (!fs.existsSync(outputDir)) return;

  // Read managed paths up-front so we can skip gitignored dirs that have no managed files.
  const managedPaths = new Set<string>();
  const rootMarkerPathForRead = path.join(outputDir, MARKER_FILE);
  if (fs.existsSync(rootMarkerPathForRead)) {
    try {
      for (const m of readCsvMarker(rootMarkerPathForRead)) {
        managedPaths.add(m.path);
      }
    } catch {
      // ignore unreadable marker
    }
  }

  // Read external gitignore patterns once for the whole walk.
  const gitignore = readExternalGitignore(outputDir);

  // Remove npmdata sections from all subdirectory .gitignore files (migration / cleanup of old format)
  const cleanupSubDirGitignores = (dir: string): void => {
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      const lstat = fs.lstatSync(fullPath);
      if (!lstat.isSymbolicLink() && lstat.isDirectory()) {
        const relPath = path.relative(outputDir, fullPath);

        // Skip gitignored directories that have no managed files under them —
        // traversing them (e.g. node_modules) causes serious performance problems.
        if (gitignore.ignores(item) && !hasManagedFilesUnder(relPath, managedPaths)) {
          continue;
        }

        const subGitignore = path.join(fullPath, GITIGNORE_FILE);
        if (fs.existsSync(subGitignore)) {
          updateGitignoreForDir(fullPath, [], false);
        }
        cleanupSubDirGitignores(fullPath);
      }
    }
  };

  cleanupSubDirGitignores(outputDir);

  // Update (or remove) the single .gitignore at outputDir
  const rootMarkerPath = path.join(outputDir, MARKER_FILE);
  if (fs.existsSync(rootMarkerPath)) {
    try {
      const managedFiles = readCsvMarker(rootMarkerPath);
      const rawPaths = managedFiles.map((m) => m.path);
      const optimisedPaths = compressGitignoreEntries(rawPaths, outputDir);
      updateGitignoreForDir(outputDir, optimisedPaths, addEntries);
    } catch {
      // Ignore unreadable marker files
    }
  } else {
    // Clean up any leftover npmdata section at root
    updateGitignoreForDir(outputDir, [], false);
  }
}
