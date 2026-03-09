/* eslint-disable unicorn/no-null */
/* eslint-disable no-console */
import { actionList } from '../../package/action-list';
import { NpmdataConfig, ManagedFileMetadata } from '../../types';
import { printUsage } from '../usage';

import { runList } from './list';

jest.mock('../usage', () => ({ printUsage: jest.fn() }));
jest.mock('../../package/action-list', () => ({
  actionList: jest.fn(),
}));

const mockPrintUsage = printUsage as jest.MockedFunction<typeof printUsage>;
const mockActionList = actionList as jest.MockedFunction<typeof actionList>;

const CONFIG: NpmdataConfig = {
  sets: [{ package: 'my-pkg@1.0.0', output: { path: './out', gitignore: false } }],
};

const SAMPLE_FILES: ManagedFileMetadata[] = [
  { path: 'docs/guide.md', packageName: 'my-pkg', packageVersion: '1.0.0' },
  { path: 'docs/api.md', packageName: 'my-pkg', packageVersion: '1.0.0' },
];

beforeEach(() => {
  jest.clearAllMocks();
  delete process.exitCode;
  mockActionList.mockResolvedValue([]);
});

afterEach(() => {
  delete process.exitCode;
});

describe('runList — --help', () => {
  it('prints usage and returns without calling actionList', async () => {
    await runList(CONFIG, ['--help'], '/cwd');
    expect(mockPrintUsage).toHaveBeenCalledWith('list');
    expect(mockActionList).not.toHaveBeenCalled();
  });
});

describe('runList — file listing', () => {
  it('logs each managed file with path and package@version', async () => {
    mockActionList.mockResolvedValue(SAMPLE_FILES);
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    await runList(CONFIG, [], '/cwd');
    spy.mockRestore();
    expect(logs).toContain('docs/guide.md  my-pkg@1.0.0');
    expect(logs).toContain('docs/api.md  my-pkg@1.0.0');
  });

  it('does not log anything when no files found and verbose is off', async () => {
    mockActionList.mockResolvedValue([]);
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    await runList(CONFIG, [], '/cwd');
    spy.mockRestore();
    expect(logs).toHaveLength(0);
  });

  it('logs "No managed files found." when verbose and result is empty', async () => {
    mockActionList.mockResolvedValue([]);
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.join(' '));
    });
    await runList(CONFIG, ['--verbose'], '/cwd');
    spy.mockRestore();
    expect(logs).toContain('No managed files found.');
  });
});

describe('runList — exit code', () => {
  it('does not set exitCode on success (even with files)', async () => {
    mockActionList.mockResolvedValue(SAMPLE_FILES);
    const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    await runList(CONFIG, [], '/cwd');
    spy.mockRestore();
    expect(process.exitCode).toBeUndefined();
  });

  it('does not set exitCode on success with empty result', async () => {
    mockActionList.mockResolvedValue([]);
    await runList(CONFIG, [], '/cwd');
    expect(process.exitCode).toBeUndefined();
  });
});

describe('runList — options forwarding', () => {
  it('passes empty entries array when config is null', async () => {
    await runList(null, [], '/cwd');
    const callArg = mockActionList.mock.calls[0][0];
    expect(callArg.entries).toEqual([]);
  });

  it('passes config sets as entries', async () => {
    await runList(CONFIG, [], '/cwd');
    const callArg = mockActionList.mock.calls[0][0];
    expect(callArg.entries).toHaveLength(1);
    expect(callArg.entries[0].package).toBe('my-pkg@1.0.0');
  });

  it('passes cwd and config to actionList', async () => {
    await runList(CONFIG, [], '/my/cwd');
    const callArg = mockActionList.mock.calls[0][0];
    expect(callArg.cwd).toBe('/my/cwd');
    expect(callArg.config).toBe(CONFIG);
  });

  it('passes --output value to actionList', async () => {
    await runList(CONFIG, ['--output', './specific-dir'], '/cwd');
    const callArg = mockActionList.mock.calls[0][0];
    expect(callArg.output).toBe('./specific-dir');
  });

  it('passes verbose=true when --verbose flag given', async () => {
    await runList(CONFIG, ['--verbose'], '/cwd');
    expect(mockActionList.mock.calls[0][0].verbose).toBe(true);
  });
});

describe('runList — error handling', () => {
  it('sets exitCode=1 when actionList throws', async () => {
    mockActionList.mockRejectedValue(new Error('list failed'));
    await runList(CONFIG, [], '/cwd');
    expect(process.exitCode).toBe(1);
  });

  it('logs error message when actionList throws', async () => {
    mockActionList.mockRejectedValue(new Error('something went wrong'));
    const errors: string[] = [];
    const spy = jest.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.join(' '));
    });
    await runList(CONFIG, [], '/cwd');
    spy.mockRestore();
    expect(errors.some((e) => e.includes('something went wrong'))).toBe(true);
  });
});
