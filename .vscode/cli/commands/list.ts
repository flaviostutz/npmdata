/* eslint-disable no-plusplus */
/* eslint-disable no-console */
import path from 'node:path';

import { list } from '../../fileset/index';

/**
 * Handle the 'list' CLI command.
 * @param args - process.argv sliced to remove the node binary and script path.
 *               args[0] is expected to be 'list'.
 */
export function handleList(args: string[]): number {
  let outDir = process.cwd();
  let outputFlagProvided = false;
  let listVerbose = false;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' || args[i] === '-o') {
      outDir = args[++i];
      outputFlagProvided = true;
    } else if (args[i] === '--verbose' || args[i] === '-v') {
      listVerbose = true;
    } else if (!args[i].startsWith('-')) {
      outDir = args[i];
      outputFlagProvided = true;
    }
  }

  if (!outputFlagProvided) {
    console.info(`Listing managed files in current directory: ${outDir}`);
  }

  if (listVerbose) {
    console.log(`[verbose] list: resolved output directory: ${path.resolve(outDir)}`);
    console.log(`[verbose] list: scanning for .npmdata marker files...`);
  }

  const entries = list(path.resolve(outDir));

  if (listVerbose) {
    console.log(
      `[verbose] list: found ${entries.length} managed package entr${entries.length === 1 ? 'y' : 'ies'}`,
    );
  }

  if (entries.length === 0) {
    console.log('No managed files found.');
    return 0;
  }

  for (const entry of entries) {
    if (listVerbose) {
      console.log(
        `[verbose] list: package ${entry.packageName}@${entry.packageVersion} has ${entry.files.length} managed file${entry.files.length === 1 ? '' : 's'}`,
      );
    }
    console.log(`\n${entry.packageName}@${entry.packageVersion} (${entry.files.length} files)`);
    for (const f of entry.files) {
      console.log(`  ${f}`);
    }
  }
  return 0;
}
