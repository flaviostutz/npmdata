import { NpmdataExtractEntry } from '../types';

import { collectAllPresets, printHelp } from './index';

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

  describe('collectAllPresets', () => {
    it('returns an empty array when no entry has presets', () => {
      const entries: NpmdataExtractEntry[] = [
        { package: 'pkg-a', output: { path: './a' } },
        { package: 'pkg-b', output: { path: './b' } },
      ];
      expect(collectAllPresets(entries)).toEqual([]);
    });

    it('collects presets from a single entry', () => {
      const entries: NpmdataExtractEntry[] = [
        { package: 'pkg-a', output: { path: './a' }, presets: ['prod', 'staging'] },
      ];
      expect(collectAllPresets(entries)).toEqual(['prod', 'staging']);
    });

    it('deduplicates presets across entries', () => {
      const entries: NpmdataExtractEntry[] = [
        { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
        { package: 'pkg-b', output: { path: './b' }, presets: ['prod', 'staging'] },
        { package: 'pkg-c', output: { path: './c' }, presets: ['dev'] },
      ];
      expect(collectAllPresets(entries)).toEqual(['dev', 'prod', 'staging']);
    });

    it('returns presets sorted alphabetically', () => {
      const entries: NpmdataExtractEntry[] = [
        { package: 'pkg-a', output: { path: './a' }, presets: ['zzz', 'aaa', 'mmm'] },
      ];
      expect(collectAllPresets(entries)).toEqual(['aaa', 'mmm', 'zzz']);
    });

    it('ignores entries with undefined presets', () => {
      const entries: NpmdataExtractEntry[] = [
        { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
        { package: 'pkg-b', output: { path: './b' } },
      ];
      expect(collectAllPresets(entries)).toEqual(['prod']);
    });

    it('returns an empty array for an empty entries list', () => {
      expect(collectAllPresets([])).toEqual([]);
    });
  });

  describe('printHelp', () => {
    it('includes the package name in the output', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printHelp('my-data-pkg', []);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('my-data-pkg');
      writeSpy.mockRestore();
    });

    it('lists available presets in the output', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printHelp('my-data-pkg', ['dev', 'prod', 'staging']);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('dev, prod, staging');
      writeSpy.mockRestore();
    });

    it('shows a placeholder when no presets are available', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printHelp('my-data-pkg', []);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('(none defined in package.json)');
      writeSpy.mockRestore();
    });

    it('mentions --presets option', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printHelp('my-data-pkg', []);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('--presets');
      writeSpy.mockRestore();
    });

    it('mentions --help option', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printHelp('my-data-pkg', []);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('--help');
      writeSpy.mockRestore();
    });

    it('shows an extract-without-presets example using the package name', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printHelp('my-data-pkg', ['prod']);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('my-data-pkg extract');
      expect(output).toContain('Extract files for all entries');
      writeSpy.mockRestore();
    });

    it('shows an extract-with-presets example using the first available preset', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printHelp('my-data-pkg', ['prod', 'staging']);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('my-data-pkg extract --presets prod');
      expect(output).toContain('"prod"');
      writeSpy.mockRestore();
    });

    it('uses "my-preset" as placeholder preset in example when no presets are defined', () => {
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
      printHelp('my-data-pkg', []);
      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('my-data-pkg extract --presets my-preset');
      writeSpy.mockRestore();
    });
  });
});
