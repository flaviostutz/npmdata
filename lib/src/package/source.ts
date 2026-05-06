/* eslint-disable no-console */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { FiledistExtractEntry } from '../types';
import { formatDisplayPath, installOrUpgradePackage, spawnWithLog } from '../utils';

export type PackageTarget = {
  source: 'npm' | 'git';
  packageName: string;
  requestedVersion?: string;
  repository?: string;
};

export type ResolvedPackageSource = {
  source: 'npm' | 'git';
  packageName: string;
  packageVersion: string;
  packagePath: string;
};

export type SourceRuntime = {
  resolvePackage: (entry: FiledistExtractEntry, upgrade: boolean) => Promise<ResolvedPackageSource>;
  cleanup: () => void;
};

type PackageSourceKind = 'npm' | 'git';

const GIT_SOURCE_REGEX = /^(?:https?|ssh|git|file):\/\/|^git@/i;
const SOURCE_PREFIX_REGEX = /^(npm|git):(.*)$/s;
const GIT_HOST_PATH_REGEX = /^[\d.A-Za-z-]+\.[A-Za-z]{2,}(?::\d+)?[/:].+/;

export function parsePackageTarget(spec: string): PackageTarget {
  const { source, value } = parsePackageSpecWithSource(spec);
  if (source === 'npm') {
    if (GIT_SOURCE_REGEX.test(value)) {
      throw new Error(
        `Git repository specs must use the "git:" prefix. Received "${spec}". ` +
          'Use a package string such as "git:github.com/org/repo.git@ref".',
      );
    }

    const atIdx = value.lastIndexOf('@');
    if (atIdx > 0) {
      const requestedVersion = value.slice(atIdx + 1);
      return {
        source,
        packageName: value.slice(0, atIdx),
        ...(requestedVersion ? { requestedVersion } : {}),
      };
    }
    return { source, packageName: value };
  }

  const normalizedSpec = normalizeGitSpec(value);
  const { repository, ref } = splitGitSpec(normalizedSpec);
  return {
    source,
    packageName: normalizeGitRepository(repository),
    ...(ref ? { requestedVersion: ref } : {}),
    repository,
  };
}

export function createSourceRuntime(cwd: string, verbose = false): SourceRuntime {
  const packageCache = new Map<string, ResolvedPackageSource>();
  const cloneDirs = new Set<string>();
  const tempRoot = path.join(cwd, '.filedist-tmp');

  const ensureTempRoot = (): void => {
    if (!fs.existsSync(tempRoot)) {
      fs.mkdirSync(tempRoot, { recursive: true });
      if (verbose) {
        console.log(
          `[verbose] source: created temp git directory ${formatDisplayPath(tempRoot, cwd)}`,
        );
      }
    }
    ensureGitignoreContains(cwd, '.filedist-tmp');
  };

  return {
    async resolvePackage(
      entry: FiledistExtractEntry,
      upgrade: boolean,
    ): Promise<ResolvedPackageSource> {
      if (!entry.package) {
        throw new Error('resolvePackage requires an entry with a package spec');
      }

      const target = parsePackageTarget(entry.package);
      const sparsePatterns = entry.selector?.files ?? [];
      const patternsKey = [...sparsePatterns].sort().join('\0');
      const cacheKey = `${target.source}|${target.packageName}|${target.requestedVersion ?? ''}|${patternsKey}`;

      if (!upgrade) {
        const cached = packageCache.get(cacheKey);
        if (cached) return cached;
      }

      const resolved =
        target.source === 'git'
          ? resolveGitPackage(target, cwd, tempRoot, ensureTempRoot, verbose, sparsePatterns)
          : resolveNpmPackage(target, upgrade, cwd, verbose);

      const packageSource = await resolved;
      packageCache.set(cacheKey, packageSource);
      if (packageSource.source === 'git') {
        cloneDirs.add(packageSource.packagePath);
      }
      return packageSource;
    },
    cleanup(): void {
      for (const cloneDir of cloneDirs) {
        if (fs.existsSync(cloneDir)) {
          fs.rmSync(cloneDir, { recursive: true, force: true });
        }
      }
      cloneDirs.clear();

      if (fs.existsSync(tempRoot)) {
        try {
          if (fs.readdirSync(tempRoot).length === 0) {
            fs.rmdirSync(tempRoot);
          }
        } catch {
          // ignore cleanup failures
        }
      }
    },
  };
}

function parsePackageSpecWithSource(spec: string): { source: PackageSourceKind; value: string } {
  const match = spec.match(SOURCE_PREFIX_REGEX);
  if (!match) {
    return { source: 'npm', value: spec };
  }

  const [, source, value] = match;
  if (!value) {
    throw new Error(`Package spec is missing a value after the "${source}:" prefix.`);
  }

  return { source: source as PackageSourceKind, value };
}

function normalizeGitSpec(spec: string): string {
  if (GIT_SOURCE_REGEX.test(spec)) {
    return spec;
  }

  if (GIT_HOST_PATH_REGEX.test(spec)) {
    return `https://${spec}`;
  }

  throw new Error(
    `Git package specs must point to a repository URL or host/path. Received "${spec}". ` +
      'Use a package string such as "git:https://host/org/repo.git@ref" or ' +
      '"git:github.com/org/repo.git@ref".',
  );
}

