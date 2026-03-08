/* eslint-disable no-restricted-syntax */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { compressGitignoreEntries } from './gitignore';
import { extract } from './extract';
import { purge } from './purge';
import { installMockPackage } from './test-utils';

describe('compressGitignoreEntries', () => {
  // eslint-disable-next-line functional/no-let
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compress-gitignore-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should return root-level files unchanged', () => {
    fs.writeFileSync(path.join(tmpDir, 'README.md'), '# readme');
    fs.writeFileSync(path.join(tmpDir, 'data.json'), '{}');
    const result = compressGitignoreEntries(['README.md', 'data.json'], tmpDir);
    expect(result).toContain('README.md');
    expect(result).toContain('data.json');
  });

  it('should collapse a fully-managed directory to dir/', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    fs.writeFileSync(path.join(tmpDir, 'docs', 'guide.md'), '# guide');
    fs.writeFileSync(path.join(tmpDir, 'docs', 'api.md'), '# api');
    const result = compressGitignoreEntries(['docs/guide.md', 'docs/api.md'], tmpDir);
    expect(result).toContain('docs/');
    expect(result).not.toContain('docs/guide.md');
    expect(result).not.toContain('docs/api.md');
  });

  it('should not collapse a directory that has unmanaged files on disk', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    fs.writeFileSync(path.join(tmpDir, 'docs', 'guide.md'), '# guide');
    fs.writeFileSync(path.join(tmpDir, 'docs', 'api.md'), '# api');
    fs.writeFileSync(path.join(tmpDir, 'docs', 'manual.md'), '# unmanaged');
    const result = compressGitignoreEntries(['docs/guide.md', 'docs/api.md'], tmpDir);
    expect(result).not.toContain('docs/');
    expect(result).toContain('docs/guide.md');
    expect(result).toContain('docs/api.md');
  });

  it('should collapse only the fully-managed subdirectory, not the parent', () => {
    fs.mkdirSync(path.join(tmpDir, 'src', 'utils'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'src', 'main.ts'), '');
    fs.writeFileSync(path.join(tmpDir, 'src', 'extra.ts'), ''); // unmanaged
    fs.writeFileSync(path.join(tmpDir, 'src', 'utils', 'helper.ts'), '');
    const result = compressGitignoreEntries(['src/main.ts', 'src/utils/helper.ts'], tmpDir);
    expect(result).not.toContain('src/');
    expect(result).toContain('src/main.ts');
    expect(result).toContain('src/utils/');
    expect(result).not.toContain('src/utils/helper.ts');
  });

  it('should ignore MARKER_FILE and GITIGNORE_FILE when assessing full coverage', () => {
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    fs.writeFileSync(path.join(tmpDir, 'docs', 'guide.md'), '# guide');
    fs.writeFileSync(path.join(tmpDir, 'docs', '.npmdata'), 'guide.md|pkg|1.0.0|0');
    fs.writeFileSync(
      path.join(tmpDir, 'docs', '.gitignore'),
      '# npmdata:start\n.npmdata\nguide.md\n# npmdata:end\n',
    );
    const result = compressGitignoreEntries(['docs/guide.md'], tmpDir);
    expect(result).toContain('docs/');
    expect(result).not.toContain('docs/guide.md');
  });

  it('should return an empty array for empty input', () => {
    const result = compressGitignoreEntries([], tmpDir);
    expect(result).toHaveLength(0);
  });

  it('should collapse nested directories when all their contents are managed', () => {
    fs.mkdirSync(path.join(tmpDir, 'a', 'b', 'c'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, 'a', 'b', 'c', 'file.md'), '');
    const result = compressGitignoreEntries(['a/b/c/file.md'], tmpDir);
    expect(result).toContain('a/');
    expect(result).not.toContain('a/b/');
    expect(result).not.toContain('a/b/c/');
  });

  it('should treat gitignored directories with no managed files as non-existent when assessing full coverage', () => {
    // docs/ has one managed file; node_modules/ is gitignored and unmanaged.
    // compressGitignoreEntries should skip node_modules and still report docs/ as fully managed.
    fs.mkdirSync(path.join(tmpDir, 'docs'));
    fs.writeFileSync(path.join(tmpDir, 'docs', 'guide.md'), '# guide');
    fs.mkdirSync(path.join(tmpDir, 'node_modules', 'some-pkg'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'node_modules', 'some-pkg', 'index.js'),
      'module.exports={}',
    );

    // Gitignore at tmpDir has external pattern for node_modules
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'node_modules\n');

    const result = compressGitignoreEntries(['docs/guide.md'], tmpDir);
    // docs/ is fully managed (node_modules is ignored), so it should be collapsed
    expect(result).toContain('docs/');
    expect(result).not.toContain('docs/guide.md');
    // node_modules should never appear in the output
    expect(result.some((e) => e.startsWith('node_modules'))).toBe(false);
  });

  it('should not skip a gitignored directory that has managed files under it', () => {
    // Managed file lives inside a gitignored directory — it must still appear in the output.
    fs.mkdirSync(path.join(tmpDir, 'dist'));
    fs.writeFileSync(path.join(tmpDir, 'dist', 'bundle.md'), '# bundle');
    fs.writeFileSync(path.join(tmpDir, '.gitignore'), 'dist/\n');

    const result = compressGitignoreEntries(['dist/bundle.md'], tmpDir);
    expect(result.some((e) => e.includes('dist'))).toBe(true);
  });
});

