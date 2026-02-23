import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { matchesContentRegex, findMatchingFiles, matchesFilenamePattern } from './utils';

describe('Utils', () => {
  // eslint-disable-next-line functional/no-let
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'utils-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe('matchesFilenamePattern', () => {
    it('should match simple patterns', () => {
      expect(matchesFilenamePattern('test/file.md', ['**/*.md'])).toBe(true);
      expect(matchesFilenamePattern('file.txt', ['*.md'])).toBe(false);
      expect(matchesFilenamePattern('README.md', ['README.md'])).toBe(true);
      expect(matchesFilenamePattern('bin/test.js', ['!bin'])).toBe(false);
    });

    it('should match multiple patterns', () => {
      expect(matchesFilenamePattern('test/file.md', ['**/*.txt', '**/*.md'])).toBe(true);
      expect(matchesFilenamePattern('./file.js', ['**/*.txt', '**/*.md'])).toBe(false);
      expect(
        matchesFilenamePattern('test1/test2/file.js', ['**/*.js', '**/*.md', '!**/file.js']),
      ).toBe(false);
      expect(matchesFilenamePattern('test/file.js', ['**/*.js', '!**/*.js'])).toBe(false);
      expect(matchesFilenamePattern('bin/file.js', ['**/*.js', '!bin/**'])).toBe(false);
    });

    it('should return false if no pattern specified', () => {
      expect(matchesFilenamePattern('anything.txt', [])).toBe(false);
    });
  });

  describe('matchesContentRegex', () => {
    it('should match content patterns', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'This is test content');

      expect(matchesContentRegex(filePath, [/test/])).toBe(true);
      expect(matchesContentRegex(filePath, [/notfound/])).toBe(false);
    });

    it('should return true if no regex specified', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'content');

      expect(matchesContentRegex(filePath)).toBe(true);
    });
  });

  describe('findMatchingFiles', () => {
    it('should find files matching pattern', () => {
      // Create test files
      fs.writeFileSync(path.join(tmpDir, 'file1.md'), 'content');
      fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'content');
      fs.mkdirSync(path.join(tmpDir, 'subdir'));
      fs.writeFileSync(path.join(tmpDir, 'subdir', 'file3.md'), 'content');

      const files = findMatchingFiles(tmpDir, ['**/*.md']);

      expect(files).toContainEqual(expect.stringContaining('file1.md'));
      expect(files).toContainEqual(expect.stringContaining('file3.md'));
      expect(files).not.toContainEqual(expect.stringContaining('file2.txt'));
    });

    it('should find files matching regex in its contents', () => {
      fs.writeFileSync(path.join(tmpDir, 'file1.txt'), '# Header');
      fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'No header here');

      const files = findMatchingFiles(tmpDir, ['**/*.txt'], [/#/]);

      expect(files).toContainEqual(expect.stringContaining('file1.txt'));
      expect(files).not.toContainEqual(expect.stringContaining('file2.txt'));
    });
  });
});
