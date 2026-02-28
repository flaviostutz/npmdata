/**
 * Default filename patterns applied when no filenamePatterns are specified.
 * Excludes common package metadata files that are not meant to be extracted by consumers.
 */
export const DEFAULT_FILENAME_PATTERNS = [
  '**',
  '!package.json',
  '!bin/**',
  '!README.md',
  '!node_modules/**',
];

/**
 * Configuration for filtering which files to include/exclude
 */
export type FileFilterConfig = {
  /**
   * Glob patterns to match filenames (e.g., "*.md", "src/**\/*.ts")
   */
  filenamePatterns?: string[];

  /**
   * Regex patterns to match file contents (files must contain at least one match)
   */
  contentRegexes?: RegExp[];
};

/**
 * Event emitted by extract() as files are processed.
 */
export type ProgressEvent =
  | { type: 'package-start'; packageName: string; packageVersion: string }
  | { type: 'package-end'; packageName: string; packageVersion: string }
  | { type: 'file-added'; packageName: string; file: string }
  | { type: 'file-modified'; packageName: string; file: string }
  | { type: 'file-deleted'; packageName: string; file: string }
  | { type: 'file-skipped'; packageName: string; file: string };

/**
 * Configuration for the consumer
 */
export type ConsumerConfig = FileFilterConfig & {
  /**
   * Package specs to install from registry. Each entry is either a bare package name
   * ("my-pkg") or a name with a semver constraint ("my-pkg@^1.2.3"). Multiple packages
   * can be provided and they will all be extracted into outputDir.
   */
  packages: string[];

  /**
   * Output directory where files will be extracted
   */
  outputDir: string;

  /**
   * Package manager type (auto-detect if not specified)
   */
  packageManager?: 'pnpm' | 'yarn' | 'npm';

  /**
   * Allow creating conflicting files (default: false, will error)
   */
  force?: boolean;

  /**
   * Working directory from which to run package manager install commands (e.g. pnpm add).
   * Defaults to process.cwd() if not specified.
   */
  cwd?: string;

  /**
   * Automatically create/update a .gitignore file alongside each .publisher marker file,
   * adding the managed files and the .publisher file itself to be ignored by git.
   */
  gitignore?: boolean;

  /**
   * When true, simulate extraction without writing anything to disk.
   * The returned ConsumerResult reflects what would have changed.
   */
  dryRun?: boolean;

  /**
   * When true, force a fresh install of each package even if a satisfying version
   * is already installed. Useful to pick up the latest patch or minor release.
   */
  upgrade?: boolean;

  /**
   * Optional callback called for each file event during extraction.
   * Useful for progress reporting in scripts and build tools.
   */
  onProgress?: (event: ProgressEvent) => void;
};

/**
 * Metadata about managed files
 */
export type ManagedFileMetadata = {
  /**
   * Path to the managed file (relative to marker file directory)
   */
  path: string;

  /**
   * Package name that created this file
   */
  packageName: string;

  /**
   * Package version that created this file
   */
  packageVersion: string;

  /**
   * Whether the file was written replacing an existing unmanaged file (via force flag)
   */
  force?: boolean;
};

/**
 * Result of a consumer operation
 */
export type ConsumerResult = {
  added: string[];
  modified: string[];
  deleted: string[];
  skipped: string[];
  sourcePackages: Array<{
    name: string;
    version: string;
    changes: {
      added: string[];
      modified: string[];
      deleted: string[];
      skipped: string[];
    };
  }>;
};

/**
 * Result of a check operation
 */
export type CheckResult = {
  /**
   * Whether all files are in sync
   */
  ok: boolean;

  /**
   * Aggregated files that differ from source (across all packages)
   */
  differences: {
    /**
     * Files that are in the .publisher marker but missing from the output directory
     */
    missing: string[];

    /**
     * Files whose contents differ from the package source
     */
    modified: string[];

    /**
     * Files that exist in the package but have not been extracted yet
     */
    extra: string[];
  };

  /**
   * Per-package breakdown of differences
   */
  sourcePackages: Array<{
    name: string;
    version: string;
    ok: boolean;
    differences: {
      missing: string[];
      modified: string[];
      extra: string[];
    };
  }>;
};

/**
 * npmdata-specific configuration stored inside the publishable package.json
 */
export type NpmdataConfig = {
  /**
   * Additional package specs to include as data sources when the CLI script runs.
   * Each entry is a bare package name ("my-pkg") or a name with a semver constraint
   * ("my-pkg@^1.2.3"). These are merged with the package's own name when extracting.
   */
  additionalPackages?: string[];
};

/**
 * Package.json for a publishable project
 */
export type PublishablePackageJson = {
  name: string;
  version: string;
  description?: string;
  main?: string;
  bin?: string;
  files?: string[];
  dependencies?: Record<string, string>;
  npmdata?: NpmdataConfig;
  [key: string]: unknown;
};
