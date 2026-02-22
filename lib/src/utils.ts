import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { minimatch } from 'minimatch';

/**
 * Get hash of file contents
 */
export function getFileHash(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Check if file matches pattern
 */
export function matchesFilenamePattern(filePath: string, patterns?: string | string[]): boolean {
  if (!patterns) return true;

  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  const fileName = path.basename(filePath);
  const absolutePath = path.resolve(filePath);

  // Separate inclusive and exclusive patterns
  const includePatterns = patternList.filter((p) => !p.startsWith('!'));
  const excludePatterns = patternList.filter((p) => p.startsWith('!')).map((p) => p.slice(1));

  // If there are exclude patterns, check for matches
  if (excludePatterns.length > 0) {
    for (const pattern of excludePatterns) {
      if (matchesPattern(filePath, fileName, absolutePath, pattern)) {
        return false; // Excluded
      }
    }
  }

  // If there are include patterns, check for matches
  if (includePatterns.length > 0) {
    return includePatterns.some((pattern) => matchesPattern(filePath, fileName, absolutePath, pattern));
  }

  // If only exclude patterns exist and no match, include the file
  return true;
}

function matchesPattern(filePath: string, fileName: string, absolutePath: string, pattern: string): boolean {
  // Use minimatch for glob pattern matching
  if (pattern.includes('**')) {
    return minimatch(absolutePath, pattern, { matchBase: true });
  }
  // Simple glob matching for file name
  return minimatch(fileName, pattern);
}

/**
 * Check if file contents match regex patterns
 */
export function matchesContentRegex(filePath: string, patterns?: RegExp | RegExp[]): boolean {
  if (!patterns) return true;

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const patternList = Array.isArray(patterns) ? patterns : [patterns];

    return patternList.some((pattern) => pattern.test(content));
  } catch {
    // If file can't be read as text, skip file
    console.warn(`Warning: Could not read file ${filePath} for content regex check. Skipping file.`);
    return false;
  }
}

/**
 * Recursively find all files in directory matching filters
 */
export function findMatchingFiles(
  dir: string,
  filenamePattern?: string | string[],
  contentRegex?: RegExp | RegExp[],
): string[] {
  const results: string[] = [];

  function walkDir(currentDir: string) {
    const files = fs.readdirSync(currentDir);

    for (const file of files) {
      const fullPath = path.join(currentDir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        if (!file.startsWith('.')) {
          // Skip hidden directories
          walkDir(fullPath);
        }
      } else if (
        matchesFilenamePattern(fullPath, filenamePattern) &&
        matchesContentRegex(fullPath, contentRegex)
      ) {
        results.push(fullPath);
      }
    }
  }

  walkDir(dir);
  return results;
}

/**
 * Create directory recursively
 */
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Remove file with error handling
 */
export function removeFile(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.chmodSync(filePath, 0o644); // Make writable before deleting
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    throw new Error(`Failed to remove file ${filePath}: ${String(error)}`);
  }
}

/**
 * Copy file preserving directory structure
 */
export function copyFile(src: string, dest: string): void {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/**
 * Detect package manager type
 */
export function detectPackageManager(): 'npm' | 'yarn' | 'pnpm' {
  try {
    const lockFiles = fs.readdirSync('.');
    if (lockFiles.includes('pnpm-lock.yaml')) return 'pnpm';
    if (lockFiles.includes('yarn.lock')) return 'yarn';
    if (lockFiles.includes('package-lock.json')) return 'npm';
  } catch {
    // Continue to env check
  }

  // Check npm_config_user_agent environment variable
  const userAgent = process.env.npm_config_user_agent || '';
  if (userAgent.includes('yarn')) return 'yarn';
  if (userAgent.includes('pnpm')) return 'pnpm';

  return 'npm'; // Default fallback
}

/**
 * Get package info from installed package
 */
export function getInstalledPackageVersion(
  packageName: string,
  packageManager: 'npm' | 'yarn' | 'pnpm' = 'npm',
): string | null {
  try {
    const pkgPath = require.resolve(`${packageName}/package.json`);
    const pkg = JSON.parse(fs.readFileSync(pkgPath).toString());
    return pkg.version;
  } catch {
    return null;
  }
}

/**
 * Validate semver constraint
 */
export function validateSemverMatch(installedVersion: string, versionConstraint?: string): boolean {
  if (!versionConstraint) return true;

  // Simple semver matching - supports patterns like "1.0.0", "^1.0.0", "~1.0.0", ">=1.0.0"
  // For now, do exact match or range validation
  if (installedVersion === versionConstraint) return true;

  const [major, minor, patch] = installedVersion.split('.').map((x) => Number.parseInt(x, 10));
  const constraintRegex = /^([<=>^~]*)([\d.]+)(?:-([\w.-]+))?(?:\+([\w.-]+))?$/;
  const match = versionConstraint.match(constraintRegex);

  if (!match) return false;

  const [, op, version] = match;
  const [cMajor, cMinor, cPatch] = version.split('.').map((x) => Number.parseInt(x, 10) || 0);

  switch (op) {
    case '^': // Caret: compatible with version
      return major === cMajor && (minor > cMinor || (minor === cMinor && patch >= cPatch));
    case '~': // Tilde: reasonably close to version
      return major === cMajor && minor === cMinor && patch >= cPatch;
    case '>=':
      return (
        major > cMajor ||
        (major === cMajor && minor > cMinor) ||
        (major === cMajor && minor === cMinor && patch >= cPatch)
      );
    case '>':
      return (
        major > cMajor ||
        (major === cMajor && minor > cMinor) ||
        (major === cMajor && minor === cMinor && patch > cPatch)
      );
    case '<=':
      return (
        major < cMajor ||
        (major === cMajor && minor < cMinor) ||
        (major === cMajor && minor === cMinor && patch <= cPatch)
      );
    case '<':
      return (
        major < cMajor ||
        (major === cMajor && minor < cMinor) ||
        (major === cMajor && minor === cMinor && patch < cPatch)
      );
    case '=':
    case '':
      return installedVersion === version;
    default:
      return false;
  }
}

/**
 * Run command in shell
 */
export function runCommand(command: string): string {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${String(error)}`);
  }
}

/**
 * Read JSON file safely
 */
export function readJsonFile<T>(filePath: string): T {
  try {
    const content = fs.readFileSync(filePath).toString();
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Failed to read JSON file ${filePath}: ${String(error)}`);
  }
}

/**
 * Write JSON file
 */
export function writeJsonFile(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}
