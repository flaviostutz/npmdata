import { loadAllManagedFiles } from './markers';

/**
 * List all managed files currently extracted in outputDir, grouped by package.
 */
export function list(outputDir: string): Array<{
  packageName: string;
  packageVersion: string;
  files: string[];
}> {
  const allManaged = loadAllManagedFiles(outputDir);

  const grouped = new Map<
    string,
    { packageName: string; packageVersion: string; files: string[] }
  >();

  for (const managed of allManaged) {
    const key = `${managed.packageName}@${managed.packageVersion}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        packageName: managed.packageName,
        packageVersion: managed.packageVersion,
        files: [],
      });
    }
    grouped.get(key)!.files.push(managed.path);
  }

  return [...grouped.values()].map((entry) => ({
    ...entry,
    files: entry.files.sort(),
  }));
}
