import fs from "node:fs";
import path from "node:path";

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

const [nextVersion, nextMinAppVersion] = process.argv.slice(2);

if (!nextVersion || !isSemver(nextVersion)) {
  printUsageAndExit("Invalid or missing version.");
}

if (nextMinAppVersion && !isSemver(nextMinAppVersion)) {
  printUsageAndExit("Invalid minAppVersion.");
}

const root = process.cwd();
const manifestPath = path.join(root, "manifest.json");
const packagePath = path.join(root, "package.json");
const versionsPath = path.join(root, "versions.json");

const manifest = readJson(manifestPath);
const pkg = readJson(packagePath);
const versions = fs.existsSync(versionsPath) ? readJson(versionsPath) : {};

manifest.version = nextVersion;
if (nextMinAppVersion) {
  manifest.minAppVersion = nextMinAppVersion;
}

pkg.version = nextVersion;
versions[nextVersion] = manifest.minAppVersion;

const sortedVersions = Object.fromEntries(
  Object.entries(versions).sort((a, b) => compareSemver(a[0], b[0])),
);

writeJson(manifestPath, manifest);
writeJson(packagePath, pkg);
writeJson(versionsPath, sortedVersions);

console.log(`Version updated to ${nextVersion}`);
console.log(`minAppVersion: ${manifest.minAppVersion}`);
console.log("Updated files: manifest.json, package.json, versions.json");

function printUsageAndExit(message) {
  console.error(message);
  console.error("Usage: npm run version:bump -- <x.y.z> [minAppVersion]");
  process.exit(1);
}

function isSemver(value) {
  return SEMVER_RE.test(value);
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function compareSemver(left, right) {
  const a = parseSemver(left);
  const b = parseSemver(right);

  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  return comparePreRelease(a.preRelease, b.preRelease);
}

function parseSemver(value) {
  const match = value.match(SEMVER_RE);
  if (!match) {
    throw new Error(`Invalid semver: ${value}`);
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    preRelease: match[4] ? match[4].split(".") : [],
  };
}

function comparePreRelease(left, right) {
  if (left.length === 0 && right.length === 0) return 0;
  if (left.length === 0) return 1;
  if (right.length === 0) return -1;

  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    const a = left[i];
    const b = right[i];
    if (a === undefined) return -1;
    if (b === undefined) return 1;

    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);

    if (aNum && bNum) {
      const diff = Number(a) - Number(b);
      if (diff !== 0) return diff;
      continue;
    }

    if (aNum) return -1;
    if (bNum) return 1;

    const textDiff = a.localeCompare(b);
    if (textDiff !== 0) return textDiff;
  }

  return 0;
}
