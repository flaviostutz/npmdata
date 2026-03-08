/* eslint-disable functional/no-try-statements */
/* eslint-disable functional/no-let */
/* eslint-disable no-continue */
/* eslint-disable functional/immutable-data */
/* eslint-disable no-restricted-syntax */
/* eslint-disable max-depth */
import fs from 'node:fs';
import path from 'node:path';

import {
  ConsumerConfig,
  ConsumerResult,
  ManagedFileMetadata,
  DEFAULT_FILENAME_PATTERNS,
} from '../types';
import {
  ensureDir,
  removeFile,
  copyFile,
  calculateFileHash,
  matchesFilenamePattern,
  matchesContentRegex,
  detectPackageManager,
  parsePackageSpec,
  getInstalledPackageVersion,
  readCsvMarker,
  writeCsvMarker,
} from '../utils';

import { MARKER_FILE } from './constants';
import { updateGitignores } from './gitignore';
import { loadManagedFilesMap, cleanupEmptyMarkers, cleanupEmptyDirs } from './markers';
import { getPackageFiles, ensurePackageInstalled } from './package-files';

// eslint-disable-next-line complexity
async function extractFiles(
  config: ConsumerConfig,
  packageName: string,
): Promise<Pick<ConsumerResult, 'added' | 'modified' | 'deleted' | 'skipped'>> {
  const changes: Pick<ConsumerResult, 'added' | 'modified' | 'deleted' | 'skipped'> = {
    added: [],
    modified: [],
    deleted: [],
    skipped: [],
  };

  const dryRun = config.dryRun ?? false;
  const emit = config.onProgress;

  const installedVersion = getInstalledPackageVersion(packageName, config.cwd);
  if (!installedVersion) {
    throw new Error(`Failed to determine installed version of package ${packageName}`);
  }

  emit?.({ type: 'package-start', packageName, packageVersion: installedVersion });

  const packageFiles = await getPackageFiles(packageName, config.cwd);
  const extractedFiles: ManagedFileMetadata[] = [];
  const existingManagedMap = loadManagedFilesMap(config.outputDir);
  // Tracks full relPaths force-claimed from a different package so the
  // marker-file merge can evict the previous owner's entry.
  const forceClaimedPaths = new Set<string>();
  let wasForced = false;

  try {
    for (const packageFile of packageFiles) {
      if (
        !matchesFilenamePattern(
          packageFile.relPath,
          config.filenamePatterns ?? DEFAULT_FILENAME_PATTERNS,
        ) ||
        !matchesContentRegex(packageFile.fullPath, config.contentRegexes)
      ) {
        continue;
      }

      const destPath = path.join(config.outputDir, packageFile.relPath);
      if (!dryRun) ensureDir(path.dirname(destPath));

      const existingOwner = existingManagedMap.get(packageFile.relPath);

      // In unmanaged mode, skip files that already exist on disk.
      if (config.unmanaged && fs.existsSync(destPath)) {
        changes.skipped.push(packageFile.relPath);
        emit?.({ type: 'file-skipped', packageName, file: packageFile.relPath });
        continue;
      }

      // In keep-existing mode, skip files that already exist on disk but create missing ones normally.
      if (config.keepExisting && fs.existsSync(destPath)) {
        changes.skipped.push(packageFile.relPath);
        emit?.({ type: 'file-skipped', packageName, file: packageFile.relPath });
        continue;
      }

      if (fs.existsSync(destPath)) {
        if (existingOwner?.packageName === packageName) {
          if (calculateFileHash(packageFile.fullPath) === calculateFileHash(destPath)) {
            changes.skipped.push(packageFile.relPath);
            emit?.({ type: 'file-skipped', packageName, file: packageFile.relPath });
          } else {
            if (!dryRun) copyFile(packageFile.fullPath, destPath);
            changes.modified.push(packageFile.relPath);
            emit?.({ type: 'file-modified', packageName, file: packageFile.relPath });
          }
          wasForced = false;
        } else {
          // File exists but is owned by a different package (clash) or is unmanaged (conflict).
          // Behaviour is identical in both cases: throw when force is false, overwrite when true.
          if (!config.force) {
            if (existingOwner) {
              throw new Error(
                `Package clash: ${packageFile.relPath} already managed by ${existingOwner.packageName}@${existingOwner.packageVersion}. Cannot extract from ${packageName}. Use force: true to override.`,
              );
            }
            throw new Error(
              `File conflict: ${packageFile.relPath} already exists and is not managed by npmdata. Use force: true to override.`,
            );
          }
          // force=true: overwrite the existing file and take ownership.
          if (!dryRun) copyFile(packageFile.fullPath, destPath);
          changes.modified.push(packageFile.relPath);
          emit?.({ type: 'file-modified', packageName, file: packageFile.relPath });
          wasForced = true;
          if (existingOwner) {
            // Evict the previous owner's entry from the root marker file.
            forceClaimedPaths.add(packageFile.relPath);
          }
        }
      } else {
        if (!dryRun) copyFile(packageFile.fullPath, destPath);
        changes.added.push(packageFile.relPath);
        emit?.({ type: 'file-added', packageName, file: packageFile.relPath });
        wasForced = false;
      }

      if (!dryRun && !config.unmanaged && fs.existsSync(destPath)) fs.chmodSync(destPath, 0o444);

      if (!config.unmanaged) {
        extractedFiles.push({
          path: packageFile.relPath,
          packageName,
          packageVersion: installedVersion,
          force: wasForced,
        });
      }
    }

    // Delete files that were managed by this package but are no longer in the package.
    // Skip this step in unmanaged mode — only extraction is wanted, no sync/deletion.
    if (!config.unmanaged) {
      for (const [relPath, owner] of existingManagedMap) {
        if (owner.packageName !== packageName) continue;

        const stillPresent = extractedFiles.some((m) => m.path === relPath);

        if (!stillPresent) {
          const fullPath = path.join(config.outputDir, relPath);
          if (fs.existsSync(fullPath)) {
            if (!dryRun) removeFile(fullPath);
            changes.deleted.push(relPath);
            emit?.({ type: 'file-deleted', packageName, file: relPath });
          }
        }
      }
    }

    if (!dryRun && !config.unmanaged) {
      // Write a single root marker at outputDir with all managed file paths (relative to outputDir)
      const rootMarkerPath = path.join(config.outputDir, MARKER_FILE);

      let existingFiles: ManagedFileMetadata[] = [];
      if (fs.existsSync(rootMarkerPath)) {
        existingFiles = readCsvMarker(rootMarkerPath);
      }

      // Keep entries from other packages, evict entries from force-claimed paths.
      const mergedFiles: ManagedFileMetadata[] = [
        ...existingFiles.filter(
          (m) => m.packageName !== packageName && !forceClaimedPaths.has(m.path),
        ),
        ...extractedFiles,
      ];

      if (mergedFiles.length === 0) {
        if (fs.existsSync(rootMarkerPath)) {
          fs.chmodSync(rootMarkerPath, 0o644);
          fs.unlinkSync(rootMarkerPath);
        }
      } else {
        writeCsvMarker(rootMarkerPath, mergedFiles);
      }

      cleanupEmptyMarkers(config.outputDir);
    }
  } catch (error) {
    // On error, delete all files that were created during this extraction run
    if (!dryRun) {
      for (const relPath of changes.added) {
        const fullPath = path.join(config.outputDir, relPath);
        if (fs.existsSync(fullPath)) {
          try {
            removeFile(fullPath);
          } catch {
            // ignore cleanup errors
          }
        }
      }
      cleanupEmptyDirs(config.outputDir);
    }
    throw error;
  }

  emit?.({ type: 'package-end', packageName, packageVersion: installedVersion });
  return changes;
}

