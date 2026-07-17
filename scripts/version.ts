// Bump the synced version across the root manifest and every workspace package, then print the
// git commands to cut the release. The package set is discovered from disk (not hardcoded) so it
// can never drift from the workspace, and writes are computed up front then flushed together so a
// missing/malformed manifest aborts before any file is mutated. Workspace links are path-based, so
// the lockfile does not change. Run via jiti (already a dev dependency):
//   jiti scripts/version.ts <patch|minor|major|x.y.z>
import { globSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Root first: it is the version source (read below) and the version the release tag is cut from.
// Then every workspace package manifest discovered under packages/* (sorted for stable output).
const rootManifest = join(root, "package.json");
const packageManifests = globSync("packages/*/package.json", { cwd: root })
  .map(rel => join(root, rel))
  .toSorted();
const manifests = [rootManifest, ...packageManifests];

const bump = process.argv[2];

if (!bump) {
  throw new Error("Usage: jiti scripts/version.ts <patch|minor|major|x.y.z>");
}

const current = JSON.parse(readFileSync(rootManifest, "utf-8")).version as string;
const next = nextVersion(current, bump);

// Guard before any write: bumping from a prerelease (0.2.0-rc.1 + `patch` -> "0.2.NaN") or any
// other malformed input must abort with the tree untouched.
if (!/^\d+\.\d+\.\d+$/.test(next)) {
  throw new Error(`Refusing to write invalid version "${next}" (current "${current}") — pass an explicit x.y.z instead.`);
}

// Compute every rewrite first; only flush once all reads/replacements succeed, so a bad manifest
// can never leave a half-bumped tree. Replace only the first (top-level) "version" field.
const writes = manifests.map(path => {
  return {
    path,
    // Replacer as a function: a plain-string replacement would interpret `$`-sequences in it.
    contents: readFileSync(path, "utf-8").replace(/"version":\s*"[^"]+"/, () => `"version": "${next}"`)
  };
});

for (const { path, contents } of writes) {
  writeFileSync(path, contents);
}

console.log(`Bumped ${current} -> ${next} across ${manifests.length} manifests.`);
console.log("Next:");
// Stage the touched manifests by name — `commit -am` would sweep any unrelated tracked change
// sitting in the working tree into the release commit.
console.log("  git add package.json packages/*/package.json");
console.log(`  git commit -m "chore(release): v${next}"`);
// Annotated tag (-a): `git push --follow-tags` pushes annotated tags but not lightweight ones.
console.log(`  git tag -a v${next} -m "v${next}"`);
console.log("  git push --follow-tags");

function nextVersion(version: string, kind: string): string {
  if (/^\d+\.\d+\.\d+$/.test(kind)) {
    return kind;
  }

  const [major, minor, patch] = version.split(".");

  switch (kind) {
    case "major": {
      return `${Number(major) + 1}.0.0`;
    }

    case "minor": {
      return `${major}.${Number(minor) + 1}.0`;
    }

    case "patch": {
      return `${major}.${minor}.${Number(patch) + 1}`;
    }

    default: {
      throw new Error(`Unknown bump "${kind}" (use patch | minor | major | x.y.z)`);
    }
  }
}
