const fs = require('node:fs');
const path = require('node:path');

const exampleDir = process.cwd();
const outputDir = path.join(exampleDir, 'output');
const linkDir = path.join(outputDir, 'data-symlink');

function listFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return listFiles(entryPath);
    }
    if (entry.isFile()) {
      return [entryPath];
    }
    return [];
  });
}

const expectedFiles = [
  path.join(outputDir, 'docs', 'README.md'),
  path.join(outputDir, 'docs', 'adrs', 'adr-001-sample1.md'),
  path.join(outputDir, 'docs', 'adrs', 'adr-002-sample2.md'),
  path.join(outputDir, 'data', 'users-dataset', 'user1.json'),
  path.join(outputDir, 'data', 'users-dataset', 'user2.json'),
].sort();

const actualFiles = [
  ...listFiles(path.join(outputDir, 'docs')),
  ...listFiles(path.join(outputDir, 'data')),
].sort();

if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
  throw new Error(
    `Expected exported file set to be ${expectedFiles.join(', ')}, but got ${actualFiles.join(', ')}`,
  );
}

for (const filePath of expectedFiles) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Expected exported file to exist: ${filePath}`);
  }

  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Expected exported regular file at: ${filePath}`);
  }
}

const expectedLinks = [
  ['users-dataset', path.join(outputDir, 'data', 'users-dataset')],
  ['user1.json', path.join(outputDir, 'data', 'users-dataset', 'user1.json')],
  ['user2.json', path.join(outputDir, 'data', 'users-dataset', 'user2.json')],
].sort((left, right) => left[0].localeCompare(right[0]));

const actualLinks = fs.readdirSync(linkDir).sort();
const expectedLinkNames = expectedLinks.map(([linkName]) => linkName);

if (JSON.stringify(actualLinks) !== JSON.stringify(expectedLinkNames)) {
  throw new Error(
    `Expected symlink set to be ${expectedLinkNames.join(', ')}, but got ${actualLinks.join(', ')}`,
  );
}

for (const [linkName, expectedTarget] of expectedLinks) {
  const linkPath = path.join(linkDir, linkName);
  const stat = fs.lstatSync(linkPath);
  if (!stat.isSymbolicLink()) {
    throw new Error(`Expected symbolic link to exist: ${linkPath}`);
  }

  const actualTarget = path.resolve(linkDir, fs.readlinkSync(linkPath));
  if (actualTarget !== expectedTarget) {
    throw new Error(
      `Expected ${linkPath} to point to ${expectedTarget}, but got ${actualTarget}`,
    );
  }
}

console.log('CLI config symlink extraction check passed');