function splitGitSpec(spec: string): { repository: string; ref?: string } {
  if (spec.startsWith('git@')) {
    const firstAt = spec.indexOf('@');
    const lastAt = spec.lastIndexOf('@');
    if (lastAt > firstAt) {
      const ref = spec.slice(lastAt + 1);
      return { repository: spec.slice(0, lastAt), ...(ref ? { ref } : {}) };
    }
    return { repository: spec };
  }

  const schemeEnd = spec.indexOf('://');
  if (schemeEnd !== -1) {
    const authStart = schemeEnd + 3;
    const pathStart = spec.indexOf('/', authStart);
    const authEnd = pathStart === -1 ? spec.length : pathStart;
    const lastAt = spec.lastIndexOf('@');
    if (lastAt >= authEnd) {
      const ref = spec.slice(lastAt + 1);
      return { repository: spec.slice(0, lastAt), ...(ref ? { ref } : {}) };
    }
    return { repository: spec };
  }

  throw new Error(
    `Git package specs must point to a repository URL or host/path. Received "${spec}". ` +
      'Use a package string such as "git:https://host/org/repo.git@ref" or ' +
      '"git:github.com/org/repo.git@ref".',
  );
}

function normalizeGitRepository(repository: string): string {
  return repository.replace(/\/+$/, '');
}

async function resolveNpmPackage(
  target: PackageTarget,
  upgrade: boolean,
  cwd: string,
  verbose: boolean,
): Promise<ResolvedPackageSource> {
  const packagePath = await installOrUpgradePackage(
    target.packageName,
    target.requestedVersion,
    upgrade,
    cwd,
    verbose,
  );

  let installedVersion = '0.0.0';
  try {
    const pkgJsonContent = JSON.parse(
      fs.readFileSync(path.join(packagePath, 'package.json')).toString(),
    ) as { version: string };
    installedVersion = pkgJsonContent.version;
  } catch {
    // fallback
  }

  return {
    source: 'npm',
    packageName: target.packageName,
    packageVersion: installedVersion,
    packagePath,
  };
}

async function resolveGitPackage(
  target: PackageTarget,
  cwd: string,
  tempRoot: string,
  ensureTempRoot: () => void,
  verbose: boolean,
  sparsePatterns: string[] = [],
): Promise<ResolvedPackageSource> {
  ensureTempRoot();

  const cloneDir = path.join(tempRoot, buildCloneDirName(target, sparsePatterns));
  if (fs.existsSync(cloneDir)) {
    fs.rmSync(cloneDir, { recursive: true, force: true });
  }

  if (verbose) {
    console.log(
      `[verbose] source: cloning ${target.repository} into ${formatDisplayPath(cloneDir, cwd)}`,
    );
  }

  if (sparsePatterns.length > 0) {
    // Sparse clone: fetch tree objects but defer blob downloads until checkout
    spawnWithLog(
      'git',
      ['clone', '--filter=blob:none', '--no-checkout', '--sparse', target.repository!, cloneDir],
      cwd,
      verbose,
      true,
    );

    // Always include config file names so nested filedist config loading works
    const configFilePatterns = [
      'package.json',
      '.filedistrc',
      '.filedistrc.json',
      '.filedistrc.yaml',
      '.filedistrc.yml',
      'filedist.config.js',
      'filedist.config.cjs',
    ];
    const allPatterns = [...new Set([...configFilePatterns, ...sparsePatterns])];
    spawnWithLog(
      'git',
      ['-C', cloneDir, 'sparse-checkout', 'set', '--no-cone', ...allPatterns],
      cwd,
      verbose,
      true,
    );

    // Checkout the desired ref (or HEAD when no version is specified)
    const checkoutArgs = target.requestedVersion
      ? ['-C', cloneDir, 'checkout', target.requestedVersion]
      : ['-C', cloneDir, 'checkout'];
    spawnWithLog('git', checkoutArgs, cwd, verbose, true);
  } else {
    // No file patterns specified: perform a full clone
    spawnWithLog('git', ['clone', target.repository!, cloneDir], cwd, verbose, true);
    if (target.requestedVersion) {
      spawnWithLog(
        'git',
        ['-C', cloneDir, 'checkout', target.requestedVersion],
        cwd,
        verbose,
        true,
      );
    }
  }

  const revision = spawnWithLog('git', ['-C', cloneDir, 'rev-parse', 'HEAD'], cwd, verbose, true)
    .stdout.toString()
    .trim();
  const gitDir = path.join(cloneDir, '.git');
  if (fs.existsSync(gitDir)) {
    fs.rmSync(gitDir, { recursive: true, force: true });
  }

  return {
    source: 'git',
    packageName: target.packageName,
    packageVersion: revision || target.requestedVersion || 'HEAD',
    packagePath: cloneDir,
  };
}

function buildCloneDirName(target: PackageTarget, sparsePatterns: string[] = []): string {
  const pathSegments = target.packageName.split(/[/:]/).filter(Boolean);
  const lastPathSegment = pathSegments.at(-1);
  const baseName = lastPathSegment?.replace(/\.git$/, '')?.replace(/[^\w.-]+/g, '-') ?? 'repo';
  const patternsFingerprint = [...sparsePatterns].sort().join('\0');
  const digest = crypto
    .createHash('sha1')
    .update(`${target.packageName}@${target.requestedVersion ?? ''}\0${patternsFingerprint}`)
    .digest('hex')
    .slice(0, 12);
  return `${baseName}-${digest}`;
}

function ensureGitignoreContains(cwd: string, entry: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${entry}\n`);
    return;
  }

  const lines = fs
    .readFileSync(gitignorePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim());
  if (!lines.includes(entry)) {
    fs.appendFileSync(gitignorePath, `\n${entry}\n`);
  }
}
