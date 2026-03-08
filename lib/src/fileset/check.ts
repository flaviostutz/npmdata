import fs from 'node:fs';
import path from 'node:path';

import { satisfies } from 'semver';

import {
  ConsumerConfig,
  CheckResult,
  ContentReplacementConfig,
  DEFAULT_FILENAME_PATTERNS,
} from '../types';
import {
  matchesFilenamePattern,
  matchesContentRegex,
  calculateFileHash,
  calculateBufferHash,
  parsePackageSpec,
  getInstalledPackageVersion,
} from '../utils';

import { loadAllManagedFiles } from './markers';
import { getPackageFiles } from './package-files';

/**
 * Compute the expected hash of a package source file as it should appear in the
 * output directory after all content replacements have been applied.
 *
 * When no replacement config is provided (or none matches the file), the hash is
 * computed directly from the on-disk source content.  When one or more replacements
 * match, the source content is transformed in memory and the resulting hash is
 * returned – this makes check() tolerant of post-extract content replacements.
 */
// eslint-disable-next-line complexity
function computeExpectedHash(
  sourceFullPath: string,
  relPath: string,
  outputDir: string,
  cwd: string,
  replacements?: ContentReplacementConfig[],
): string {
  if (!replacements || replacements.length === 0) {
    return calculateFileHash(sourceFullPath);
  }

  // The workspace path of the extracted file, relative to cwd, is used to
  // evaluate the replacement's `files` glob (which is also relative to cwd).
  const workspaceRelPath = path.relative(cwd, path.join(outputDir, relPath));

  const applicable = replacements.filter((r) =>
    matchesFilenamePattern(workspaceRelPath, [r.files]),
  );

  if (applicable.length === 0) {
    return calculateFileHash(sourceFullPath);
  }

  let content = fs.readFileSync(sourceFullPath, 'utf8');
  for (const r of applicable) {
    content = content.replaceAll(new RegExp(r.match, 'gm'), r.replace);
  }
  return calculateBufferHash(content);
}

/**
 * Check if managed files are in sync with published packages.
 *
 * Performs a bidirectional comparison:
 * - Files in the .npmdata marker that are missing from or modified in the output directory.
 * - Files present in the package (matching filters) that have not been extracted yet ("extra").
 *
 * If a version constraint is specified (e.g. "my-pkg@^1.0.0"), the installed version is
 * validated against it so stale installs are caught.
 */
export async function check(config: ConsumerConfig): Promise<CheckResult> {
  const sourcePackages: CheckResult['sourcePackages'] = [];
  const totalDifferences: CheckResult['differences'] = {
    missing: [],
    modified: [],
    extra: [],
  };

  for (const spec of config.packages) {
    const { name, version: constraint } = parsePackageSpec(spec);
    const installedVersion = getInstalledPackageVersion(name, config.cwd);

    if (!installedVersion) {
      throw new Error(`Package ${name} is not installed. Run 'extract' first.`);
    }

    if (constraint && !satisfies(installedVersion, constraint)) {
      throw new Error(
        `Installed version ${installedVersion} of package '${name}' does not satisfy constraint ${constraint}. Run 'extract' to update.`,
      );
    }

    // Load marker entries for this package and apply the --files filter
    const markerFiles = loadAllManagedFiles(config.outputDir)
      .filter((m) => m.packageName === name)
      .filter((m) =>
        matchesFilenamePattern(m.path, config.filenamePatterns ?? DEFAULT_FILENAME_PATTERNS),
      );
    const markerPaths = new Set(markerFiles.map((m) => m.path));

    // Build a hash map of the installed package files (filtered the same way).
    // When content replacements are configured, the expected hash for each affected file
    // is computed from the source content AFTER applying the replacements, so that files
    // modified in-place by a post-extract replacement are not reported as out of sync.
    // eslint-disable-next-line no-await-in-loop
    const packageFiles = await getPackageFiles(name, config.cwd);
    const filteredPackageFiles = packageFiles.filter(
      (f) =>
        matchesFilenamePattern(f.relPath, config.filenamePatterns ?? DEFAULT_FILENAME_PATTERNS) &&
        matchesContentRegex(f.fullPath, config.contentRegexes),
    );
    const effectiveCwd = config.cwd ?? process.cwd();
    const packageHashMap = new Map(
      filteredPackageFiles.map((f) => [
        f.relPath,
        computeExpectedHash(
          f.fullPath,
          f.relPath,
          config.outputDir,
          effectiveCwd,
          config.contentReplacements,
        ),
      ]),
    );

    const pkgDiff: CheckResult['sourcePackages'][number]['differences'] = {
      missing: [],
      modified: [],
      extra: [],
    };

    // Check marker entries against local files and package contents
    for (const markerFile of markerFiles) {
      const localPath = path.join(config.outputDir, markerFile.path);

      if (!fs.existsSync(localPath)) {
        pkgDiff.missing.push(markerFile.path);
        continue;
      }

      const packageHash = packageHashMap.get(markerFile.path);
      // eslint-disable-next-line no-undefined
      if (packageHash !== undefined && calculateFileHash(localPath) !== packageHash) {
        pkgDiff.modified.push(markerFile.path);
      }
    }

    // Detect package files that were never extracted (not in the marker)
    for (const [relPath] of packageHashMap) {
      if (!markerPaths.has(relPath)) {
        pkgDiff.extra.push(relPath);
      }
    }

    const pkgOk =
      pkgDiff.missing.length === 0 && pkgDiff.modified.length === 0 && pkgDiff.extra.length === 0;
    sourcePackages.push({ name, version: installedVersion, ok: pkgOk, differences: pkgDiff });

    totalDifferences.missing.push(...pkgDiff.missing);
    totalDifferences.modified.push(...pkgDiff.modified);
    totalDifferences.extra.push(...pkgDiff.extra);
  }

  return {
    ok:
      totalDifferences.missing.length === 0 &&
      totalDifferences.modified.length === 0 &&
      totalDifferences.extra.length === 0,
    differences: totalDifferences,
    sourcePackages,
  };
}
