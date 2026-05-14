/* eslint-disable no-console */
import path from 'node:path';

import { ProgressEvent, BasicPackageOptions } from '../types';
import { cleanupTempPackageJson, formatDisplayPath } from '../utils';
import { checkFileset } from '../fileset/check';
import { readOutputDirMarker } from '../fileset/markers';

import { resolveFilesDetailed } from './resolve-files';
import { calculateDiff } from './calculate-diff';
import { isManagedSymlinkEntry } from './symlinks';
import { createSourceRuntime } from './source';

export type CheckOptions = BasicPackageOptions & {
  onProgress?: (event: ProgressEvent) => void;
  /**
   * When true, skip all package installs and git clones.
   * Integrity is verified solely against the checksums stored in .filedist markers.
   * Extra-file detection (files in source not yet extracted) is also skipped.
   */
  localOnly?: boolean;
};

export type CheckSummary = {
  missing: string[];
  conflict: string[];
  extra: string[];
};

/**
 * Check whether the output directories are in sync with the desired file state.
 *
 * Uses resolveFiles() to build the desired file list (installing packages as needed),
 * then calculateDiff() to find files that are missing, conflicting, or extra.
 * Conflict detection reports content/managed mismatches only — gitignore-only
 * conflicts are excluded since gitignore state is managed by extract, not a data
 * integrity issue.
 */
export async function actionCheck(options: CheckOptions): Promise<CheckSummary> {
  const { entries, cwd, verbose = false, onProgress, localOnly = false } = options;
  const summary: CheckSummary = { missing: [], conflict: [], extra: [] };

  // Skip entries with managed=false — they write no marker so there is nothing to check.
  const managedEntries = entries.filter((e) => e.output?.managed !== false);
  if (managedEntries.length === 0) return summary;

  // --local-only: verify only against .filedist markers without touching any package source.
  if (localOnly) {
    if (verbose) {
      console.log(`[verbose] actionCheck: local-only mode (cwd: ${formatDisplayPath(cwd, cwd)})`);
    }
    const checkedDirs = new Set<string>();
    for (const entry of managedEntries) {
      const outputDir = path.resolve(cwd, entry.output?.path ?? '.');
      if (checkedDirs.has(outputDir)) continue;
      checkedDirs.add(outputDir);

      // readOutputDirMarker verifies the .filedist self-checksum and throws on mismatch.
      const marker = await readOutputDirMarker(outputDir);
      // eslint-disable-next-line unicorn/no-null
      const checkResult = await checkFileset(null, outputDir, marker);

      summary.missing.push(...checkResult.missing);
      summary.conflict.push(...checkResult.modified);
      // extra is skipped in local-only mode (no package source to enumerate)

      if (verbose) {
        console.log(
          `[verbose] actionCheck local-only: ${formatDisplayPath(outputDir, cwd)}: ` +
            `missing=${checkResult.missing.length} modified=${checkResult.modified.length}`,
        );
      }
    }
    return summary;
  }

  const sourceRuntime = createSourceRuntime(cwd, verbose);

  if (verbose) {
    console.log(`[verbose] actionCheck: resolving files (cwd: ${formatDisplayPath(cwd, cwd)})`);
  }

  try {
    const resolved = await resolveFilesDetailed(managedEntries, {
      cwd,
      verbose,
      sourceRuntime,
      onProgress: (e) => {
        if (e.type === 'package-start' || e.type === 'package-end') onProgress?.(e);
      },
    });
    const resolvedFiles = resolved.files;

    if (verbose) {
      console.log(`[verbose] actionCheck: resolved ${resolvedFiles.length} desired file(s)`);
    }

    const managedResolvedFiles = resolvedFiles.filter((f) => f.managed);
    const diff = await calculateDiff(
      managedResolvedFiles,
      verbose,
      cwd,
      resolved.relevantPackagesByOutputDir,
    );

    summary.missing.push(...diff.missing.map((e) => e.relPath));
    summary.extra.push(
      ...diff.extra
        .filter((e) => !e.existing || !isManagedSymlinkEntry(e.existing))
        .map((e) => e.relPath),
    );
    // Only report conflicts where content or managed-state differ; gitignore-only
    // mismatches are not a data integrity issue.
    summary.conflict.push(
      ...diff.conflict
        .filter((e) => (e.conflictReasons ?? []).some((r) => r !== 'gitignore'))
        .map((e) => e.relPath),
    );

    if (verbose) {
      console.log(
        `[verbose] actionCheck: missing=${summary.missing.length}` +
          ` conflict=${summary.conflict.length} extra=${summary.extra.length}`,
      );
    }

    return summary;
  } finally {
    sourceRuntime.cleanup();
    cleanupTempPackageJson(cwd, verbose);
  }
}
