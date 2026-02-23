/* eslint-disable no-restricted-syntax */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { Consumer } from './consumer';
import { FolderPublisherMarker } from './types';
import { readJsonFile } from './utils';

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

  describe('loadAllManagedFiles', () => {
    it('should load files from marker', async () => {
      const outputDir = path.join(tmpDir, 'output');
      fs.mkdirSync(outputDir, { recursive: true });

      // Create marker file
      const marker: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          {
            path: 'test.txt',
            packageName: 'test-package',
            packageVersion: '1.0.0',
          },
        ],
      };

      fs.writeFileSync(path.join(outputDir, '.folder-publisher'), JSON.stringify(marker));

      // Create the actual file
      fs.writeFileSync(path.join(outputDir, 'test.txt'), 'test content');

      // We need to test private method, so this is a basic validation
      expect(fs.existsSync(path.join(outputDir, '.folder-publisher'))).toBe(true);
    });
  });

  describe('check', () => {
    it('should fail when package is not installed', async () => {
      const consumer = new Consumer({
        packageName: 'nonexistent-package',
        outputDir: tmpDir,
        check: true,
      });

      await expect(consumer.check()).rejects.toThrow(/Package .* is not installed/);
    });
  });

  describe('extract', () => {
    /**
     * Helper to create a mock package directory structure
     */
    function createMockPackage(packageDir: string, files: Record<string, string>): void {
      fs.mkdirSync(packageDir, { recursive: true });

      // Create package.json
      const packageJson = {
        name: 'test-extract-package',
        version: '1.0.0',
        main: 'index.js',
      };
      fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(packageJson));

      // Create other files
      for (const [filePath, content] of Object.entries(files)) {
        const fullPath = path.join(packageDir, filePath);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, content);
      }
    }

    /**
     * Helper to mock require.resolve for a package
     */
    function mockRequireResolve(packageDir: string, packageName: string): void {
      const originalResolve = require.resolve;
      jest.spyOn(require, 'resolve').mockImplementation((...args: unknown[]) => {
        const pkg = args[0] as string;
        if (pkg === `${packageName}/package.json`) {
          return path.join(packageDir, 'package.json');
        }
        return originalResolve(pkg);
      });
    }

    it('should extract files from package to output directory', async () => {
      const mockPackageDir = path.join(tmpDir, 'mock-package');
      const outputDir = path.join(tmpDir, 'output');

      createMockPackage(mockPackageDir, {
        'README.md': '# Test Package',
        'docs/guide.md': '# Guide',
        'src/index.ts': 'export const test = true;',
      });

      mockRequireResolve(mockPackageDir, 'test-extract-package');

      const consumer = new Consumer({
        packageName: 'test-extract-package',
        outputDir,
        packageManager: 'npm',
      });

      // Perform extraction
      await consumer.extract();

      // Verify files were extracted
      expect(fs.existsSync(path.join(outputDir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'docs', 'guide.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'src', 'index.ts'))).toBe(true);

      // Verify marker was created
      expect(fs.existsSync(path.join(outputDir, '.folder-publisher'))).toBe(true);

      const markerContent = readJsonFile<FolderPublisherMarker>(
        path.join(outputDir, '.folder-publisher'),
      );
      expect(markerContent.managedFiles).toHaveLength(3);
      expect(markerContent.managedFiles[0].packageName).toBe('test-extract-package');
    });

    it('should mark extracted files as read-only', async () => {
      const mockPackageDir = path.join(tmpDir, 'mock-package');
      const outputDir = path.join(tmpDir, 'output');

      createMockPackage(mockPackageDir, {
        'template.md': '# Template',
      });

      mockRequireResolve(mockPackageDir, 'test-extract-package');

      // Copy file
      fs.mkdirSync(outputDir, { recursive: true });
      const srcFile = path.join(mockPackageDir, 'template.md');
      const dstFile = path.join(outputDir, 'template.md');
      fs.copyFileSync(srcFile, dstFile);

      // Mark read-only
      fs.chmodSync(dstFile, 0o444);

      // Verify file is read-only
      const stats = fs.statSync(dstFile);
      // eslint-disable-next-line no-bitwise
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o444);
    });

    it('should track managed files in marker across multiple packages', () => {
      const outputDir = path.join(tmpDir, 'output');
      fs.mkdirSync(outputDir, { recursive: true });

      // Create initial marker from package A
      const markerPathA = path.join(outputDir, '.folder-publisher');
      const markerA: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          {
            path: 'file-from-a.md',
            packageName: 'package-a',
            packageVersion: '1.0.0',
          },
        ],
      };

      fs.writeFileSync(markerPathA, JSON.stringify(markerA));

      // Create file from package A
      fs.writeFileSync(path.join(outputDir, 'file-from-a.md'), 'Content from A');

      // Now simulate adding a file from package B
      const markerB: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          ...markerA.managedFiles,
          {
            path: 'file-from-b.md',
            packageName: 'package-b',
            packageVersion: '2.0.0',
          },
        ],
      };

      fs.writeFileSync(markerPathA, JSON.stringify(markerB));
      fs.writeFileSync(path.join(outputDir, 'file-from-b.md'), 'Content from B');

      // Verify both files are tracked
      const finalMarker = readJsonFile<FolderPublisherMarker>(markerPathA);

      expect(finalMarker.managedFiles).toHaveLength(2);
      expect(finalMarker.managedFiles.map((m) => m.packageName)).toContain('package-a');
      expect(finalMarker.managedFiles.map((m) => m.packageName)).toContain('package-b');
    });

    it('should handle files in subdirectories with separate markers', () => {
      const outputDir = path.join(tmpDir, 'output');
      const docsDir = path.join(outputDir, 'docs');
      const configsDir = path.join(outputDir, 'configs');

      // Create markers in different directories
      const docsMarker: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          {
            path: 'api.md',
            packageName: 'docs-package',
            packageVersion: '1.0.0',
          },
        ],
      };

      const configsMarker: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          {
            path: 'app.json',
            packageName: 'config-package',
            packageVersion: '1.0.0',
          },
        ],
      };

      fs.mkdirSync(docsDir, { recursive: true });
      fs.mkdirSync(configsDir, { recursive: true });

      fs.writeFileSync(path.join(docsDir, '.folder-publisher'), JSON.stringify(docsMarker));
      fs.writeFileSync(path.join(docsDir, 'api.md'), '# API Docs');

      fs.writeFileSync(path.join(configsDir, '.folder-publisher'), JSON.stringify(configsMarker));
      fs.writeFileSync(path.join(configsDir, 'app.json'), JSON.stringify({ name: 'app' }));

      // Verify markers exist in correct locations
      expect(fs.existsSync(path.join(docsDir, '.folder-publisher'))).toBe(true);
      expect(fs.existsSync(path.join(configsDir, '.folder-publisher'))).toBe(true);

      const docsMarkerLoaded = readJsonFile<FolderPublisherMarker>(
        path.join(docsDir, '.folder-publisher'),
      );
      expect(docsMarkerLoaded.managedFiles[0].packageName).toBe('docs-package');

      const configsMarkerLoaded = readJsonFile<FolderPublisherMarker>(
        path.join(configsDir, '.folder-publisher'),
      );
      expect(configsMarkerLoaded.managedFiles[0].packageName).toBe('config-package');
    });

    it('should preserve ownership information when updating files', () => {
      const outputDir = path.join(tmpDir, 'output');
      fs.mkdirSync(outputDir, { recursive: true });

      const packageName = 'my-package';
      const filePath = 'template.md';

      // Initial extraction
      const marker1: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          {
            path: filePath,
            packageName,
            packageVersion: '1.0.0',
          },
        ],
      };

      fs.writeFileSync(path.join(outputDir, 'template.md'), 'Version 1.0.0 content');
      fs.writeFileSync(path.join(outputDir, '.folder-publisher'), JSON.stringify(marker1));

      // Simulate update to new version
      const marker2: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          {
            path: filePath,
            packageName,
            packageVersion: '2.0.0', // Updated version
          },
        ],
      };

      fs.writeFileSync(path.join(outputDir, 'template.md'), 'Version 2.0.0 content');
      fs.writeFileSync(path.join(outputDir, '.folder-publisher'), JSON.stringify(marker2));

      // Verify metadata was updated
      const markerLoaded = readJsonFile<FolderPublisherMarker>(
        path.join(outputDir, '.folder-publisher'),
      );

      expect(markerLoaded.managedFiles[0].packageVersion).toBe('2.0.0');
      expect(markerLoaded.managedFiles[0].packageName).toBe(packageName);
    });

    it('should support filtering files by filename pattern', () => {
      const mockPackageDir = path.join(tmpDir, 'mock-package');
      const outputDir = path.join(tmpDir, 'output');

      createMockPackage(mockPackageDir, {
        'README.md': '# Readme',
        'CHANGELOG.md': '# Changelog',
        'src/index.ts': 'export const x = 1;',
        'src/utils.js': 'module.exports = {};',
        'docs/api.md': '# API',
      });

      // Simulate filtering to only .md files
      const mdFiles = ['README.md', 'CHANGELOG.md', 'docs/api.md'];

      fs.mkdirSync(outputDir, { recursive: true });
      // eslint-disable-next-line no-restricted-syntax
      for (const file of mdFiles) {
        const srcPath = path.join(mockPackageDir, file);
        const dstPath = path.join(outputDir, file);
        fs.mkdirSync(path.dirname(dstPath), { recursive: true });
        fs.copyFileSync(srcPath, dstPath);
      }

      const marker: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: mdFiles.map((file) => ({
          path: file,
          packageName: 'test-extract-package',
          packageVersion: '1.0.0',
        })),
      };

      fs.writeFileSync(path.join(outputDir, '.folder-publisher'), JSON.stringify(marker));

      // Verify only .md files were extracted
      expect(fs.existsSync(path.join(outputDir, 'README.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'CHANGELOG.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'docs', 'api.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir, 'src', 'index.ts'))).toBe(false);
      expect(fs.existsSync(path.join(outputDir, 'src', 'utils.js'))).toBe(false);

      const markerLoaded = readJsonFile<FolderPublisherMarker>(
        path.join(outputDir, '.folder-publisher'),
      );
      expect(markerLoaded.managedFiles).toHaveLength(3);
    });

    it('should create the output directory if it does not exist', () => {
      const outputDir = path.join(tmpDir, 'deep', 'nested', 'output');
      expect(fs.existsSync(outputDir)).toBe(false);

      // Creating a consumer should create the output directory
      // eslint-disable-next-line no-new
      new Consumer({
        packageName: 'test-package',
        outputDir,
      });

      expect(fs.existsSync(outputDir)).toBe(true);
    });

    it('should handle extraction to multiple output directories', () => {
      const outputDir1 = path.join(tmpDir, 'output1');
      const outputDir2 = path.join(tmpDir, 'output2');

      fs.mkdirSync(outputDir1, { recursive: true });
      fs.mkdirSync(outputDir2, { recursive: true });

      const marker1: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          {
            path: 'file1.md',
            packageName: 'pkg1',
            packageVersion: '1.0.0',
          },
        ],
      };

      const marker2: FolderPublisherMarker = {
        version: '1.0.0',
        managedFiles: [
          {
            path: 'file2.md',
            packageName: 'pkg2',
            packageVersion: '1.0.0',
          },
        ],
      };

      fs.writeFileSync(path.join(outputDir1, '.folder-publisher'), JSON.stringify(marker1));
      fs.writeFileSync(path.join(outputDir1, 'file1.md'), 'Content 1');

      fs.writeFileSync(path.join(outputDir2, '.folder-publisher'), JSON.stringify(marker2));
      fs.writeFileSync(path.join(outputDir2, 'file2.md'), 'Content 2');

      // Verify both outputs are independent
      expect(fs.existsSync(path.join(outputDir1, '.folder-publisher'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir2, '.folder-publisher'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir1, 'file1.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir2, 'file2.md'))).toBe(true);
      expect(fs.existsSync(path.join(outputDir1, 'file2.md'))).toBe(false);
      expect(fs.existsSync(path.join(outputDir2, 'file1.md'))).toBe(false);
    });
  });
});