describe('gitignore-aware traversal', () => {
  // eslint-disable-next-line functional/no-let
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitignore-traversal-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('should not traverse gitignored directories during extract gitignore cleanup', async () => {
    const outputDir = tmpDir; // outputDir is the project root that also has node_modules

    // Pre-create a .gitignore that marks node_modules as gitignored (external pattern).
    fs.writeFileSync(path.join(outputDir, '.gitignore'), 'node_modules\n');

    // Set up a package to extract
    await installMockPackage(
      'test-gitignore-traversal-pkg',
      { 'docs/guide.md': '# Guide' },
      tmpDir,
    );

    await extract({
      packages: ['test-gitignore-traversal-pkg'],
      outputDir,
      packageManager: 'pnpm',
      cwd: tmpDir,
      gitignore: true,
      filenamePatterns: ['**/*.md'],
    });

    // Inject an orphaned npmdata .gitignore section inside node_modules.
    // If the traversal incorrectly enters node_modules, it will clean this section up.
    // If the traversal correctly skips node_modules, this section will remain intact.
    const nodeModulesDir = path.join(outputDir, 'node_modules');
    const injectedGitignorePath = path.join(nodeModulesDir, '.gitignore');
    fs.writeFileSync(injectedGitignorePath, '# npmdata:start\n.npmdata\n# npmdata:end\n');

    // Second extract triggers updateGitignores — node_modules must not be entered.
    await extract({
      packages: ['test-gitignore-traversal-pkg'],
      outputDir,
      packageManager: 'pnpm',
      cwd: tmpDir,
      gitignore: true,
      filenamePatterns: ['**/*.md'],
    });

    // The injected npmdata section in node_modules/.gitignore must still be there,
    // proving we never entered node_modules to clean it up.
    const content = fs.readFileSync(injectedGitignorePath, 'utf8');
    expect(content).toContain('# npmdata:start');
  });

  it('should not traverse gitignored directories when cleaning up empty dirs after purge', async () => {
    const outputDir = tmpDir;

    // Mark node_modules as gitignored in the external .gitignore section.
    fs.writeFileSync(path.join(outputDir, '.gitignore'), 'node_modules\n');

    await installMockPackage('test-purge-gitignore-skip', { 'docs/note.md': '# Note' }, tmpDir);

    await extract({
      packages: ['test-purge-gitignore-skip'],
      outputDir,
      packageManager: 'pnpm',
      cwd: tmpDir,
      gitignore: true,
      filenamePatterns: ['**/*.md'],
    });

    // node_modules is gitignored and unmanaged.  Purge must complete without error
    // (i.e. it must not traverse into node_modules and fail on read-only files).
    await expect(
      purge({ packages: ['test-purge-gitignore-skip'], outputDir }),
    ).resolves.not.toThrow();

    // node_modules directory must still be intact
    expect(fs.existsSync(path.join(outputDir, 'node_modules'))).toBe(true);
  });
});