/**
 * Extract files from published packages to output directory.
 *
 * Phase 1 validates and installs every package before touching disk.
 * Phase 2 runs file extraction for all packages in parallel.
 * When dryRun is true no files are written; the result reflects what would change.
 */
export async function extract(config: ConsumerConfig): Promise<ConsumerResult> {
  const dryRun = config.dryRun ?? false;
  if (!dryRun) ensureDir(config.outputDir);

  if (config.force && config.keepExisting) {
    throw new Error('force and keepExisting cannot be used together');
  }

  const packageManager = config.packageManager ?? detectPackageManager(config.cwd);
  const sourcePackages: ConsumerResult['sourcePackages'] = [];
  const totalChanges: Pick<ConsumerResult, 'added' | 'modified' | 'deleted' | 'skipped'> = {
    added: [],
    modified: [],
    deleted: [],
    skipped: [],
  };

  // Phase 1: validate and install every package before touching the disk.
  // If any package is missing or at a wrong version, we abort before writing anything.
  const resolvedPackages: Array<{
    name: string;
    version: string | undefined;
    installedVersion: string;
  }> = [];
  for (const spec of config.packages) {
    const { name, version } = parsePackageSpec(spec);
    // eslint-disable-next-line no-await-in-loop
    const installedVersion = await ensurePackageInstalled(
      name,
      version,
      packageManager,
      config.cwd,
      config.upgrade,
    );
    resolvedPackages.push({ name, version, installedVersion });
  }

  // Phase 2: all packages are verified — extract files serially so progress events are grouped by package.
  for (const { name, installedVersion } of resolvedPackages) {
    // eslint-disable-next-line no-await-in-loop
    const changes = await extractFiles(config, name);
    totalChanges.added.push(...changes.added);
    totalChanges.modified.push(...changes.modified);
    totalChanges.deleted.push(...changes.deleted);
    totalChanges.skipped.push(...changes.skipped);
    sourcePackages.push({ name, version: installedVersion, changes });
  }

  if (!dryRun) {
    if (!config.unmanaged) {
      cleanupEmptyMarkers(config.outputDir);
      // Always clean up .gitignore entries for removed files; only add new entries when gitignore: true.
      updateGitignores(config.outputDir, config.gitignore ?? true);
    }
    // Run after gitignore cleanup so dirs kept alive only by a .gitignore get removed.
    cleanupEmptyDirs(config.outputDir);
  }

  return {
    ...totalChanges,
    sourcePackages,
  };
}
