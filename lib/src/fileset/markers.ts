/* eslint-disable functional/no-try-statements */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

import { readCsvMarker, hasManagedFilesUnder } from '../utils';
import { ManagedFileMetadata } from '../types';

import { MARKER_FILE } from './constants';
import { readExternalGitignore, findNearestMarkerPath } from './gitignore';

/**
 * Load all managed files from the root marker file at outputDir.
 * Paths stored in the marker are already relative to outputDir.
 * Uses findNearestMarkerPath starting from outputDir itself.
 */
export function loadAllManagedFiles(outputDir: string): ManagedFileMetadata[] {
  if (!fs.existsSync(outputDir)) return [];

  const markerPath = findNearestMarkerPath(outputDir, outputDir);
  if (!markerPath) return [];

  try {
    return readCsvMarker(markerPath);
  } catch {
    console.warn(`Warning: Failed to read marker file at ${markerPath}. Skipping.`);
    return [];
  }
}

/**
 * Load managed files from all marker files under outputDir, keyed by relative path.
 * Each value carries the package ownership metadata.
 */
export function loadManagedFilesMap(outputDir: string): Map<string, ManagedFileMetadata> {
  return new Map(loadAllManagedFiles(outputDir).map((m) => [m.path, m]));
}

export function cleanupEmptyMarkers(outputDir: string): void {
  if (!fs.existsSync(outputDir)) return;

  const markerPath = path.join(outputDir, MARKER_FILE);
  if (!fs.existsSync(markerPath)) return;

  try {
    const managedFiles = readCsvMarker(markerPath);
    if (managedFiles.length === 0) {
      fs.chmodSync(markerPath, 0o644);
      fs.unlinkSync(markerPath);
    }
  } catch {
    // Ignore unreadable marker files
  }
}

export function cleanupEmptyDirs(outputDir: string): void {
  const gitignore = readExternalGitignore(outputDir);
  const managedPaths = new Set<string>(loadAllManagedFiles(outputDir).map((m) => m.path));

  const walkDir = (dir: string): boolean => {
    if (!fs.existsSync(dir)) return true;

    let isEmpty = true;
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      const lstat = fs.lstatSync(fullPath);
      if (!lstat.isSymbolicLink() && lstat.isDirectory()) {
        const relPath = path.relative(outputDir, fullPath);

        // Skip gitignored directories that have no managed files — they are not our concern
        // and traversing them (e.g. node_modules) causes serious performance problems.
        if (gitignore.ignores(item) && !hasManagedFilesUnder(relPath, managedPaths)) {
          isEmpty = false; // treat as non-empty so we preserve the parent directory
          continue;
        }

        const childEmpty = walkDir(fullPath);
        if (!childEmpty) isEmpty = false;
      } else {
        isEmpty = false;
      }
    }

    if (isEmpty && dir !== outputDir) {
      fs.rmdirSync(dir);
      return true;
    }
    return isEmpty;
  };

  walkDir(outputDir);
}
