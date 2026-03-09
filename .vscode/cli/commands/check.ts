/* eslint-disable no-plusplus */
/* eslint-disable no-console */
import path from 'node:path';

import { check } from '../../fileset/index';
import { runEntries } from '../../package/index';
import { ConsumerConfig, ProgressEvent } from '../../types';
import { loadNpmdataConfig } from '../config';

/**
 * Handle the 'check' CLI command.
 * @param args        - process.argv sliced to remove the node binary and script path.
 * @param argsOffset  - index in args where flag parsing should begin (1 if command name
 *                      was consumed).
 * @param processArgs - original process.argv (used for config-file mode).
 * @param cliPath     - override for the CLI entry-point path used by sub-processes.
 * @param printUsage  - function to print CLI usage text.
 */
// eslint-disable-next-line complexity
export async function handleCheck(
  args: string[],
  argsOffset: number,
  processArgs: string[],
  cliPath: string | undefined,
  printUsage: () => void,
): Promise<number> {
  let packageSpecs: string | undefined;
  let force = false;
  let keepExisting = false;
  let gitignore = true;
  let dryRun = false;
  let upgrade = false;
  let silent = false;
  let verbose = false;
  let unmanaged = false;
  let filenamePatterns: string | undefined;
  let contentRegexes: string | undefined;
  let outDir = process.cwd();
  let outputFlagProvided = false;

  for (let i = argsOffset; i < args.length; i++) {
    if (args[i] === '--packages') {
      packageSpecs = args[++i];
    } else if (args[i] === '--force') {
      force = true;
    } else if (args[i] === '--keep-existing') {
      keepExisting = true;
    } else if (args[i] === '--silent') {
      silent = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      verbose = true;
    } else if (args[i] === '--no-gitignore') {
      gitignore = false;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    } else if (args[i] === '--upgrade') {
      upgrade = true;
    } else if (args[i] === '--unmanaged') {
      unmanaged = true;
    } else if (args[i] === '--files') {
      filenamePatterns = args[++i];
    } else if (args[i] === '--content-regex') {
      contentRegexes = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      outDir = args[++i];
      outputFlagProvided = true;
    } else if (!args[i].startsWith('-')) {
      outDir = args[i];
      outputFlagProvided = true;
    }
  }

  if (!packageSpecs) {
    const npmdataConfig = await loadNpmdataConfig();
    // eslint-disable-next-line no-undefined
    if (npmdataConfig !== undefined) {
      const effectiveCliPath = cliPath ?? processArgs[1];
      runEntries(
        npmdataConfig.sets,
        'check',
        processArgs,
        effectiveCliPath,
        npmdataConfig.postExtractScript,
      );
      return 0;
    }
    console.error(`Error: --packages option is required for 'check' command`);
    printUsage();
    return 1;
  }

  if (!outputFlagProvided && !silent) {
    console.info(`No --output specified. Using current directory: ${outDir}`);
  }

  if (verbose && !silent) {
    console.log(`[verbose] check: packages=${packageSpecs} output=${path.resolve(outDir)}`);
  }

  if (force && keepExisting) {
    console.error('Error: --force and --keep-existing cannot be used together');
    return 1;
  }

  const packages = packageSpecs.split(',').map((s) => s.trim());

  // Build onProgress handler that prints file-level events grouped by package
  const onProgress = silent
    ? // eslint-disable-next-line no-undefined
      undefined
    : (event: ProgressEvent): void => {
        switch (event.type) {
          case 'package-start':
            console.log(`>> Package ${event.packageName}@${event.packageVersion}`);
            if (verbose) {
              console.log(
                `[verbose] check: starting processing of package ${event.packageName}@${event.packageVersion}`,
              );
            }
            break;
          case 'file-added':
            console.log(`A\t${event.file}`);
            if (verbose) {
              console.log(`[verbose] check: added file: ${event.file}`);
            }
            break;
          case 'file-modified':
            console.log(`M\t${event.file}`);
            if (verbose) {
              console.log(`[verbose] check: modified file: ${event.file}`);
            }
            break;
          case 'file-deleted':
            console.log(`D\t${event.file}`);
            if (verbose) {
              console.log(`[verbose] check: deleted file: ${event.file}`);
            }
            break;
          case 'file-skipped':
            if (verbose) {
              console.log(`[verbose] check: skipped file: ${event.file}`);
            }
            break;
          case 'package-end':
            if (verbose) {
              console.log(
                `[verbose] check: finished processing package ${event.packageName}@${event.packageVersion}`,
              );
            }
            break;
          default:
            break;
        }
      };

  const config: ConsumerConfig = {
    packages,
    outputDir: path.resolve(outDir),
    force,
    keepExisting,
    gitignore,
    dryRun,
    upgrade,
    unmanaged,
    onProgress,
    filenamePatterns: filenamePatterns
      ? filenamePatterns.split(',')
      : // eslint-disable-next-line no-undefined
        undefined,
    contentRegexes: contentRegexes
      ? contentRegexes.split(',').map((r) => new RegExp(r))
      : // eslint-disable-next-line no-undefined
        undefined,
  };

  const relDir = path.relative(process.cwd(), config.outputDir) || '.';
  console.log(`Checking data from ${config.packages.join(', ')} against ${relDir}...`);
  if (verbose) {
    console.log(`[verbose] check: resolved output directory: ${config.outputDir}`);
    console.log(`[verbose] check: installing/resolving packages: ${config.packages.join(', ')}`);
  }
  const result = await check(config);
  if (verbose) {
    console.log(
      `[verbose] check: comparison complete, ${result.sourcePackages.length} package${result.sourcePackages.length === 1 ? '' : 's'} checked`,
    );
  }

  for (const pkg of result.sourcePackages) {
    const pkgLabel = `${pkg.name}@${pkg.version}`;
    if (pkg.ok) {
      console.log(`  ${pkgLabel}: in sync`);
      if (verbose) {
        console.log(`[verbose] check: package ${pkgLabel} - all files match`);
      }
    } else {
      console.log(`  ${pkgLabel}: out of sync`);
      if (verbose) {
        console.log(
          `[verbose] check: package ${pkgLabel} - missing=${pkg.differences.missing.length} modified=${pkg.differences.modified.length} extra=${pkg.differences.extra.length}`,
        );
      }
      for (const f of pkg.differences.missing) console.log(`    - missing:  ${f}`);
      for (const f of pkg.differences.modified) console.log(`    ~ modified: ${f}`);
      for (const f of pkg.differences.extra) console.log(`    + extra:    ${f}`);
    }
  }

  if (result.ok) {
    console.log('All files are in sync');
    return 0;
  }

  console.log('Files are out of sync');
  return 2;
}
