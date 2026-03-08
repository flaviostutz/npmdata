import { NpmdataExtractEntry } from '../types';

import {
  parsePresetsFromArgv,
  parseOutputFromArgv,
  filterEntriesByPresets,
  parseDryRunFromArgv,
  parseSilentFromArgv,
  parseNoGitignoreFromArgv,
  parseUnmanagedFromArgv,
} from './index';

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

describe('runner', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('parsePresetsFromArgv', () => {
    it('returns an empty array when --presets is not present', () => {
      expect(parsePresetsFromArgv(['node', 'script.js'])).toEqual([]);
    });

    it('returns a single preset when --presets has one value', () => {
      expect(parsePresetsFromArgv(['node', 'script.js', '--presets', 'prod'])).toEqual(['prod']);
    });

    it('splits comma-separated presets', () => {
      expect(parsePresetsFromArgv(['node', 'script.js', '--presets', 'prod,staging'])).toEqual([
        'prod',
        'staging',
      ]);
    });

    it('trims whitespace from presets', () => {
      expect(parsePresetsFromArgv(['node', 'script.js', '--presets', ' prod , staging '])).toEqual([
        'prod',
        'staging',
      ]);
    });

    it('ignores --presets when there is no following value', () => {
      expect(parsePresetsFromArgv(['node', 'script.js', '--presets'])).toEqual([]);
    });

    it('filters out empty strings produced by trailing commas', () => {
      expect(parsePresetsFromArgv(['node', 'script.js', '--presets', 'prod,'])).toEqual(['prod']);
    });
  });

  describe('parseOutputFromArgv', () => {
    it('returns undefined when --output is not present', () => {
      expect(parseOutputFromArgv(['node', 'script.js', 'extract'])).toBeUndefined();
    });

    it('returns the value after --output', () => {
      expect(parseOutputFromArgv(['node', 'script.js', '--output', '/some/dir'])).toBe('/some/dir');
    });

    it('returns the value after -o shorthand', () => {
      expect(parseOutputFromArgv(['node', 'script.js', '-o', '/some/dir'])).toBe('/some/dir');
    });

    it('returns undefined when --output appears as the last argument with no value', () => {
      expect(parseOutputFromArgv(['node', 'script.js', '--output'])).toBeUndefined();
    });

    it('works when --output appears alongside other flags', () => {
      expect(
        parseOutputFromArgv([
          'node',
          'script.js',
          'extract',
          '--presets',
          'prod',
          '--output',
          './out',
        ]),
      ).toBe('./out');
    });
  });

  describe('filterEntriesByPresets', () => {
    const entryA: NpmdataExtractEntry = {
      package: 'pkg-a',
      output: { path: './a' },
      presets: ['prod'],
    };
    const entryB: NpmdataExtractEntry = {
      package: 'pkg-b',
      output: { path: './b' },
      presets: ['staging', 'prod'],
    };
    const entryC: NpmdataExtractEntry = {
      package: 'pkg-c',
      output: { path: './c' },
      presets: ['dev'],
    };
    const entryNoPresets: NpmdataExtractEntry = { package: 'pkg-d', output: { path: './d' } };

    it('returns all entries when requestedPresets is empty', () => {
      expect(filterEntriesByPresets([entryA, entryB, entryC, entryNoPresets], [])).toEqual([
        entryA,
        entryB,
        entryC,
        entryNoPresets,
      ]);
    });

    it('returns only entries matching the requested preset', () => {
      expect(filterEntriesByPresets([entryA, entryB, entryC, entryNoPresets], ['prod'])).toEqual([
        entryA,
        entryB,
      ]);
    });

    it('returns entries matching any of the requested presets', () => {
      expect(
        filterEntriesByPresets([entryA, entryB, entryC, entryNoPresets], ['dev', 'staging']),
      ).toEqual([entryB, entryC]);
    });

    it('excludes entries with no presets when a preset filter is active', () => {
      expect(filterEntriesByPresets([entryNoPresets], ['prod'])).toEqual([]);
    });

    it('returns an empty array when no entries match', () => {
      expect(filterEntriesByPresets([entryA, entryC], ['staging'])).toEqual([]);
    });
  });

  describe('parseDryRunFromArgv', () => {
    it('returns false when --dry-run is not present', () => {
      expect(parseDryRunFromArgv(['node', 'script.js', 'extract'])).toBe(false);
    });

    it('returns true when --dry-run is present', () => {
      expect(parseDryRunFromArgv(['node', 'script.js', 'extract', '--dry-run'])).toBe(true);
    });

    it('returns false for an empty array', () => {
      expect(parseDryRunFromArgv([])).toBe(false);
    });

    it('returns false when only similar-but-different flags are present', () => {
      expect(parseDryRunFromArgv(['node', 'script.js', '--no-gitignore'])).toBe(false);
    });
  });

  describe('parseSilentFromArgv', () => {
    it('returns false when --silent is not present', () => {
      expect(parseSilentFromArgv(['node', 'script.js', 'extract'])).toBe(false);
    });

    it('returns true when --silent is present', () => {
      expect(parseSilentFromArgv(['node', 'script.js', 'extract', '--silent'])).toBe(true);
    });

    it('returns false for an empty array', () => {
      expect(parseSilentFromArgv([])).toBe(false);
    });
  });

  describe('parseNoGitignoreFromArgv', () => {
    it('returns false when --no-gitignore is not present', () => {
      expect(parseNoGitignoreFromArgv(['node', 'script.js', 'extract'])).toBe(false);
    });

    it('returns true when --no-gitignore is present', () => {
      expect(parseNoGitignoreFromArgv(['node', 'script.js', 'extract', '--no-gitignore'])).toBe(
        true,
      );
    });

    it('returns false for an empty array', () => {
      expect(parseNoGitignoreFromArgv([])).toBe(false);
    });

    it('returns false when only similar-but-different flags are present', () => {
      expect(parseNoGitignoreFromArgv(['node', 'script.js', '--dry-run'])).toBe(false);
    });
  });

  describe('parseUnmanagedFromArgv', () => {
    it('returns false when --unmanaged is not present', () => {
      expect(parseUnmanagedFromArgv(['node', 'script.js', 'extract'])).toBe(false);
    });

    it('returns true when --unmanaged is present', () => {
      expect(parseUnmanagedFromArgv(['node', 'script.js', 'extract', '--unmanaged'])).toBe(true);
    });

    it('returns false for an empty array', () => {
      expect(parseUnmanagedFromArgv([])).toBe(false);
    });

    it('returns false when only similar-but-different flags are present', () => {
      expect(parseUnmanagedFromArgv(['node', 'script.js', '--dry-run'])).toBe(false);
    });
  });
});
