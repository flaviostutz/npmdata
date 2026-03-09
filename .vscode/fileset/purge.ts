/* eslint-disable functional/no-try-statements */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-continue */
/* eslint-disable functional/immutable-data */
import fs from 'node:fs';
import path from 'node:path';

import { ConsumerResult, ProgressEvent } from '../types';
import { parsePackageSpec, removeFile, readCsvMarker, writeCsvMarker } from '../utils';

import { MARKER_FILE } from './constants';
import { updateGitignores } from './gitignore';
import { loadManagedFilesMap, cleanupEmptyMarkers, cleanupEmptyDirs } from './markers';

/**
 * Configuration for a purge operation.
 */
export type PurgeConfig = {
  /**
   * Package names whose managed files should be removed.
   * Each entry is a bare package name ("my-pkg") or a name with a semver constraint
   * ("my-pkg@^1.2.3") – the version part is ignored; only the name is used for lookup.
   */
  packages: string[];

  /**
   * Output directory from which managed files will be removed.
   */
  outputDir: string;

  /**
   * When true, simulate the purge without writing anything to disk.
   */
  dryRun?: boolean;

  /**
   * Optional callback called for each file event during purge.
   */
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Remove all managed files previously extracted by the given packages from outputDir.
 * Reads .npmdata marker files to discover which files are owned by each package,
 * deletes them from disk, updates the marker files, and cleans up empty directories.
 * No package installation is required – only the local marker state is used.
 */
export async function purge(config: PurgeConfig): Promise<ConsumerResult> {
  const dryRun = config.dryRun ?? false;
  const emit = config.onProgress;
  const totalChanges: Pick<ConsumerResult, 'added' | 'modified' | 'deleted' | 'skipped'> = {
    added: [],
    modified: [],
    deleted: [],
    skipped: [],
  };
  const sourcePackages: ConsumerResult['sourcePackages'] = [];

  for (const spec of config.packages) {
    const { name: packageName } = parsePackageSpec(spec);
    const deleted: string[] = [];

    emit?.({ type: 'package-start', packageName, packageVersion: 'unknown' });

    const allManaged = loadManagedFilesMap(config.outputDir);

    for (const [relPath, owner] of allManaged) {
      if (owner.packageName !== packageName) continue;

      const fullPath = path.join(config.outputDir, relPath);
      if (fs.existsSync(fullPath)) {
        if (!dryRun) removeFile(fullPath);
        deleted.push(relPath);
        emit?.({ type: 'file-deleted', packageName, file: relPath });
      }
    }

    if (!dryRun) {
      // Update root marker: remove entries owned by this package.
      const rootMarkerPath = path.join(config.outputDir, MARKER_FILE);
      if (fs.existsSync(rootMarkerPath)) {
        try {
          const existingFiles = readCsvMarker(rootMarkerPath);
          const mergedFiles = existingFiles.filter((m) => m.packageName !== packageName);

          if (mergedFiles.length === 0) {
            fs.chmodSync(rootMarkerPath, 0o644);
            fs.unlinkSync(rootMarkerPath);
          } else {
            writeCsvMarker(rootMarkerPath, mergedFiles);
          }
        } catch {
          // Ignore unreadable marker files
        }
      }

      cleanupEmptyMarkers(config.outputDir);
      // Clean up any leftover .gitignore sections without adding new ones.
      updateGitignores(config.outputDir, false);
      cleanupEmptyDirs(config.outputDir);
    }

    totalChanges.deleted.push(...deleted);
    sourcePackages.push({
      name: packageName,
      version: 'unknown',
      changes: { added: [], modified: [], deleted, skipped: [] },
    });

    emit?.({ type: 'package-end', packageName, packageVersion: 'unknown' });
  }

  return {
    ...totalChanges,
    sourcePackages,
  };
}
