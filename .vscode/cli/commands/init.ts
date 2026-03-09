/* eslint-disable no-plusplus */
/* eslint-disable no-console */
import { initPublisher } from '../../publisher';

/**
 * Handle the 'init' CLI command.
 * @param args  - process.argv sliced to remove the node binary and script path.
 *                args[0] is expected to be 'init'.
 * @param printUsage - function to print CLI usage text.
 */
// eslint-disable-next-line complexity
export async function handleInit(args: string[], printUsage: () => void): Promise<number> {
  let sourceFilesFlag: string | undefined;
  let additionalPackagesFlag: string | undefined;
  let initGitignore = true;
  let initUnmanaged = false;
  let initVerbose = false;

  // Parse args for --files and --packages flags (start after 'init' at index 0)
  for (let i = 1; i < args.length; i += 1) {
    if (args[i] === '--files') {
      sourceFilesFlag = args[++i];
    } else if (args[i] === '--packages') {
      additionalPackagesFlag = args[++i];
    } else if (args[i] === '--no-gitignore') {
      initGitignore = false;
    } else if (args[i] === '--unmanaged') {
      initUnmanaged = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      initVerbose = true;
    }
  }

  // --files is required
  if (!sourceFilesFlag) {
    console.error('Error: --files option is required for init command');
    printUsage();
    return 1;
  }

  const fileGlobs = sourceFilesFlag.split(',').map((f) => f.trim());
  const additionalPackages = additionalPackagesFlag
    ? additionalPackagesFlag.split(',').map((p) => p.trim())
    : [];

  if (initVerbose) {
    console.log(`[verbose] init: file patterns: ${fileGlobs.join(', ')}`);
    if (additionalPackages.length > 0)
      console.log(`[verbose] init: additional packages: ${additionalPackages.join(', ')}`);
    console.log(`[verbose] init: gitignore=${initGitignore} unmanaged=${initUnmanaged}`);
    console.log(`[verbose] init: writing publisher configuration...`);
  }

  const result = await initPublisher(fileGlobs, {
    additionalPackages,
    gitignore: initGitignore,
    ...(initUnmanaged ? { unmanaged: true } : {}),
  });

  if (!result.success) {
    console.error(`\nError: ${result.message}`);
    return 1;
  }

  if (initVerbose) {
    console.log(`[verbose] init: configuration written successfully`);
  }
  console.log(`\n${result.message}`);
  if (result.publishedFiles) {
    console.log(
      `\nThe following file patterns will be published: ${result.publishedFiles.join(', ')}`,
    );
  }
  if (result.additionalPackages && result.additionalPackages.length > 0) {
    console.log(`\nAdditional data source packages: ${result.additionalPackages.join(', ')}`);
  }

  return 0;
}
