// Main exports
export {
  extract,
  check,
  list,
  purge,
  findNearestMarkerPath,
  compressGitignoreEntries,
} from './fileset/index';
export type { PurgeConfig } from './fileset/purge';
export { initPublisher } from '../../src/publisher';
export { run, runEntries } from './package/runner';

// Type exports
export { DEFAULT_FILENAME_PATTERNS } from '../../src/types';
export type {
  ConsumerConfig,
  FileFilterConfig,
  ManagedFileMetadata,
  NpmdataExtractEntry,
  PublishablePackageJson,
  ConsumerResult,
  CheckResult,
  ProgressEvent,
} from '../../src/types';
export type { PublisherInitOptions, InitResult } from '../../src/publisher';
export { parsePackageSpec, isBinaryFile } from '../../src/utils';
