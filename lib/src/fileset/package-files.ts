/* eslint-disable functional/no-try-statements */
/* eslint-disable no-continue */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { satisfies } from 'semver';

import { getInstalledPackageVersion } from '../utils';

import { MARKER_FILE } from './constants';

export async function getPackageFiles(
  packageName: string,
  cwd?: string,
): Promise<Array<{ relPath: string; fullPath: string }>> {
  const pkgPath = require.resolve(`${packageName}/package.json`, {
    // eslint-disable-next-line no-undefined
    paths: cwd ? [cwd] : undefined,
  });
  const packagePath = path.dirname(pkgPath);

  if (!packagePath) {
    throw new Error(`Cannot locate installed package: ${packageName}`);
  }

  const contents: Array<{ relPath: string; fullPath: string }> = [];

  const walkDir = (dir: string, basePath = ''): void => {
    for (const file of fs.readdirSync(dir)) {
      if (file === MARKER_FILE) continue;

      const fullPath = path.join(dir, file);
      const relPath = basePath ? `${basePath}/${file}` : file;
      const lstat = fs.lstatSync(fullPath);

      if (!lstat.isSymbolicLink() && lstat.isDirectory()) {
        walkDir(fullPath, relPath);
      } else if (!lstat.isSymbolicLink()) {
        contents.push({ relPath, fullPath });
      }
    }
  };

  walkDir(packagePath);
  return contents;
}

export async function installPackage(
  packageName: string,
  version: string | undefined,
  packageManager: 'npm' | 'yarn' | 'pnpm',
  cwd?: string,
): Promise<void> {
  const packageSpec = version ? `${packageName}@${version}` : `${packageName}@latest`;

  let cmd: string;
  switch (packageManager) {
    case 'pnpm':
      cmd = `pnpm add ${packageSpec}`;
      break;
    case 'yarn':
      cmd = `yarn add ${packageSpec}`;
      break;
    default:
      cmd = `npm install ${packageSpec}`;
  }

  try {
    execSync(cmd, { encoding: 'utf8', stdio: 'pipe', cwd });
  } catch (error: unknown) {
    const e = error as { stderr?: string; stdout?: string; message?: string };
    const detail = (e.stderr ?? e.stdout ?? e.message ?? String(error)).trim();
    throw new Error(`Failed to install ${packageSpec}: ${detail}`);
  }
}

export async function ensurePackageInstalled(
  packageName: string,
  version: string | undefined,
  packageManager: 'npm' | 'yarn' | 'pnpm',
  cwd?: string,
  upgrade?: boolean,
): Promise<string> {
  const existingVersion = getInstalledPackageVersion(packageName, cwd);

  if (!existingVersion) {
    const spec = version ? `${packageName}@${version}` : packageName;
    console.log(`Installing missing package ${spec}...`);
    await installPackage(packageName, version, packageManager, cwd);
  } else if (upgrade) {
    const spec = version ? `${packageName}@${version}` : packageName;
    console.log(`Bumping existing package ${spec}...`);
    await installPackage(packageName, version, packageManager, cwd);
  }

  const installedVersion = getInstalledPackageVersion(packageName, cwd);
  if (!installedVersion) {
    throw new Error(`Couldn't find package ${packageName}`);
  }
  if (version && !satisfies(installedVersion, version)) {
    throw new Error(
      `Installed version ${installedVersion} of package '${packageName}' does not match constraint ${version}`,
    );
  }

  return installedVersion;
}
