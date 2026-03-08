#!/usr/bin/env node
/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';

import { printUsage } from './usage';
import { handleInit } from './commands/init';
import { handleList } from './commands/list';
import { handlePurge } from './commands/purge';
import { handleExtract } from './commands/extract';
import { handleCheck } from './commands/check';

/**
 * CLI for npmdata
 */
export async function cli(processArgs: string[], cliPath?: string): Promise<number> {
  const args = processArgs.slice(2);

  // Handle global help and version flags before defaulting to extract
  if (args.length > 0 && (args[0] === '--help' || args[0] === '-h')) {
    printUsage();
    return 0;
  }

  if (args.length > 0 && args[0] === '--version') {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json')).toString());
    console.log(pkg.version);
    return 0;
  }

  // Default to 'extract' when no args are given or when the first arg is a flag
  const command = args.length === 0 || args[0].startsWith('-') ? 'extract' : args[0];
  const argsOffset = args.length === 0 || args[0].startsWith('-') ? 0 : 1;

  if (command === 'init') {
    return handleInit(args, printUsage);
  }

  if (command === 'list') {
    return handleList(args);
  }

  if (command === 'purge') {
    return handlePurge(args, processArgs, cliPath, printUsage);
  }

  if (['extract', 'check'].includes(command)) {
    if (command === 'extract') {
      return handleExtract(args, argsOffset, processArgs, cliPath, printUsage);
    }
    return handleCheck(args, argsOffset, processArgs, cliPath, printUsage);
  }

  console.error(
    `Error: unknown command '${command}'. Use 'init', 'extract', 'check', 'purge', or 'list'`,
  );
  printUsage();
  return 1;
}
