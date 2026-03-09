/* eslint-disable no-console */

export function printUsage(): void {
  console.log(`
npmdata

Usage:
  npx npmdata [init|extract|check|purge|list] [options]

Commands:
  init                         Initialize publishing configuration
  extract                      Extract files from one or more published packages
  check                        Verify if local files are in sync with packages
  purge                        Remove all managed files written by given packages
  list                         List all managed files in the output directory

Global Options:
  --help, -h                   Show this help message
  --version                    Show version
  --verbose, -v                Print detailed progress information for each step

Init Options:
  --files <patterns>           Comma-separated glob patterns of files to publish (required)
                               e.g. "docs/**,data/**,configs/*.json"
  --packages <specs>           Comma-separated additional package specs to use as data sources.
                               Each spec is "name" or "name@version"
                               e.g. "shared-data@^1.0.0,other-pkg@2.x"
  --unmanaged                  Mark all npmdata entries as unmanaged (see Extract options)
  --verbose, -v                Print detailed progress information for each step

Extract / Check Options:
  --packages <specs>           Comma-separated package specs to extract from.
                               When omitted, npmdata searches for a configuration file
                               (package.json "npmdata" key, .npmdatarc, etc.) and runs
                               all entries defined there.
                               Each spec is "name" or "name@version"
                               e.g. "my-pkg@^1.2.3,other-pkg@2.x"
  --output, -o <dir>           Output directory (default: current directory, with a warning)
  --force                      Allow overwriting existing unmanaged files
  --keep-existing              Skip files that already exist in the output directory;
                               create them when absent. Cannot be combined with --force
  --no-gitignore               Skip creating/updating .gitignore (gitignore is enabled by default)
  --unmanaged                  Write files without a .npmdata marker, .gitignore update, or
                               read-only flag. Existing files are skipped. Files can be freely
                               edited afterwards and are not tracked by npmdata.
  --dry-run                    Simulate extraction without writing any files
  --upgrade                    Re-install packages even when a satisfying version is installed
  --silent                     Print only the final result line, suppressing package and file listing
  --verbose, -v                Print detailed progress information for each step
  --files <pattern>            Comma-separated shell glob patterns to filter files
  --content-regex <regex>      Regex pattern to match file contents

Purge Options:
  --packages <specs>           Comma-separated package names whose managed files should be removed.
                               When omitted, npmdata searches for a configuration file
                               (package.json "npmdata" key, .npmdatarc, etc.) and purges
                               all entries defined there.
  --output, -o <dir>           Output directory to purge from (default: current directory)
  --dry-run                    Simulate purge without removing any files
  --silent                     Suppress per-file output
  --verbose, -v                Print detailed progress information for each step

List Options:
  --output, -o <dir>           Directory to inspect (default: current directory)
  --verbose, -v                Print detailed progress information for each step

Examples:
  npx npmdata init --files "data/**,docs/**,configs/*.json"
  npx npmdata extract --packages mydataset --output ./data
  npx npmdata extract --packages mydataset@^2.0.0 --output ./data
  npx npmdata extract --packages "mydataset@^2.0.0,otherpkg@1.x" --output ./data
  npx npmdata extract          # reads npmdata config from package.json or .npmdatarc
  npx npmdata check            # reads npmdata config from package.json or .npmdatarc
  npx npmdata purge            # reads npmdata config from package.json or .npmdatarc
  npx npmdata extract --packages mydataset --dry-run --output ./data
  npx npmdata extract --packages mydataset --silent --output ./data
  npx npmdata extract --packages mydataset --upgrade --output ./data
  npx npmdata extract --packages mydataset --files "*.md,docs/**" --output ./docs
  npx npmdata check --packages mydataset --output ./data
  npx npmdata check --packages "mydataset,otherpkg" --output ./data
  npx npmdata list --output ./data
  npx npmdata purge --packages mydataset --output ./data
  npx npmdata purge --packages "mydataset,otherpkg" --output ./data
`);
}
