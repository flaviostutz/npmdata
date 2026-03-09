#!/usr/bin/env node

import { cli } from './cli/cli';

// eslint-disable-next-line no-void
void (async (): Promise<void> => {
  process.on('uncaughtException', (err) => {
    const errs = `${err}`;
    // eslint-disable-next-line functional/no-let
    let i = errs.indexOf('\n');
    if (i === -1) i = errs.length;
    // eslint-disable-next-line no-console
    console.log(errs.slice(0, Math.max(0, i)));
    process.exit(3);
  });
  // Pass __filename so that config-file mode sub-processes can re-invoke this same script.
  const exitCode = await cli(process.argv, __filename);
  process.exit(exitCode);
})();
