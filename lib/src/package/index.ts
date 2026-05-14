// Public package-layer API
export { actionInstall } from './action-install';
export type { InstallOptions, InstallResult } from './action-install';

export { actionCheck } from './action-check';
export type { CheckOptions, CheckSummary } from './action-check';

export { actionList } from './action-list';
export type { ListOptions } from './action-list';

export { actionPurge } from './action-purge';
export type { PurgeOptions, PurgeSummary } from './action-purge';

export { mergeSelectorConfig, mergeOutputConfig } from './config-merge';
