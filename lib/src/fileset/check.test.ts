/* eslint-disable no-restricted-syntax */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

import archiver from 'archiver';

import { check } from './check';
import { extract } from './extract';

describe('Consumer', () => {
  // eslint-disable-next-line functional/no-let
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'consumer-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe('check', () => {
    it('should fail when package is not installed', async () => {
      await expect(
        check({
          packages: ['nonexistent-package'],
          outputDir: path.join(tmpDir, 'output'),
          cwd: tmpDir,
        }),
      ).rejects.toThrow(`nonexistent-package is not installed`);
    });

    it('should return ok when managed files are in sync', async () => {
      const outputDir = path.join(tmpDir, 'output');

      await installMockPackage('test-check-ok-package', { 'docs/guide.md': '# Guide' }, tmpDir);

      await extract({
        packages: ['test-check-ok-package'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
      });

      const result = await check({
        packages: ['test-check-ok-package'],
        outputDir,
        cwd: tmpDir,
      });

      expect(result.ok).toBe(true);
      expect(result.differences.missing).toHaveLength(0);
      expect(result.differences.modified).toHaveLength(0);
    });

    it('should report missing files when managed files are deleted', async () => {
      const outputDir = path.join(tmpDir, 'output');

      await installMockPackage(
        'test-check-missing-package',
        { 'docs/missing.md': '# Will be deleted' },
        tmpDir,
      );

      await extract({
        packages: ['test-check-missing-package'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
      });

      // Delete the extracted file to simulate it going missing
      const extractedFile = path.join(outputDir, 'docs', 'missing.md');
      fs.chmodSync(extractedFile, 0o644);
      fs.unlinkSync(extractedFile);

      const result = await check({
        packages: ['test-check-missing-package'],
        outputDir,
        cwd: tmpDir,
      });

      expect(result.ok).toBe(false);
      expect(result.differences.missing.some((f) => f.includes('missing.md'))).toBe(true);
    });

    it('should report modified files when contents change', async () => {
      const outputDir = path.join(tmpDir, 'output');

      await installMockPackage(
        'test-check-modified-package',
        { 'docs/modified.md': '# Original' },
        tmpDir,
      );

      await extract({
        packages: ['test-check-modified-package'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
      });

      // Modify the extracted file
      const extractedFile = path.join(outputDir, 'docs', 'modified.md');
      fs.chmodSync(extractedFile, 0o644);
      fs.writeFileSync(extractedFile, '# Modified content');

      const result = await check({
        packages: ['test-check-modified-package'],
        outputDir,
        cwd: tmpDir,
      });

      expect(result.ok).toBe(false);
      expect(result.differences.modified.some((f) => f.includes('modified.md'))).toBe(true);
    });

    it('should include per-package ok flag and differences in result', async () => {
      const outputDir = path.join(tmpDir, 'output');

      await installMockPackage('test-check-per-pkg', { 'info.md': '# Info' }, tmpDir);

      await extract({
        packages: ['test-check-per-pkg'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
      });

      const result = await check({
        packages: ['test-check-per-pkg'],
        outputDir,
        cwd: tmpDir,
      });

      expect(result.sourcePackages).toHaveLength(1);
      expect(result.sourcePackages[0].name).toBe('test-check-per-pkg');
      expect(result.sourcePackages[0].ok).toBe(true);
      expect(result.sourcePackages[0].differences.missing).toHaveLength(0);
      expect(result.sourcePackages[0].differences.modified).toHaveLength(0);
      expect(result.sourcePackages[0].differences.extra).toHaveLength(0);
    });

    it('should report extra files from package that were never extracted', async () => {
      const outputDir = path.join(tmpDir, 'output');

      await installMockPackage(
        'test-check-extra-package',
        {
          'docs/existing.md': '# Existing',
          'docs/new-in-pkg.md': '# New file added to package',
        },
        tmpDir,
      );

      // Extract only docs/existing.md by using a filter
      await extract({
        packages: ['test-check-extra-package'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**/existing.md'],
      });

      // Now check without the filter — the package has docs/new-in-pkg.md which was never extracted
      const result = await check({
        packages: ['test-check-extra-package'],
        outputDir,
        cwd: tmpDir,
      });

      expect(result.ok).toBe(false);
      expect(result.differences.extra.some((f) => f.includes('new-in-pkg.md'))).toBe(true);
    });

    it('should throw when installed version does not satisfy constraint', async () => {
      const outputDir = path.join(tmpDir, 'output');

      await installMockPackage('test-check-constraint-pkg', { 'data.md': '# Data' }, tmpDir);

      await extract({
        packages: ['test-check-constraint-pkg'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
      });

      // Check with a constraint that version 1.0.0 does NOT satisfy
      await expect(
        check({
          packages: ['test-check-constraint-pkg@^2.0.0'],
          outputDir,
          cwd: tmpDir,
        }),
      ).rejects.toThrow(/does not satisfy constraint/);
    });

    it('should report in sync when contentReplacements are applied to extracted files', async () => {
      const outputDir = path.join(tmpDir, 'output');

      await installMockPackage(
        'test-check-replacement-sync',
        { 'docs/guide.md': '# Guide\n<!-- version: 0.0.0 -->\n' },
        tmpDir,
      );

      await extract({
        packages: ['test-check-replacement-sync'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      // Simulate the post-extract content replacement modifying the file in-place
      const extractedFile = path.join(outputDir, 'docs', 'guide.md');
      fs.chmodSync(extractedFile, 0o644);
      fs.writeFileSync(extractedFile, '# Guide\n<!-- version: 1.2.3 -->\n', 'utf8');
      fs.chmodSync(extractedFile, 0o444);

      const replacement = {
        files: `${path.relative(tmpDir, outputDir)}/**/*.md`,
        match: '<!-- version: .* -->',
        replace: '<!-- version: 1.2.3 -->',
      };

      // check() without replacements should report the file as modified
      const resultWithout = await check({
        packages: ['test-check-replacement-sync'],
        outputDir,
        cwd: tmpDir,
      });
      expect(resultWithout.ok).toBe(false);
      expect(resultWithout.differences.modified.some((f) => f.includes('guide.md'))).toBe(true);

      // check() WITH the replacement config should report in sync
      const resultWith = await check({
        packages: ['test-check-replacement-sync'],
        outputDir,
        cwd: tmpDir,
        contentReplacements: [replacement],
      });
      expect(resultWith.ok).toBe(true);
      expect(resultWith.differences.modified).toHaveLength(0);
    });

    it('should still detect genuinely modified files when contentReplacements are provided', async () => {
      const outputDir = path.join(tmpDir, 'output');

      await installMockPackage(
        'test-check-replacement-still-modified',
        { 'config.json': '{"key":"original"}' },
        tmpDir,
      );

      await extract({
        packages: ['test-check-replacement-still-modified'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      // User modified the file manually (not via a declared replacement)
      const extractedFile = path.join(outputDir, 'config.json');
      fs.chmodSync(extractedFile, 0o644);
      fs.writeFileSync(extractedFile, '{"key":"tampered"}', 'utf8');
      fs.chmodSync(extractedFile, 0o444);

      // Providing a replacement for a different file pattern should not mask the real change
      const result = await check({
        packages: ['test-check-replacement-still-modified'],
        outputDir,
        cwd: tmpDir,
        contentReplacements: [{ files: '**/*.md', match: 'anything', replace: 'anything' }],
      });

      expect(result.ok).toBe(false);
      expect(result.differences.modified.some((f) => f.includes('config.json'))).toBe(true);
    });
  });
}); // end describe('Consumer')

const installMockPackage = async (
  packageName: string,
  files: Record<string, string>,
  tmpDir: string,
): Promise<string> => {
  const packageDir = path.join(tmpDir, packageName);
  // remove packageDir if it already exists from a previous test run to avoid conflicts
  if (fs.existsSync(packageDir)) {
    fs.rmSync(packageDir, { recursive: true });
  }
  fs.mkdirSync(packageDir, { recursive: true });

  // Create package.json
  const packageJson = {
    name: packageName,
    version: '1.0.0',
  };
  fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(packageJson));

  // Create other files
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(packageDir, filePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
  }

  // Create tar.gz file
  const tarGzPath = path.join(tmpDir, `${packageName}.tar.gz`);
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(tarGzPath);
    const archive = archiver('tar', { gzip: true });

    output.on('close', () => resolve());
    output.on('error', reject);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(packageDir, packageName);
    archive.finalize().catch(reject);
  });

  // Create package.json in tmpDir if it doesn't exist so pnpm recognizes it as a project
  const tmpDirPkgJson = path.join(tmpDir, 'package.json');
  if (!fs.existsSync(tmpDirPkgJson)) {
    fs.writeFileSync(tmpDirPkgJson, JSON.stringify({ name: 'tmp-test-project', version: '1.0.0' }));
  }

  // Install the tar.gz package into tmpDir/node_modules
  execSync(`pnpm add ${tarGzPath}`, {
    cwd: tmpDir,
    stdio: 'pipe',
  });

  return packageDir;
};
