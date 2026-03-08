/* eslint-disable no-plusplus */
/* eslint-disable no-console */
import path from 'node:path';

import { purge } from '../../fileset/index';
import { runEntries } from '../../package/index';
import { ProgressEvent } from '../../types';
import { loadNpmdataConfig } from '../config';

/**
 * Handle the 'purge' CLI command.
 * @param args        - process.argv sliced to remove the node binary and script path.
 *                      args[0] is expected to be 'purge'.
 * @param processArgs - original process.argv (used for config-file mode runEntries call).
 * @param cliPath     - override for the CLI entry-point path used by sub-processes.
 * @param printUsage  - function to print CLI usage text.
 */
// eslint-disable-next-line complexity
export async function handlePurge(
  args: string[],
  processArgs: string[],
  cliPath: string | undefined,
  printUsage: () => void,
): Promise<number> {
  let purgePackageSpecs: string | undefined;
  let purgeOutDir = process.cwd();
  let purgeOutputFlagProvided = false;
  let purgeDryRun = false;
  let purgeSilent = false;
  let purgeVerbose = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--packages') {
      purgePackageSpecs = args[++i];
    } else if (args[i] === '--output' || args[i] === '-o') {
      purgeOutDir = args[++i];
      purgeOutputFlagProvided = true;
    } else if (args[i] === '--dry-run') {
      purgeDryRun = true;
    } else if (args[i] === '--silent') {
      purgeSilent = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      purgeVerbose = true;
    } else if (!args[i].startsWith('-')) {
      purgeOutDir = args[i];
      purgeOutputFlagProvided = true;
    }
  }

  if (!purgePackageSpecs) {
    const npmdataConfig = await loadNpmdataConfig();
    // eslint-disable-next-line no-undefined
    if (npmdataConfig !== undefined) {
      const effectiveCliPath = cliPath ?? processArgs[1];
      runEntries(
        npmdataConfig.sets,
        'purge',
        processArgs,
        effectiveCliPath,
        npmdataConfig.postExtractScript,
      );
      return 0;
    }
    console.error(`Error: --packages option is required for 'purge' command`);
    printUsage();
    return 1;
  }

  if (!purgeOutputFlagProvided && !purgeSilent) {
    console.info(`No --output specified. Using current directory: ${purgeOutDir}`);
  }

  const purgePackages = purgePackageSpecs.split(',').map((s) => s.trim());

  if (purgeVerbose) {
    console.log(`[verbose] purge: packages to remove: ${purgePackages.join(', ')}`);
    console.log(`[verbose] purge: output directory: ${path.resolve(purgeOutDir)}`);
    console.log(`[verbose] purge: dryRun=${purgeDryRun}`);
  }

  const purgeOnProgress = purgeSilent
    ? // eslint-disable-next-line no-undefined
      undefined
    : (event: ProgressEvent): void => {
        switch (event.type) {
          case 'package-start':
            console.log(`>> Package ${event.packageName}`);
            if (purgeVerbose) {
              console.log(
                `[verbose] purge: starting removal of managed files for ${event.packageName}`,
              );
            }
            break;
          case 'file-deleted':
            console.log(`D\t${event.file}`);
            if (purgeVerbose) {
              console.log(`[verbose] purge: deleted file: ${event.file}`);
            }
            break;
          default:
            break;
        }
      };

  if (!purgeSilent) {
    if (purgeDryRun) console.info('Dry run: simulating purge (no files will be removed)...');
    else console.info('Purging managed files...');
  }

  const purgeResult = await purge({
    packages: purgePackages,
    outputDir: path.resolve(purgeOutDir),
    dryRun: purgeDryRun,
    onProgress: purgeOnProgress,
  });

  console.log(
    `Purge complete: ${purgeResult.deleted.length} deleted${purgeDryRun ? ' (dry run)' : ''}`,
  );
  return 0;
}
