import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { NpmdataExtractEntry } from '../types';

import { run, buildCheckCommand, buildListCommand, buildPurgeCommand } from './index';

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

function setupPackageJson(content: Record<string, unknown>): void {
  mockReadFileSync.mockReturnValue(Buffer.from(JSON.stringify(content)));
}

describe('runner', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('buildExtractCommand – flag assembly', () => {
    it('builds a minimal command with only required fields', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: './out' } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      const cmd = capturedCommand();
      expect(cmd).toContain('--packages "my-pkg"');
      expect(cmd).toContain(`--output "${path.resolve('./out')}"`);
      expect(cmd).not.toContain('--force');
      expect(cmd).not.toContain('--no-gitignore');
      expect(cmd).not.toContain('--unmanaged');
      expect(cmd).not.toContain('--silent');
      expect(cmd).not.toContain('--dry-run');
      expect(cmd).not.toContain('--upgrade');
      expect(cmd).not.toContain('--files');
      expect(cmd).not.toContain('--content-regex');
    });

    it('adds --force when force is true', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', force: true } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(' --force');
    });

    it('omits --force when force is false', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', force: false } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).not.toContain('--force');
    });

    it('adds --keep-existing when keepExisting is true', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', keepExisting: true } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(' --keep-existing');
    });

    it('omits --keep-existing when keepExisting is false', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', keepExisting: false } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).not.toContain('--keep-existing');
    });

    it('omits --no-gitignore when gitignore is true', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', gitignore: true } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).not.toContain('--no-gitignore');
    });

    it('adds --no-gitignore when gitignore is false', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', gitignore: false } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(' --no-gitignore');
    });

    it('adds --silent when silent is true', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' }, silent: true }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(' --silent');
    });

    it('adds --dry-run when dryRun is true', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', dryRun: true } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(' --dry-run');
    });

    it('adds --upgrade when upgrade is true', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' }, upgrade: true }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(' --upgrade');
    });

    it('adds --unmanaged when unmanaged is true', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', unmanaged: true } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain(' --unmanaged');
    });

    it('omits --unmanaged when unmanaged is false', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.', unmanaged: false } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).not.toContain('--unmanaged');
    });

    it('adds --files with a single file pattern', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: {
          sets: [{ package: 'my-pkg', output: { path: '.' }, selector: { files: ['**/*.md'] } }],
        },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain('--files "**/*.md"');
    });

    it('joins multiple file patterns with a comma', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: {
          sets: [
            {
              package: 'my-pkg',
              output: { path: '.' },
              selector: { files: ['**/*.md', 'data/**'] },
            },
          ],
        },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain('--files "**/*.md,data/**"');
    });

    it('omits --files when files array is empty', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' }, selector: { files: [] } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).not.toContain('--files');
    });

    it('adds --content-regex with a single regex pattern', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: {
          sets: [
            {
              package: 'my-pkg',
              output: { path: '.' },
              selector: { contentRegexes: ['foo.*bar'] },
            },
          ],
        },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain('--content-regex "foo.*bar"');
    });

    it('joins multiple content regex patterns with a comma', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: {
          sets: [
            {
              package: 'my-pkg',
              output: { path: '.' },
              selector: { contentRegexes: ['foo.*bar', '^baz'] },
            },
          ],
        },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).toContain('--content-regex "foo.*bar,^baz"');
    });

    it('omits --content-regex when contentRegexes array is empty', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: {
          sets: [{ package: 'my-pkg', output: { path: '.' }, selector: { contentRegexes: [] } }],
        },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      expect(capturedCommand()).not.toContain('--content-regex');
    });

    it('builds a command with all flags enabled', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: {
          sets: [
            {
              package: 'full-pkg@^2.0.0',
              output: { path: './data', force: true, gitignore: false, dryRun: true },
              selector: { files: ['**/*.json', 'docs/**'], contentRegexes: ['schema', 'version'] },
              silent: true,
              upgrade: true,
            },
          ],
        },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      const cmd = capturedCommand();
      expect(cmd).toContain('--packages "full-pkg@^2.0.0"');
      expect(cmd).toContain(`--output "${path.resolve('./data')}"`);
      expect(cmd).toContain(' --force');
      expect(cmd).toContain(' --no-gitignore');
      expect(cmd).toContain(' --silent');
      expect(cmd).toContain(' --dry-run');
      expect(cmd).toContain(' --upgrade');
      expect(cmd).toContain('--files "**/*.json,docs/**"');
      expect(cmd).toContain('--content-regex "schema,version"');
    });

    it('uses the resolved CLI path in the command', () => {
      setupPackageJson({
        name: 'irrelevant',
        npmdata: { sets: [{ package: 'my-pkg', output: { path: '.' } }] },
      });

      run(BIN_DIR, EXTRACT_ARGV);

      // The command must reference an absolute path to main.js and contain the extract sub-command.
      expect(capturedCommand()).toMatch(/node ".+main\.js"/);
      expect(capturedCommand()).toContain('extract');
    });
  });

  describe('buildCheckCommand', () => {
    const CLI_PATH = '/path/to/main.js';
    const CHECK_CWD = '/my/project';

    it('builds a check command with package and resolved output dir', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: './out' } };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).toContain('check');
      expect(cmd).toContain('--packages "my-pkg"');
      expect(cmd).toContain('--output "/my/project/out"');
    });

    it('resolves a relative outputDir to an absolute path', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: 'data' } };
      const cmd = buildCheckCommand(CLI_PATH, entry, '/project/root');
      expect(cmd).toContain('--output "/project/root/data"');
    });

    it('resolves dot outputDir to the cwd itself', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '.' } };
      const cmd = buildCheckCommand(CLI_PATH, entry, '/project/root');
      expect(cmd).toContain('--output "/project/root"');
    });

    it('preserves a version specifier in the package name', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg@^2.0.0', output: { path: '.' } };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).toContain('--packages "my-pkg@^2.0.0"');
    });

    it('uses node and the provided CLI path', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '.' } };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).toMatch(/node ".+main\.js"/);
    });

    it('uses process.cwd() as default cwd when none is provided', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: 'out' } };
      const cmd = buildCheckCommand(CLI_PATH, entry);
      expect(cmd).toContain(`--output "${path.resolve(process.cwd(), 'out')}"`);
    });

    it('includes --files flag when files are specified', () => {
      const entry: NpmdataExtractEntry = {
        package: 'my-pkg',
        output: { path: '.' },
        selector: { files: ['*.md', 'docs/**'] },
      };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).toContain('--files "*.md,docs/**"');
    });

    it('omits --files flag when files is not set', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '.' } };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).not.toContain('--files');
    });

    it('omits --files flag when files is an empty array', () => {
      const entry: NpmdataExtractEntry = {
        package: 'my-pkg',
        output: { path: '.' },
        selector: { files: [] },
      };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).not.toContain('--files');
    });

    it('includes --content-regex flag when contentRegexes are specified', () => {
      const entry: NpmdataExtractEntry = {
        package: 'my-pkg',
        output: { path: '.' },
        selector: { contentRegexes: ['foo.*bar', '^version:'] },
      };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).toContain('--content-regex "foo.*bar,^version:"');
    });

    it('omits --content-regex flag when contentRegexes is not set', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '.' } };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).not.toContain('--content-regex');
    });

    it('omits --content-regex flag when contentRegexes is an empty array', () => {
      const entry: NpmdataExtractEntry = {
        package: 'my-pkg',
        output: { path: '.' },
        selector: { contentRegexes: [] },
      };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).not.toContain('--content-regex');
    });

    it('includes both --files and --content-regex when both are set', () => {
      const entry: NpmdataExtractEntry = {
        package: 'my-pkg',
        output: { path: './out' },
        selector: { files: ['data/**'], contentRegexes: ['pattern'] },
      };
      const cmd = buildCheckCommand(CLI_PATH, entry, CHECK_CWD);
      expect(cmd).toContain('--files "data/**"');
      expect(cmd).toContain('--content-regex "pattern"');
    });
  });

  describe('buildListCommand', () => {
    const CLI_PATH = '/path/to/main.js';
    const LIST_CWD = '/my/project';

    it('builds a list command with the resolved output dir', () => {
      const cmd = buildListCommand(CLI_PATH, './out', LIST_CWD);
      expect(cmd).toContain('list');
      expect(cmd).toContain('--output "/my/project/out"');
    });

    it('resolves a relative outputDir to an absolute path', () => {
      const cmd = buildListCommand(CLI_PATH, 'data', '/project/root');
      expect(cmd).toContain('--output "/project/root/data"');
    });

    it('resolves dot outputDir to the cwd itself', () => {
      const cmd = buildListCommand(CLI_PATH, '.', '/project/root');
      expect(cmd).toContain('--output "/project/root"');
    });

    it('uses node and the provided CLI path', () => {
      const cmd = buildListCommand(CLI_PATH, '.', LIST_CWD);
      expect(cmd).toMatch(/node ".+main\.js"/);
    });

    it('uses process.cwd() as default cwd when none is provided', () => {
      const cmd = buildListCommand(CLI_PATH, 'out');
      expect(cmd).toContain(`--output "${path.resolve(process.cwd(), 'out')}"`);
    });

    it('does not include --packages in the command', () => {
      const cmd = buildListCommand(CLI_PATH, '.', LIST_CWD);
      expect(cmd).not.toContain('--packages');
    });
  });

  describe('buildPurgeCommand', () => {
    const CLI_PATH = '/path/to/main.js';
    const PURGE_CWD = '/my/project';

    it('builds a purge command with package name and resolved absolute output dir', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: './out' } };
      const cmd = buildPurgeCommand(CLI_PATH, entry, PURGE_CWD);
      expect(cmd).toContain('purge');
      expect(cmd).toContain('--packages "my-pkg"');
      expect(cmd).toContain('--output "/my/project/out"');
    });

    it('resolves a relative outputDir to an absolute path', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: 'data' } };
      const cmd = buildPurgeCommand(CLI_PATH, entry, '/project/root');
      expect(cmd).toContain('--output "/project/root/data"');
    });

    it('resolves dot outputDir to the cwd itself', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '.' } };
      const cmd = buildPurgeCommand(CLI_PATH, entry, '/project/root');
      expect(cmd).toContain('--output "/project/root"');
    });

    it('resolves an absolute outputDir as-is, ignoring cwd', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '/absolute/path' } };
      const cmd = buildPurgeCommand(CLI_PATH, entry, '/project/root');
      expect(cmd).toContain('--output "/absolute/path"');
    });

    it('strips version specifier from the package name', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg@^2.0.0', output: { path: '.' } };
      const cmd = buildPurgeCommand(CLI_PATH, entry, PURGE_CWD);
      expect(cmd).toContain('--packages "my-pkg"');
      expect(cmd).not.toContain('2.0.0');
    });

    it('adds --silent when entry has silent: true', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '.' }, silent: true };
      const cmd = buildPurgeCommand(CLI_PATH, entry, PURGE_CWD);
      expect(cmd).toContain(' --silent');
    });

    it('adds --dry-run when entry has dryRun: true', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '.', dryRun: true } };
      const cmd = buildPurgeCommand(CLI_PATH, entry, PURGE_CWD);
      expect(cmd).toContain(' --dry-run');
    });

    it('uses node and the provided CLI path', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: '.' } };
      const cmd = buildPurgeCommand(CLI_PATH, entry, PURGE_CWD);
      expect(cmd).toMatch(/node ".+main\.js"/);
    });

    it('uses process.cwd() as default cwd when none is provided', () => {
      const entry: NpmdataExtractEntry = { package: 'my-pkg', output: { path: 'out' } };
      const cmd = buildPurgeCommand(CLI_PATH, entry);
      expect(cmd).toContain(`--output "${path.resolve(process.cwd(), 'out')}"`);
    });
  });
});
