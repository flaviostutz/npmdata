import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { list } from './list';
import { purge } from './purge';
import { extract } from './extract';
import { installMockPackage } from './test-utils';

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

  describe('list', () => {
    it('should return packages and files managed in outputDir', async () => {
      const outputDir = path.join(tmpDir, 'list-output');

      await installMockPackage(
        'test-list-package',
        { 'docs/guide.md': '# Guide', 'README.md': '# Readme' },
        tmpDir,
      );

      await extract({
        packages: ['test-list-package'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      const results = list(outputDir);
      expect(results.length).toBeGreaterThan(0);
      const entry = results.find((r) => r.packageName === 'test-list-package');
      expect(entry).toBeDefined();
      expect(entry!.files.some((f) => f.includes('guide.md'))).toBe(true);
    });

    it('should return empty array for a directory with no managed files', () => {
      const emptyDir = path.join(tmpDir, 'empty-list-output');
      fs.mkdirSync(emptyDir, { recursive: true });

      const results = list(emptyDir);
      expect(results).toHaveLength(0);
    });

    it('should return empty array for a non-existent directory', () => {
      const results = list(path.join(tmpDir, 'nonexistent'));
      expect(results).toHaveLength(0);
    });

    it('should group files by package', async () => {
      const outputDir = path.join(tmpDir, 'list-multi-pkg-output');

      await installMockPackage('list-pkg-a', { 'a/file-a.md': '# A' }, tmpDir);
      await installMockPackage('list-pkg-b', { 'b/file-b.md': '# B' }, tmpDir);

      await extract({
        packages: ['list-pkg-a', 'list-pkg-b'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**/*.md'],
      });

      const results = list(outputDir);
      const packageNames = results.map((r: { packageName: string }) => r.packageName);
      expect(packageNames).toContain('list-pkg-a');
      expect(packageNames).toContain('list-pkg-b');
    });
  });

  describe('purge', () => {
    it('should delete all managed files for the given package', async () => {
      const outputDir = path.join(tmpDir, 'purge-output');

      await installMockPackage(
        'test-purge-package',
        { 'docs/guide.md': '# Guide', 'data/file.json': '{}' },
        tmpDir,
      );

      await extract({
        packages: ['test-purge-package'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      expect(fs.existsSync(path.join(outputDir, 'docs', 'guide.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'data', 'file.json'))).toBe(true);

      const result = await purge({
        packages: ['test-purge-package'],
        outputDir,
      });

      expect(result.deleted).toContain('docs/guide.md');
      expect(result.deleted).toContain('data/file.json');
      expect(fs.existsSync(path.join(outputDir, 'docs', 'guide.md'))).toBe(false);
      expect(fs.existsSync(path.join(outputDir, 'data', 'file.json'))).toBe(false);
    });

    it('should remove the package entry from .npmdata marker files', async () => {
      const outputDir = path.join(tmpDir, 'purge-marker-output');

      await installMockPackage('test-purge-marker', { 'docs/guide.md': '# Guide' }, tmpDir);

      await extract({
        packages: ['test-purge-marker'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      await purge({ packages: ['test-purge-marker'], outputDir });

      // root .npmdata marker must be removed when no managed files remain
      expect(fs.existsSync(path.join(outputDir, '.npmdata'))).toBe(false);
    });

    it('should keep managed files belonging to other packages', async () => {
      const outputDir = path.join(tmpDir, 'purge-other-output');

      await installMockPackage('test-purge-pkg-a', { 'a/file-a.txt': 'A content' }, tmpDir);
      await installMockPackage('test-purge-pkg-b', { 'b/file-b.txt': 'B content' }, tmpDir);

      await extract({
        packages: ['test-purge-pkg-a', 'test-purge-pkg-b'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['a/**', 'b/**'],
      });

      expect(fs.existsSync(path.join(outputDir, 'a', 'file-a.txt'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'b', 'file-b.txt'))).toBe(true);

      await purge({ packages: ['test-purge-pkg-a'], outputDir });

      // pkg-a files deleted, pkg-b files preserved
      expect(fs.existsSync(path.join(outputDir, 'a', 'file-a.txt'))).toBe(false);
      expect(fs.existsSync(path.join(outputDir, 'b', 'file-b.txt'))).toBe(true);
    });

    it('should simulate deletion without touching disk when dryRun is true', async () => {
      const outputDir = path.join(tmpDir, 'purge-dryrun-output');

      await installMockPackage('test-purge-dryrun', { 'docs/note.md': '# Note' }, tmpDir);

      await extract({
        packages: ['test-purge-dryrun'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      const result = await purge({
        packages: ['test-purge-dryrun'],
        outputDir,
        dryRun: true,
      });

      // result reflects what would have been deleted
      expect(result.deleted).toContain('docs/note.md');
      // file still exists because dryRun=true
      expect(fs.existsSync(path.join(outputDir, 'docs', 'note.md'))).toBe(true);
    });

    it('should return empty result when no files are managed by the package', async () => {
      const outputDir = path.join(tmpDir, 'purge-empty-output');
      fs.mkdirSync(outputDir, { recursive: true });

      const result = await purge({
        packages: ['nonexistent-package'],
        outputDir,
      });

      expect(result.deleted).toHaveLength(0);
    });

    it('should emit file-deleted progress events', async () => {
      const outputDir = path.join(tmpDir, 'purge-progress-output');

      await installMockPackage('test-purge-progress', { 'docs/page.md': '# Page' }, tmpDir);

      await extract({
        packages: ['test-purge-progress'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      const progressMock = jest.fn();
      await purge({
        packages: ['test-purge-progress'],
        outputDir,
        onProgress: progressMock,
      });

      const deletedFiles = progressMock.mock.calls
        .filter(([e]) => e.type === 'file-deleted')
        .map(([e]) => e.file);
      expect(deletedFiles).toContain('docs/page.md');
    });

    it('should clean up empty directories after purge', async () => {
      const outputDir = path.join(tmpDir, 'purge-dirs-output');

      await installMockPackage('test-purge-dirs', { 'docs/sub/file.md': '# File' }, tmpDir);

      await extract({
        packages: ['test-purge-dirs'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      await purge({ packages: ['test-purge-dirs'], outputDir });

      // Empty subdirectories should be removed
      expect(fs.existsSync(path.join(outputDir, 'docs', 'sub'))).toBe(false);
      expect(fs.existsSync(path.join(outputDir, 'docs'))).toBe(false);
    });

    it('should accept package spec with version constraint and use the name only', async () => {
      const outputDir = path.join(tmpDir, 'purge-spec-output');

      await installMockPackage('test-purge-spec', { 'config.json': '{}' }, tmpDir);

      await extract({
        packages: ['test-purge-spec'],
        outputDir,
        packageManager: 'pnpm',
        cwd: tmpDir,
        filenamePatterns: ['**'],
      });

      // Pass spec with version; purge should resolve the name and delete the files.
      const result = await purge({
        packages: ['test-purge-spec@^1.0.0'],
        outputDir,
      });

      expect(result.deleted).toContain('config.json');
      expect(fs.existsSync(path.join(outputDir, 'config.json'))).toBe(false);
    });
  });
}); // end describe('Consumer')
