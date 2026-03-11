#!/usr/bin/env node

import { cli } from './cli';

// setupUncaughtExceptionHandler();

void (async (): Promise<void> => {
  const exitCode = await cli(['node', 'npmdata', ...process.argv.slice(2)], process.cwd());
  process.exit(exitCode);
})();
