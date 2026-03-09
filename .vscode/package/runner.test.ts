/* eslint-disable no-undefined */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { NpmdataExtractEntry } from '../types';

import { run, runEntries } from './index';

jest.mock('node:child_process', () => ({
  execSync: jest.fn(),
}));

jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

type MockedExecSync = jest.MockedFunction<typeof execSync>;
type MockedReadFileSync = jest.MockedFunction<typeof fs.readFileSync>;

const mockExecSync = execSync as MockedExecSync;
const mockReadFileSync = fs.readFileSync as MockedReadFileSync;

const BIN_DIR = '/fake/bin';
const EXTRACT_ARGV = ['node', 'script.js', 'extract'];

/** Capture the command string passed to execSync for the first call. */
function capturedCommand(): string {
  return mockExecSync.mock.calls[0][0] as string;
}

/** Capture all command strings passed to execSync across all calls. */
function capturedCommands(): string[] {
  return mockExecSync.mock.calls.map((call) => call[0] as string);
}

function setupPackageJson(content: Record<string, unknown>): void {
  mockReadFileSync.mockReturnValue(Buffer.from(JSON.stringify(content)));
}

describe('runner', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('run – entry resolution', () => {
    it('uses a single default entry when npmdata is absent', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('--packages "my-pkg"');
      expect(capturedCommand()).toContain(`--output "${path.resolve('.')}"`);
    });

    it('uses a single default entry when npmdata is an empty array', () => {
      setupPackageJson({ name: 'my-pkg', npmdata: { sets: [] } });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('--packages "my-pkg"');
    });

    it('invokes execSync once per npmdata entry', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
    });

    it('passes cwd to execSync when running extract', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ cwd: expect.any(String) }),
      );
    });

    it('passes the current working directory as cwd to execSync', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, EXTRACT_ARGV);

      const callOptions = mockExecSync.mock.calls[0][1] as { cwd?: string };
      expect(callOptions.cwd).toBe(process.cwd());
    });

    it('resolves a relative outputDir to an absolute path in the extract command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: 'data' } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(`--output "${path.resolve(process.cwd(), 'data')}"`);
    });

    it('resolves dot outputDir to the current working directory in the extract command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(`--output "${process.cwd()}"`);
    });

    it('resolves the CLI path and embeds it in the command', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, EXTRACT_ARGV);

      // The command must call node with an absolute path to main.js and invoke extract.
      expect(capturedCommand()).toMatch(/node ".+main\.js"/);
      expect(capturedCommand()).toContain('extract');
    });

    it('calls process.exit with child exit code when execSync throws', () => {
      setupPackageJson({ name: 'my-pkg' });
      const exitError = Object.assign(new Error('command failed'), { status: 2 });
      mockExecSync.mockImplementation(() => {
        throw exitError;
      });
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      expect(() => run(BIN_DIR, EXTRACT_ARGV)).toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(2);
      mockExit.mockRestore();
    });

    it('calls process.exit with 1 when execSync throws without a status code', () => {
      setupPackageJson({ name: 'my-pkg' });
      mockExecSync.mockImplementation(() => {
        throw new Error('command failed');
      });
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      expect(() => run(BIN_DIR, EXTRACT_ARGV)).toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      mockExit.mockRestore();
    });

    it('uses --output dir as base when resolving outputDir in the extract command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: 'data' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--output', '/custom/base']);

      expect(capturedCommand()).toContain(`--output "${path.resolve('/custom/base', 'data')}"`);
    });

    it('uses -o shorthand as base when resolving outputDir', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: 'data' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '-o', '/custom/base']);

      expect(capturedCommand()).toContain(`--output "${path.resolve('/custom/base', 'data')}"`);
    });

    it('resolves a relative --output against process.cwd()', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: 'data' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--output', 'projects/myapp']);

      const expectedBase = path.resolve(process.cwd(), 'projects/myapp');
      expect(capturedCommand()).toContain(`--output "${path.resolve(expectedBase, 'data')}"`);
    });

    it('uses --output dir as cwd passed to execSync', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--output', '/custom/base']);

      const callOptions = mockExecSync.mock.calls[0][1] as { cwd?: string };
      expect(callOptions.cwd).toBe('/custom/base');
    });
  });

  describe('run – presets filtering', () => {
    it('runs all entries when --presets is not provided', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract']);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
    });

    it('runs only entries matching the requested preset', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      // 1 extract for pkg-a, 1 purge for excluded pkg-b
      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.some((c) => c.includes('extract') && c.includes('pkg-a'))).toBe(true);
      expect(cmds.some((c) => c.includes('purge') && c.includes('pkg-b'))).toBe(true);
    });

    it('runs entries matching any of the requested presets', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
            { package: 'pkg-c', output: { path: './c' }, presets: ['dev'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod,staging']);

      // 2 extracts (pkg-a, pkg-b) + 1 purge (excluded pkg-c)
      expect(mockExecSync).toHaveBeenCalledTimes(3);
      const cmds = capturedCommands();
      expect(cmds.filter((c) => c.includes('extract')).length).toBe(2);
      expect(cmds.filter((c) => c.includes('purge')).length).toBe(1);
    });

    it('runs no extract commands but purges all entries when no entry matches the requested preset', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' }, presets: ['dev'] }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      // No extract, but purge is called for the excluded entry
      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('purge');
      expect(capturedCommand()).not.toContain('extract');
    });

    it('skips entries without presets from extract but purges them when a preset filter is active', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' }, presets: ['prod'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      // 1 extract (pkg-b) + 1 purge (untagged pkg-a)
      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.some((c) => c.includes('extract') && c.includes('pkg-b'))).toBe(true);
      expect(cmds.some((c) => c.includes('purge') && c.includes('pkg-a'))).toBe(true);
    });

    it('does not pass --presets to the extract command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' }, presets: ['prod'] }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      expect(capturedCommand()).not.toContain('--presets');
    });
  });

  describe('run – purge excluded entries when presets filter is active', () => {
    it('purges excluded entries when a preset filter is active', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      // One extract call for pkg-a, one purge call for pkg-b
      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.some((c) => c.includes('extract') && c.includes('pkg-a'))).toBe(true);
      expect(cmds.some((c) => c.includes('purge') && c.includes('pkg-b'))).toBe(true);
    });

    it('does not purge anything when no preset filter is active', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract']);

      // Both entries extracted, no purge
      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.every((c) => !c.includes('purge'))).toBe(true);
    });

    it('purges all excluded entries when multiple are excluded', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
            { package: 'pkg-c', output: { path: './c' }, presets: ['dev'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      // 1 extract (pkg-a), 2 purges (pkg-b, pkg-c)
      expect(mockExecSync).toHaveBeenCalledTimes(3);
      const cmds = capturedCommands();
      expect(cmds.filter((c) => c.includes('extract')).length).toBe(1);
      expect(cmds.filter((c) => c.includes('purge')).length).toBe(2);
    });

    it('purges entries without presets when a preset filter is active', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-untagged', output: { path: './u' } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      const cmds = capturedCommands();
      expect(cmds.some((c) => c.includes('purge') && c.includes('pkg-untagged'))).toBe(true);
    });

    it('purges nothing (only extract) when all entries match the preset filter', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['prod', 'staging'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.every((c) => c.includes('extract'))).toBe(true);
    });

    it('runs only purge commands when no entries match the preset filter', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['staging'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['dev'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--presets', 'prod']);

      const cmds = capturedCommands();
      expect(cmds.every((c) => c.includes('purge'))).toBe(true);
    });
  });

  describe('run – --unmanaged argv override', () => {
    it('adds --unmanaged to the extract command when the flag is in argv', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--unmanaged']);

      expect(capturedCommand()).toContain(' --unmanaged');
    });

    it('overrides entry-level unmanaged:false and adds --unmanaged to the command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', unmanaged: false } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--unmanaged']);

      expect(capturedCommand()).toContain(' --unmanaged');
    });

    it('does not add --unmanaged when the flag is absent', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).not.toContain('--unmanaged');
    });

    it('applies --unmanaged override across all entries', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b', unmanaged: false } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--unmanaged']);

      const cmds = capturedCommands();
      expect(cmds).toHaveLength(2);
      expect(cmds[0]).toContain(' --unmanaged');
      expect(cmds[1]).toContain(' --unmanaged');
    });
  });

  describe('run – --no-gitignore argv override', () => {
    it('adds --no-gitignore to the extract command when the flag is in argv', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--no-gitignore']);

      expect(capturedCommand()).toContain(' --no-gitignore');
    });

    it('overrides entry-level gitignore:true and adds --no-gitignore to the command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', gitignore: true } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--no-gitignore']);

      expect(capturedCommand()).toContain(' --no-gitignore');
    });

    it('does not add --no-gitignore when the flag is absent', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).not.toContain('--no-gitignore');
    });

    it('applies --no-gitignore override across all entries', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a', gitignore: true } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--no-gitignore']);

      const cmds = capturedCommands();
      expect(cmds).toHaveLength(2);
      expect(cmds[0]).toContain(' --no-gitignore');
      expect(cmds[1]).toContain(' --no-gitignore');
    });
  });

  describe('run – check action', () => {
    it('runs a check command for each entry', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'check']);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.every((c) => c.includes('check'))).toBe(true);
    });

    it('passes correct package and output dir in the check command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a@^1.0.0', output: { path: './data' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'check']);

      const cmd = capturedCommand();
      expect(cmd).toContain('check');
      expect(cmd).toContain('--packages "pkg-a@^1.0.0"');
      expect(cmd).toContain(`--output "${path.resolve('./data')}"`);
    });

    it('respects --presets when running check', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'check', '--presets', 'prod']);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('pkg-a');
    });

    it('uses --output as base dir for resolving outputDir in check', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: 'data' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'check', '--output', '/custom/base']);

      expect(capturedCommand()).toContain(`--output "${path.resolve('/custom/base', 'data')}"`);
    });

    it('uses default entry when npmdata is absent', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, ['node', 'script.js', 'check']);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('--packages "my-pkg"');
    });

    it('passes --files from entry to check command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            {
              package: 'pkg-a',
              output: { path: './data' },
              selector: { files: ['*.md', 'docs/**'] },
            },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'check']);

      expect(capturedCommand()).toContain('--files "*.md,docs/**"');
    });

    it('passes --content-regex from entry to check command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            {
              package: 'pkg-a',
              output: { path: './data' },
              selector: { contentRegexes: ['foo.*bar'] },
            },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'check']);

      expect(capturedCommand()).toContain('--content-regex "foo.*bar"');
    });

    it('passes both --files and --content-regex from entry to check command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            {
              package: 'pkg-a',
              output: { path: './data' },
              selector: { files: ['data/**'], contentRegexes: ['pattern'] },
            },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'check']);

      const cmd = capturedCommand();
      expect(cmd).toContain('--files "data/**"');
      expect(cmd).toContain('--content-regex "pattern"');
    });

    it('skips entries with unmanaged:true during check', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-managed', output: { path: './a' } },
            { package: 'pkg-unmanaged', output: { path: './b', unmanaged: true } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'check']);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('pkg-managed');
      expect(capturedCommand()).not.toContain('pkg-unmanaged');
    });

    it('skips all entries during check when --unmanaged flag is set', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'check', '--unmanaged']);

      expect(mockExecSync).not.toHaveBeenCalled();
    });
  });

  describe('run – check action with contentReplacements', () => {
    // eslint-disable-next-line functional/no-let
    let tmpDir: string;

    beforeEach(() => {
      (fs.mkdirSync as jest.Mock).mockImplementation(
        jest.requireActual<typeof fs>('node:fs').mkdirSync,
      );
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-run-check-cr-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('exits with status 1 and writes to stderr when contentReplacements are out of sync', () => {
      mockReadFileSync.mockReturnValueOnce(
        Buffer.from(
          JSON.stringify({
            name: 'my-pkg',
            npmdata: {
              sets: [
                {
                  package: 'pkg-a',
                  output: {
                    path: '.',
                    contentReplacements: [
                      { files: 'doc.md', match: '<!-- old -->', replace: '<!-- new -->' },
                    ],
                  },
                },
              ],
            },
          }),
        ),
      );
      mockReadFileSync.mockImplementation(jest.requireActual<typeof fs>('node:fs').readFileSync);
      fs.writeFileSync(path.join(tmpDir, 'doc.md'), '<!-- old -->');
      fs.writeFileSync(path.join(tmpDir, '.npmdata'), 'doc.md|pkg-a|1.0.0|0\n');

      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      // eslint-disable-next-line functional/no-let
      let capturedExitCode: number | undefined;
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation((code) => {
        capturedExitCode = code as number;
        throw Object.assign(new Error('process.exit'), { code });
      });

      expect(() => run(BIN_DIR, ['node', 'script.js', 'check', '--output', tmpDir])).toThrow();

      expect(capturedExitCode).toBe(1);
      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('content-replacement out of sync'),
      );
      stderrSpy.mockRestore();
      exitSpy.mockRestore();
    });

    it('does not throw when contentReplacements are already in sync', () => {
      mockReadFileSync.mockReturnValueOnce(
        Buffer.from(
          JSON.stringify({
            name: 'my-pkg',
            npmdata: {
              sets: [
                {
                  package: 'pkg-a',
                  output: {
                    path: '.',
                    contentReplacements: [
                      { files: 'doc.md', match: '<!-- old -->', replace: '<!-- new -->' },
                    ],
                  },
                },
              ],
            },
          }),
        ),
      );
      mockReadFileSync.mockImplementation(jest.requireActual<typeof fs>('node:fs').readFileSync);
      // File already has replacement applied – no diff expected
      fs.writeFileSync(path.join(tmpDir, 'doc.md'), '<!-- new -->');
      fs.writeFileSync(path.join(tmpDir, '.npmdata'), 'doc.md|pkg-a|1.0.0|0\n');

      expect(() => run(BIN_DIR, ['node', 'script.js', 'check', '--output', tmpDir])).not.toThrow();
    });
  });

  describe('run – list action', () => {
    it('runs a list command for each unique outputDir', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'list']);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.every((c) => c.includes('list'))).toBe(true);
    });

    it('runs only one list command when multiple entries share the same outputDir', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './data' } },
            { package: 'pkg-b', output: { path: './data' } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'list']);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('passes the resolved output dir in the list command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './data' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'list']);

      expect(capturedCommand()).toContain(`--output "${path.resolve('./data')}"`);
    });

    it('uses --output as base dir for resolving outputDir in list', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: 'data' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'list', '--output', '/custom/base']);

      expect(capturedCommand()).toContain(`--output "${path.resolve('/custom/base', 'data')}"`);
    });

    it('lists all entries regardless of preset filter', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
          ],
        },
      });

      // Even with --presets, list should show all output dirs
      run(BIN_DIR, ['node', 'script.js', 'list', '--presets', 'prod']);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
    });

    it('uses default entry when npmdata is absent', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, ['node', 'script.js', 'list']);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('list');
    });
  });

  describe('run – purge action', () => {
    it('runs a purge command for each entry', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'purge']);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.every((c) => c.includes('purge'))).toBe(true);
    });

    it('respects --presets when running purge', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging'] },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'purge', '--presets', 'prod']);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('pkg-a');
    });

    it('overlays --dry-run from argv onto the purge command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'purge', '--dry-run']);

      expect(capturedCommand()).toContain('--dry-run');
    });

    it('overlays --silent from argv onto the purge command', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'purge', '--silent']);

      expect(capturedCommand()).toContain('--silent');
    });

    it('uses --output as base dir for resolving outputDir in purge', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: 'data' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'purge', '--output', '/custom/base']);

      expect(capturedCommand()).toContain(`--output "${path.resolve('/custom/base', 'data')}"`);
    });

    it('uses default entry when npmdata is absent', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, ['node', 'script.js', 'purge']);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('purge');
      expect(capturedCommand()).toContain('--packages "my-pkg"');
    });
  });

  describe('run – purge action with symlinks', () => {
    // eslint-disable-next-line functional/no-let
    let tmpDir: string;

    beforeEach(() => {
      (fs.mkdirSync as jest.Mock).mockImplementation(
        jest.requireActual<typeof fs>('node:fs').mkdirSync,
      );
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-run-purge-sym-test-'));
    });

    afterEach(() => {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('removes stale managed symlinks from target dirs after purge', () => {
      const outputDir = path.join(tmpDir, 'out');
      const targetDir = path.join(outputDir, '.github', 'skills');
      fs.mkdirSync(path.join(outputDir, 'skills'), { recursive: true });
      fs.mkdirSync(targetDir, { recursive: true });

      // Dead managed symlink pointing into outputDir (simulates a previously extracted file)
      const staleSource = path.join(outputDir, 'skills', 'skill-OLD');
      fs.symlinkSync(staleSource, path.join(targetDir, 'skill-OLD'));

      mockReadFileSync.mockReturnValueOnce(
        Buffer.from(
          JSON.stringify({
            name: 'my-pkg',
            npmdata: {
              sets: [
                {
                  package: 'pkg-a',
                  output: {
                    path: 'out',
                    symlinks: [{ source: 'skills/*', target: '.github/skills' }],
                  },
                },
              ],
            },
          }),
        ),
      );
      mockReadFileSync.mockImplementation(jest.requireActual<typeof fs>('node:fs').readFileSync);

      run(BIN_DIR, ['node', 'script.js', 'purge', '--output', tmpDir]);

      const linkGone = ((): boolean => {
        // eslint-disable-next-line functional/no-try-statements
        try {
          fs.lstatSync(path.join(targetDir, 'skill-OLD'));
          return false;
        } catch {
          return true;
        }
      })();
      expect(linkGone).toBe(true);
    });

    it('does not remove symlinks when --dry-run is active', () => {
      const outputDir = path.join(tmpDir, 'out');
      const targetDir = path.join(outputDir, '.github', 'skills');
      fs.mkdirSync(path.join(outputDir, 'skills'), { recursive: true });
      fs.mkdirSync(targetDir, { recursive: true });

      const staleSource = path.join(outputDir, 'skills', 'skill-OLD');
      fs.symlinkSync(staleSource, path.join(targetDir, 'skill-OLD'));

      mockReadFileSync.mockReturnValueOnce(
        Buffer.from(
          JSON.stringify({
            name: 'my-pkg',
            npmdata: {
              sets: [
                {
                  package: 'pkg-a',
                  output: {
                    path: 'out',
                    symlinks: [{ source: 'skills/*', target: '.github/skills' }],
                  },
                },
              ],
            },
          }),
        ),
      );
      mockReadFileSync.mockImplementation(jest.requireActual<typeof fs>('node:fs').readFileSync);

      run(BIN_DIR, ['node', 'script.js', 'purge', '--dry-run', '--output', tmpDir]);

      // Symlink must survive because dry-run skips applySymlinks
      expect(fs.lstatSync(path.join(targetDir, 'skill-OLD')).isSymbolicLink()).toBe(true);
    });
  });

  describe('run – extract --dry-run from argv', () => {
    it('adds --dry-run to the extract command when --dry-run is in argv', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--dry-run']);

      expect(capturedCommand()).toContain('--dry-run');
    });

    it('adds --silent to the extract command when --silent is in argv', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--silent']);

      expect(capturedCommand()).toContain('--silent');
    });

    it('merges argv --dry-run with entry dryRun:false (argv wins)', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', dryRun: false } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--dry-run']);

      expect(capturedCommand()).toContain('--dry-run');
    });

    it('keeps --dry-run when already set in entry config', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', dryRun: true } }] },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract']);

      expect(capturedCommand()).toContain('--dry-run');
    });

    it('applies --dry-run overlay to all entries', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--dry-run']);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      const cmds = capturedCommands();
      expect(cmds.every((c) => c.includes('--dry-run'))).toBe(true);
    });
  });

  describe('run – --help flag', () => {
    it('prints help and does not run any extractions when --help is present', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' }, presets: ['prod'] }] },
      });
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', '--help']);

      expect(mockExecSync).not.toHaveBeenCalled();
      expect(writeSpy).toHaveBeenCalled();
      writeSpy.mockRestore();
    });

    it('includes package name in help output', () => {
      setupPackageJson({ name: 'my-special-pkg' });
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', '--help']);

      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('my-special-pkg');
      writeSpy.mockRestore();
    });

    it('lists presets from npmdata entries in help output', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' }, presets: ['prod'] },
            { package: 'pkg-b', output: { path: './b' }, presets: ['staging', 'prod'] },
          ],
        },
      });
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', '--help']);

      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('prod');
      expect(output).toContain('staging');
      writeSpy.mockRestore();
    });

    it('shows placeholder when no presets are defined', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' } }] },
      });
      const writeSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', '--help']);

      const output = writeSpy.mock.calls[0][0] as string;
      expect(output).toContain('(none defined in package.json)');
      writeSpy.mockRestore();
    });
  });

  describe('run – default extract', () => {
    it('runs extract when no action is provided', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' } }] },
      });

      run(BIN_DIR, ['node', 'script.js']);

      expect(mockExecSync).toHaveBeenCalled();
      expect(capturedCommand()).toContain('extract');
    });

    it('runs extract when only flags are provided (no explicit action)', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' }, presets: ['t1'] }] },
      });

      run(BIN_DIR, ['node', 'script.js', '--presets', 't1']);

      expect(mockExecSync).toHaveBeenCalled();
      expect(capturedCommand()).toContain('extract');
    });
  });

  describe('run – unknown action', () => {
    it('prints an error and help without extracting for an unknown action', () => {
      setupPackageJson({ name: 'my-pkg' });
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'bogus']);

      expect(mockExecSync).not.toHaveBeenCalled();
      expect(stderrSpy).toHaveBeenCalled();
      expect(stdoutSpy).toHaveBeenCalled();
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    });

    it('includes the unknown action name in the error message', () => {
      setupPackageJson({ name: 'my-pkg' });
      const stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'bogus']);

      const errOutput = stderrSpy.mock.calls[0][0] as string;
      expect(errOutput).toContain('bogus');
      stderrSpy.mockRestore();
      stdoutSpy.mockRestore();
    });
  });

  describe('run – output formatting: blank lines and totals', () => {
    it('writes a blank line between entries for extract', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, EXTRACT_ARGV);

      const written = stdoutSpy.mock.calls.map((c) => c[0] as string);
      expect(written).toContain('\n');
      stdoutSpy.mockRestore();
    });

    it('writes "Total extracted" after multiple extract entries', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });
      mockExecSync.mockReturnValue(
        'Extraction complete: 2 added, 0 modified, 0 deleted, 0 skipped',
      );
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, EXTRACT_ARGV);

      const allOutput = stdoutSpy.mock.calls.map((c) => c[0] as string).join('');
      expect(allOutput).toContain('Total extracted: 4 added, 0 modified, 0 deleted, 0 skipped');
      stdoutSpy.mockRestore();
    });

    it('does not write "Total extracted" for a single extract entry', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' } }] },
      });
      mockExecSync.mockReturnValue(
        'Extraction complete: 2 added, 0 modified, 0 deleted, 0 skipped',
      );
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, EXTRACT_ARGV);

      const allOutput = stdoutSpy.mock.calls.map((c) => c[0] as string).join('');
      expect(allOutput).not.toContain('Total extracted:');
      stdoutSpy.mockRestore();
    });

    it('writes a blank line between entries for purge', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'purge']);

      const written = stdoutSpy.mock.calls.map((c) => c[0] as string);
      expect(written).toContain('\n');
      stdoutSpy.mockRestore();
    });

    it('writes "Total purged" accumulating counts from multiple purge entries', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });
      mockExecSync.mockReturnValue('Purge complete: 3 deleted');
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'purge']);

      const allOutput = stdoutSpy.mock.calls.map((c) => c[0] as string).join('');
      expect(allOutput).toContain('Total purged: 6');
      stdoutSpy.mockRestore();
    });

    it('does not write "Total purged" for a single purge entry', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' } }] },
      });
      mockExecSync.mockReturnValue('Purge complete: 3 deleted');
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'purge']);

      const allOutput = stdoutSpy.mock.calls.map((c) => c[0] as string).join('');
      expect(allOutput).not.toContain('Total purged:');
      stdoutSpy.mockRestore();
    });

    it('does not write "Total purged" when --silent is set', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });
      mockExecSync.mockReturnValue('Purge complete: 3 deleted');
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'purge', '--silent']);

      const allOutput = stdoutSpy.mock.calls.map((c) => c[0] as string).join('');
      expect(allOutput).not.toContain('Total purged:');
      stdoutSpy.mockRestore();
    });

    it('writes a blank line between entries for check', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'check']);

      const written = stdoutSpy.mock.calls.map((c) => c[0] as string);
      expect(written).toContain('\n');
      stdoutSpy.mockRestore();
    });

    it('writes "Total checked" after multiple check entries', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [
            { package: 'pkg-a', output: { path: './a' } },
            { package: 'pkg-b', output: { path: './b' } },
          ],
        },
      });
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'check']);

      const allOutput = stdoutSpy.mock.calls.map((c) => c[0] as string).join('');
      expect(allOutput).toContain('Total checked: 2 packages');
      stdoutSpy.mockRestore();
    });

    it('does not write "Total checked" for a single check entry', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: { sets: [{ package: 'pkg-a', output: { path: './a' } }] },
      });
      const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);

      run(BIN_DIR, ['node', 'script.js', 'check']);

      const allOutput = stdoutSpy.mock.calls.map((c) => c[0] as string).join('');
      expect(allOutput).not.toContain('Total checked:');
      stdoutSpy.mockRestore();
    });
  });

  describe('runEntries', () => {
    const CLI_PATH = '/fake/npmdata/dist/main.js';
    const entries: NpmdataExtractEntry[] = [
      { package: 'pkg-a', output: { path: './a' } },
      { package: 'pkg-b', output: { path: './b' } },
    ];

    it('invokes execSync once per entry for extract action', () => {
      runEntries(entries, 'extract', ['node', 'script.js', 'extract'], CLI_PATH);

      expect(mockExecSync).toHaveBeenCalledTimes(2);
      expect(capturedCommands()[0]).toContain('--packages "pkg-a"');
      expect(capturedCommands()[1]).toContain('--packages "pkg-b"');
    });

    it('invokes execSync for check action', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockExecSync.mockReturnValue(Buffer.from('All files are in sync\n') as any);

      runEntries(
        [{ package: 'pkg-a', output: { path: './a' } }],
        'check',
        ['node', 'script.js', 'check'],
        CLI_PATH,
      );

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('check');
      expect(capturedCommand()).toContain('--packages "pkg-a"');
    });

    it('invokes execSync for purge action', () => {
      // Return a string (not Buffer) because runPurge calls .match() on the captured stdout.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockExecSync.mockReturnValue('Purge complete: 0 deleted\n' as any);

      runEntries(
        [{ package: 'pkg-a', output: { path: './a' } }],
        'purge',
        ['node', 'script.js', 'purge'],
        CLI_PATH,
      );

      expect(mockExecSync).toHaveBeenCalledTimes(1);
      expect(capturedCommand()).toContain('purge');
      expect(capturedCommand()).toContain('"pkg-a"');
    });

    it('uses the provided cliPath in the generated command', () => {
      runEntries(
        [{ package: 'pkg-a', output: { path: '.' } }],
        'extract',
        ['node', 'script.js', 'extract'],
        CLI_PATH,
      );

      expect(capturedCommand()).toContain(CLI_PATH);
    });

    it('filters entries by --presets when provided in argv', () => {
      const taggedEntries: NpmdataExtractEntry[] = [
        { package: 'pkg-a', output: { path: './a' }, presets: ['docs'] },
        { package: 'pkg-b', output: { path: './b' }, presets: ['data'] },
      ];

      runEntries(
        taggedEntries,
        'extract',
        ['node', 'script.js', 'extract', '--presets', 'docs'],
        CLI_PATH,
      );

      // Only pkg-a should be extracted; pkg-b gets purged (tag-excluded)
      const commands = capturedCommands();
      expect(commands.some((c) => c.includes('--packages "pkg-a"') && c.includes('extract'))).toBe(
        true,
      );
      expect(commands.some((c) => c.includes('--packages "pkg-b"') && c.includes('purge'))).toBe(
        true,
      );
    });

    it('calls process.exit when a sub-command fails', () => {
      const exitError = Object.assign(new Error('failed'), { status: 3 });
      mockExecSync.mockImplementation(() => {
        throw exitError;
      });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      expect(() =>
        runEntries(
          [{ package: 'pkg-a', output: { path: '.' } }],
          'extract',
          ['node', 'script.js', 'extract'],
          CLI_PATH,
        ),
      ).toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(3);
      mockExit.mockRestore();
    });
  });

  describe('run – postExtractScript config', () => {
    it('runs postExtractScript after extract when defined in npmdata config', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [{ package: 'my-pkg', output: { path: '.' } }],
          postExtractScript: 'node postExtract.js',
        },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      const commands = capturedCommands();
      const postExtractCall = commands.at(-1);
      expect(postExtractCall).toContain('node postExtract.js');
    });

    it('passes user args to the postExtractScript', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [{ package: 'my-pkg', output: { path: '.' } }],
          postExtractScript: 'node postExtract.js',
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--verbose', '--output', '/some/dir']);

      const commands = capturedCommands();
      const postExtractCall = commands.at(-1);
      expect(postExtractCall).toContain('node postExtract.js');
      expect(postExtractCall).toContain('extract');
      expect(postExtractCall).toContain('--verbose');
      expect(postExtractCall).toContain('--output');
      expect(postExtractCall).toContain('/some/dir');
    });

    it('does not run postExtractScript when it is not defined in config', () => {
      setupPackageJson({ name: 'my-pkg' });

      run(BIN_DIR, EXTRACT_ARGV);

      // Only one call for the extract itself; no postExtract call
      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('does not run postExtractScript during dry-run', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [{ package: 'my-pkg', output: { path: '.' } }],
          postExtractScript: 'node postExtract.js',
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--dry-run']);

      const commands = capturedCommands();
      expect(commands.every((c) => !c.includes('postExtract.js'))).toBe(true);
    });

    it('does not run postExtractScript for non-extract actions', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [{ package: 'my-pkg', output: { path: '.' } }],
          postExtractScript: 'node postExtract.js',
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'check']);

      const commands = capturedCommands();
      expect(commands.every((c) => !c.includes('postExtract.js'))).toBe(true);
    });

    it('runs postExtractScript with cwd resolved from --output flag', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [{ package: 'my-pkg', output: { path: '.' } }],
          postExtractScript: 'node postExtract.js',
        },
      });

      run(BIN_DIR, ['node', 'script.js', 'extract', '--output', '/custom/base']);

      const { calls } = mockExecSync.mock;
      const lastCall = calls.at(-1);
      expect(lastCall).toBeDefined();
      const lastCallOptions = lastCall![1] as { cwd?: string };
      expect(lastCallOptions.cwd).toBe('/custom/base');
    });

    it('propagates exit code when postExtractScript fails', () => {
      setupPackageJson({
        name: 'my-pkg',
        npmdata: {
          sets: [{ package: 'my-pkg', output: { path: '.' } }],
          postExtractScript: 'node postExtract.js',
        },
      });
      // First call (extract) succeeds (default mock returns undefined),
      // second call (postExtract) throws with a non-zero exit code.
      mockExecSync
        .mockImplementationOnce(() => undefined as unknown as ReturnType<typeof execSync>)
        .mockImplementationOnce(() => {
          throw Object.assign(new Error('postExtract failed'), { status: 5 });
        });

      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      expect(() => run(BIN_DIR, EXTRACT_ARGV)).toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(5);
      mockExit.mockRestore();
    });
  });

  describe('runEntries \u2013 postExtractScript', () => {
    const CLI_PATH = '/fake/npmdata/dist/main.js';
    const entries: NpmdataExtractEntry[] = [{ package: 'pkg-a', output: { path: './a' } }];

    it('runs postExtractScript after extract when provided', () => {
      runEntries(entries, 'extract', ['node', 'script.js', 'extract'], CLI_PATH, 'node post.js');

      const commands = capturedCommands();
      expect(commands.some((c) => c.includes('node post.js'))).toBe(true);
    });

    it('passes user args to postExtractScript', () => {
      runEntries(
        entries,
        'extract',
        ['node', 'script.js', 'extract', '--verbose'],
        CLI_PATH,
        'node post.js',
      );

      const commands = capturedCommands();
      const postCall = commands.at(-1);
      expect(postCall).toContain('node post.js');
      expect(postCall).toContain('--verbose');
    });

    it('does not run postExtractScript when not provided', () => {
      runEntries(entries, 'extract', ['node', 'script.js', 'extract'], CLI_PATH);

      expect(mockExecSync).toHaveBeenCalledTimes(1);
    });

    it('does not run postExtractScript during dry-run', () => {
      runEntries(
        entries,
        'extract',
        ['node', 'script.js', 'extract', '--dry-run'],
        CLI_PATH,
        'node post.js',
      );

      const commands = capturedCommands();
      expect(commands.every((c) => !c.includes('node post.js'))).toBe(true);
    });

    it('does not run postExtractScript for non-extract actions', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockExecSync.mockReturnValue('Purge complete: 0 deleted\n' as any);

      runEntries(entries, 'purge', ['node', 'script.js', 'purge'], CLI_PATH, 'node post.js');

      const commands = capturedCommands();
      expect(commands.every((c) => !c.includes('node post.js'))).toBe(true);
    });
  });
});
