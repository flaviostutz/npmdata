import { cosmiconfig } from 'cosmiconfig';

import { NpmdataConfig } from '../types';

/**
 * Search for an npmdata configuration using cosmiconfig.
 * Looks for:
 *   - "npmdata" key in package.json (object with "sets" array)
 *   - .npmdatarc  (JSON or YAML object with "sets" array)
 *   - .npmdatarc.json / .npmdatarc.yaml / .npmdatarc.js
 *   - npmdata.config.js
 *
 * The resolved value must be an object with a "sets" array of NpmdataExtractEntry objects.
 * Returns the sets array when found, or undefined when no configuration is present.
 */
export async function loadNpmdataConfig(): Promise<NpmdataConfig | undefined> {
  const explorer = cosmiconfig('npmdata');
  const result = await explorer.search();
  if (!result || result.isEmpty) {
    // eslint-disable-next-line no-undefined
    return undefined;
  }
  const cfg = result.config as NpmdataConfig;
  if (!cfg || !Array.isArray(cfg.sets) || cfg.sets.length === 0) {
    // eslint-disable-next-line no-undefined
    return undefined;
  }
  return cfg;
}
