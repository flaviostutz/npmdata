import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NpmdataExtractEntry } from '../types';

import { applyContentReplacements, checkContentReplacements } from './index';

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

type MockedReadFileSync = jest.MockedFunction<typeof fs.readFileSync>;

const mockReadFileSync = fs.readFileSync as MockedReadFileSync;

describe('runner', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  // ─── applyContentReplacements ───────────────────────────────────────────────
  describe('applyContentReplacements', () => {
    // eslint-disable-next-line functional/no-let
    let tmpDir: string;

    beforeEach(() => {
      // These tests need real filesystem; restore readFileSync and mkdirSync to the actual implementation.
      mockReadFileSync.mockImplementation(jest.requireActual<typeof fs>('node:fs').readFileSync);
      (fs.mkdirSync as jest.Mock).mockImplementation(
        jest.requireActual<typeof fs>('node:fs').mkdirSync,
      );
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-content-replace-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('does nothing when entry has no contentReplacements config', () => {
      const entry: NpmdataExtractEntry = { package: 'pkg', output: { path: './out' } };
      expect(() => applyContentReplacements(entry, tmpDir)).not.toThrow();
    });

    it('does nothing when contentReplacements array is empty', () => {
      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: './out', contentReplacements: [] },
      };
      expect(() => applyContentReplacements(entry, tmpDir)).not.toThrow();
    });

    it('replaces matching content in workspace files', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(path.join(outputDir, 'docs'), { recursive: true });
      fs.writeFileSync(
        path.join(outputDir, 'docs', 'README.md'),
        '# Title\n<!-- version: 0.0.0 -->\nBody',
      );
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'docs/README.md|pkg|1.0.0|0\n');

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: {
          path: './out',
          contentReplacements: [
            {
              files: 'docs/**/*.md',
              match: '<!-- version: .* -->',
              replace: '<!-- version: 1.2.3 -->',
            },
          ],
        },
      };

      applyContentReplacements(entry, tmpDir);

      const updated = fs.readFileSync(path.join(outputDir, 'docs', 'README.md'), 'utf8');
      expect(updated).toContain('<!-- version: 1.2.3 -->');
      expect(updated).not.toContain('<!-- version: 0.0.0 -->');
    });

    it('replaces all occurrences across multiple files', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'a.md'), 'TOKEN');
      fs.writeFileSync(path.join(outputDir, 'b.md'), 'TOKEN and TOKEN');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'a.md|pkg|1.0.0|0\nb.md|pkg|1.0.0|0\n');

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: {
          path: './out',
          contentReplacements: [{ files: '*.md', match: 'TOKEN', replace: 'REPLACED' }],
        },
      };

      applyContentReplacements(entry, tmpDir);

      expect(fs.readFileSync(path.join(outputDir, 'a.md'), 'utf8')).toBe('REPLACED');
      expect(fs.readFileSync(path.join(outputDir, 'b.md'), 'utf8')).toBe('REPLACED and REPLACED');
    });

    it('does not write a file when content does not change', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(outputDir, { recursive: true });
      const filePath = path.join(outputDir, 'no-match.md');
      fs.writeFileSync(filePath, 'nothing to replace here');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'no-match.md|pkg|1.0.0|0\n');
      const before = fs.statSync(filePath).mtimeMs;

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: {
          path: './out',
          contentReplacements: [{ files: '*.md', match: 'TOKEN', replace: 'REPLACED' }],
        },
      };

      applyContentReplacements(entry, tmpDir);

      expect(fs.statSync(filePath).mtimeMs).toBe(before);
    });

    it('supports regex back-references in the replacement string', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'ref.md'), 'hello world');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'ref.md|pkg|1.0.0|0\n');

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: {
          path: './out',
          contentReplacements: [{ files: '*.md', match: '(hello) (world)', replace: '$2 $1' }],
        },
      };

      applyContentReplacements(entry, tmpDir);

      expect(fs.readFileSync(path.join(outputDir, 'ref.md'), 'utf8')).toBe('world hello');
    });
  });

  // ─── checkContentReplacements ───────────────────────────────────────────────
  describe('checkContentReplacements', () => {
    // eslint-disable-next-line functional/no-let
    let tmpDir: string;

    beforeEach(() => {
      // These tests need real filesystem; restore readFileSync and mkdirSync to the actual implementation.
      mockReadFileSync.mockImplementation(jest.requireActual<typeof fs>('node:fs').readFileSync);
      (fs.mkdirSync as jest.Mock).mockImplementation(
        jest.requireActual<typeof fs>('node:fs').mkdirSync,
      );
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-check-replace-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('returns an empty array when no contentReplacements are defined', () => {
      const entry: NpmdataExtractEntry = { package: 'pkg', output: { path: './out' } };
      expect(checkContentReplacements(entry, tmpDir)).toEqual([]);
    });

    it('returns an empty array when all replacements are already applied', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'doc.md'), '<!-- version: 1.2.3 -->');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'doc.md|pkg|1.0.0|0\n');

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: {
          path: './out',
          contentReplacements: [
            { files: '*.md', match: '<!-- version: .* -->', replace: '<!-- version: 1.2.3 -->' },
          ],
        },
      };

      // No further changes needed – regex matches but replacement string equals its own output.
      // Build a case where the replacement produces no diff.
      // We write the file already containing the replacement text, so match succeeds but diff is zero.
      expect(checkContentReplacements(entry, tmpDir)).toEqual([]);
    });

    it('returns paths of files where the replacement would still change content', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(outputDir, { recursive: true });
      const filePath = path.join(outputDir, 'doc.md');
      fs.writeFileSync(filePath, '<!-- version: 0.0.0 -->');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'doc.md|pkg|1.0.0|0\n');

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: {
          path: './out',
          contentReplacements: [
            { files: '*.md', match: '<!-- version: 0.0.0 -->', replace: '<!-- version: 1.0.0 -->' },
          ],
        },
      };

      const outOfSync = checkContentReplacements(entry, tmpDir);
      expect(outOfSync).toContain(filePath);
    });

    it('does not return a path when the file content would not change', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(outputDir, { recursive: true });
      const filePath = path.join(outputDir, 'up-to-date.md');
      fs.writeFileSync(filePath, 'no marker here');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'up-to-date.md|pkg|1.0.0|0\n');

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: {
          path: './out',
          contentReplacements: [{ files: '*.md', match: 'MARKER', replace: 'REPLACED' }],
        },
      };

      const outOfSync = checkContentReplacements(entry, tmpDir);
      expect(outOfSync).not.toContain(filePath);
    });
  });
});
