/**
 * Name of the npmdata marker file that tracks managed files.
 */
export const MARKER_FILE = '.npmdata';

/**
 * Default inclusion glob patterns applied when no `files` is specified in SelectorConfig.
 */
export const DEFAULT_FILE_PATTERNS = ['**'];

/**
 * Default exclusion glob patterns applied when no `exclude` is specified in SelectorConfig
 * and the user has not provided custom `files`.
 * Excludes common package metadata files that are not meant to be extracted by consumers.
 */
export const DEFAULT_EXCLUDE_PATTERNS = ['package.json', 'bin/**', 'README.md', 'node_modules/**'];

export const GITIGNORE_FILE = '.gitignore';
export const GITIGNORE_START = '# npmdata:start';
export const GITIGNORE_END = '# npmdata:end';
