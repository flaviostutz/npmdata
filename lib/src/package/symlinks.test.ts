import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NpmdataExtractEntry } from '../types';

import { applySymlinks } from './index';

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

  // ─── applySymlinks ──────────────────────────────────────────────────────────
  describe('applySymlinks', () => {
    // eslint-disable-next-line functional/no-let
    let tmpDir: string;

    beforeEach(() => {
      // These tests need real filesystem; restore readFileSync and mkdirSync to the actual implementation.
      mockReadFileSync.mockImplementation(jest.requireActual<typeof fs>('node:fs').readFileSync);
      (fs.mkdirSync as jest.Mock).mockImplementation(
        jest.requireActual<typeof fs>('node:fs').mkdirSync,
      );
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-symlinks-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('does nothing when entry has no symlinks config', () => {
      const entry: NpmdataExtractEntry = { package: 'pkg', output: { path: './out' } };
      // Should not throw
      expect(() => applySymlinks(entry, tmpDir)).not.toThrow();
    });

    it('does nothing when symlinks array is empty', () => {
      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: './out', symlinks: [] },
      };
      expect(() => applySymlinks(entry, tmpDir)).not.toThrow();
    });

    it('creates target directory if it does not exist', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(outputDir, { recursive: true });
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });

      const targetDir = path.join(outputDir, '.github', 'skills');
      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);

      expect(fs.existsSync(targetDir)).toBe(true);
    });

    it('creates a symlink for each matched file in the outputDir', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-b'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-a', 'README.md'), '# Skill A');
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-b', 'guide.md'), '# Skill B');
      fs.writeFileSync(
        path.join(outputDir, '.npmdata'),
        'skills/skill-a/README.md|pkg|1.0.0|0\nskills/skill-b/guide.md|pkg|1.0.0|0\n',
      );

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);

      const targetDir = path.join(outputDir, '.github', 'skills');
      const symlinkA = path.join(targetDir, 'skill-a');
      const symlinkB = path.join(targetDir, 'skill-b');

      expect(fs.lstatSync(symlinkA).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(symlinkA)).toBe(
        fs.realpathSync(path.join(outputDir, 'skills', 'skill-a')),
      );
      expect(fs.lstatSync(symlinkB).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(symlinkB)).toBe(
        fs.realpathSync(path.join(outputDir, 'skills', 'skill-b')),
      );
    });

    it('removes stale managed symlinks that no longer match the glob', () => {
      const outputDir = path.join(tmpDir, 'out');
      const targetDir = path.join(outputDir, '.github', 'skills');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-a', 'README.md'), '');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'skills/skill-a/README.md|pkg|1.0.0|0\n');
      fs.mkdirSync(targetDir, { recursive: true });

      // Simulate a stale symlink created by a previous extraction run that pointed
      // into outputDir but whose source no longer exists there.  The symlink is dead.
      const staleTarget = path.join(outputDir, 'skills', 'skill-OLD');
      fs.symlinkSync(staleTarget, path.join(targetDir, 'skill-OLD'));

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);

      // Stale symlink must be removed; new one must be created.
      // Use lstatSync (does NOT follow links) so a dead symlink is also detected.
      const oldLinkGone = ((): boolean => {
        // eslint-disable-next-line functional/no-try-statements
        try {
          fs.lstatSync(path.join(targetDir, 'skill-OLD'));
          return false;
        } catch {
          return true;
        }
      })();
      expect(oldLinkGone).toBe(true);
      expect(fs.lstatSync(path.join(targetDir, 'skill-a')).isSymbolicLink()).toBe(true);
    });

    it('does not touch symlinks that do not point into outputDir', () => {
      const outputDir = path.join(tmpDir, 'out');
      const targetDir = path.join(outputDir, '.github', 'skills');
      const externalDir = path.join(tmpDir, 'external');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-a', 'README.md'), '');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'skills/skill-a/README.md|pkg|1.0.0|0\n');
      fs.mkdirSync(externalDir, { recursive: true });
      fs.mkdirSync(targetDir, { recursive: true });

      // Non-managed symlink pointing outside outputDir
      fs.symlinkSync(externalDir, path.join(targetDir, 'external-link'));

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);

      // External symlink must survive
      expect(fs.lstatSync(path.join(targetDir, 'external-link')).isSymbolicLink()).toBe(true);
    });

    it('does not clobber an existing non-symlink at the target basename', () => {
      const outputDir = path.join(tmpDir, 'out');
      const targetDir = path.join(outputDir, '.github', 'skills');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-a', 'README.md'), '');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'skills/skill-a/README.md|pkg|1.0.0|0\n');
      fs.mkdirSync(targetDir, { recursive: true });

      // A regular directory exists at the target name
      const existing = path.join(targetDir, 'skill-a');
      fs.mkdirSync(existing, { recursive: true });

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);

      // Must remain a regular directory, not a symlink
      expect(fs.lstatSync(existing).isSymbolicLink()).toBe(false);
      expect(fs.lstatSync(existing).isDirectory()).toBe(true);
    });

    it('is idempotent: running twice produces the same result', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-a', 'README.md'), '');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'skills/skill-a/README.md|pkg|1.0.0|0\n');

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);
      applySymlinks(entry, tmpDir);

      const targetDir = path.join(outputDir, '.github', 'skills');
      expect(fs.lstatSync(path.join(targetDir, 'skill-a')).isSymbolicLink()).toBe(true);
    });

    it('logs A for created symlinks in git style', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-a', 'README.md'), '');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'skills/skill-a/README.md|pkg|1.0.0|0\n');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);

      const expectedPath = path.join('out', '.github', 'skills', 'skill-a');
      expect(logSpy).toHaveBeenCalledWith(`A\t${expectedPath}`);

      logSpy.mockRestore();
    });

    it('logs M for updated symlinks in git style', () => {
      const outputDir = path.join(tmpDir, 'out');
      const targetDir = path.join(outputDir, '.github', 'skills');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-a', 'README.md'), '');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'skills/skill-a/README.md|pkg|1.0.0|0\n');

      // Create the symlink pointing to a different path first so it will be "updated".
      const oldSource = path.join(outputDir, 'skills', 'old-target');
      fs.mkdirSync(oldSource, { recursive: true });
      fs.mkdirSync(targetDir, { recursive: true });
      fs.symlinkSync(oldSource, path.join(targetDir, 'skill-a'));

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);

      const expectedPath = path.join('out', '.github', 'skills', 'skill-a');
      expect(logSpy).toHaveBeenCalledWith(`M\t${expectedPath}`);

      logSpy.mockRestore();
    });

    it('logs D for removed stale symlinks in git style', () => {
      const outputDir = path.join(tmpDir, 'out');
      const targetDir = path.join(outputDir, '.github', 'skills');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, '.npmdata'), '');
      fs.mkdirSync(targetDir, { recursive: true });

      const staleTarget = path.join(outputDir, 'skills', 'skill-OLD');
      fs.symlinkSync(staleTarget, path.join(targetDir, 'skill-OLD'));

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
      };

      applySymlinks(entry, tmpDir);

      const expectedPath = path.join('out', '.github', 'skills', 'skill-OLD');
      expect(logSpy).toHaveBeenCalledWith(`D\t${expectedPath}`);

      logSpy.mockRestore();
    });

    it('does not log anything when silent is true', () => {
      const outputDir = path.join(tmpDir, 'out');
      fs.mkdirSync(path.join(outputDir, 'skills', 'skill-a'), { recursive: true });
      fs.writeFileSync(path.join(outputDir, 'skills', 'skill-a', 'README.md'), '');
      fs.writeFileSync(path.join(outputDir, '.npmdata'), 'skills/skill-a/README.md|pkg|1.0.0|0\n');

      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const entry: NpmdataExtractEntry = {
        package: 'pkg',
        output: { path: 'out', symlinks: [{ source: 'skills/*', target: '.github/skills' }] },
        silent: true,
      };

      applySymlinks(entry, tmpDir);

      expect(logSpy).not.toHaveBeenCalled();

      logSpy.mockRestore();
    });
  });
});
