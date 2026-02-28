/* eslint-disable functional/no-let */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type PackageJson = {
  name: string;
  npmdata?: { additionalPackages?: string[] };
};

/**
 * Returns the owning package name plus any additional packages listed in
 * `npmdata.additionalPackages` of the package.json at the given path.
 */
function collectPackages(pkgJsonPath: string): string[] {
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath).toString()) as PackageJson;
  const additional = pkg.npmdata?.additionalPackages ?? [];
  return [pkg.name, ...additional];
}

type RunnerArgs = {
  outputDir: string | undefined;
  force: boolean;
  gitignore: boolean;
  silent: boolean;
  dryRun: boolean;
  upgrade: boolean;
  files: string | undefined;
  contentRegex: string | undefined;
};

function parseArgs(extraArgs: string[]): RunnerArgs {
  let outputDir: string | undefined;
  let force = false;
  let gitignore = false;
  let silent = false;
  let dryRun = false;
  let upgrade = false;
  let files: string | undefined;
  let contentRegex: string | undefined;
  for (let i = 0; i < extraArgs.length; i += 1) {
    if (extraArgs[i] === '--output' || extraArgs[i] === '-o') {
      outputDir = extraArgs[i + 1];
      i += 1;
    } else if (extraArgs[i] === '--force') {
      force = true;
    } else if (extraArgs[i] === '--gitignore') {
      gitignore = true;
    } else if (extraArgs[i] === '--silent') {
      silent = true;
    } else if (extraArgs[i] === '--dry-run') {
      dryRun = true;
    } else if (extraArgs[i] === '--upgrade') {
      upgrade = true;
    } else if (extraArgs[i] === '--files') {
      files = extraArgs[i + 1];
      i += 1;
    } else if (extraArgs[i] === '--content-regex') {
      contentRegex = extraArgs[i + 1];
      i += 1;
    }
  }
  return { outputDir, force, gitignore, silent, dryRun, upgrade, files, contentRegex };
}

/**
 * Runs the npmdata CLI (extract or check) on behalf of a publishable package.
 * Called from the minimal generated bin script with its own __dirname as binDir.
 */
export function run(binDir: string): void {
  const pkgJsonPath = path.join(binDir, '../package.json');
  const allPackages = collectPackages(pkgJsonPath);

  const fpCliPath = require.resolve('npmdata/dist/main.js', {
    paths: [binDir],
  });

  const action = process.argv[2] ?? 'extract';
  if (action !== 'extract' && action !== 'check' && action !== 'list') {
    process.stderr.write(`Invalid action: "${action}". Must be "extract", "check", or "list".\n`);
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }

  const { outputDir, force, gitignore, silent, dryRun, upgrade, files, contentRegex } = parseArgs(
    process.argv.slice(3),
  );

  const outputFlag = outputDir ? ` --output "${outputDir}"` : '';

  let command: string;
  if (action === 'list') {
    command = `node "${fpCliPath}" list${outputFlag}`;
  } else {
    const forceFlag = force ? ' --force' : '';
    const gitignoreFlag = gitignore ? ' --gitignore' : '';
    const silentFlag = silent ? ' --silent' : '';
    const dryRunFlag = dryRun ? ' --dry-run' : '';
    const upgradeFlag = upgrade ? ' --upgrade' : '';
    const filesFlag = files ? ` --files "${files}"` : '';
    const contentRegexFlag = contentRegex ? ` --content-regex "${contentRegex}"` : '';
    command = `node "${fpCliPath}" ${action} --packages "${allPackages.join(',')}"${outputFlag}${forceFlag}${gitignoreFlag}${silentFlag}${dryRunFlag}${upgradeFlag}${filesFlag}${contentRegexFlag}`;
  }

  process.on('uncaughtException', () => {
    process.exit(3);
  });

  execSync(command, { stdio: 'inherit' });
}
