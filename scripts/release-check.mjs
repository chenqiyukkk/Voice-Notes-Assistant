import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifest = readJson(path.join(root, "manifest.json"));
const pkg = readJson(path.join(root, "package.json"));
const versions = readJson(path.join(root, "versions.json"));

const errors = [];

if (manifest.version !== pkg.version) {
  errors.push(
    `version mismatch: manifest.json (${manifest.version}) != package.json (${pkg.version})`,
  );
}

const mappedMinAppVersion = versions[manifest.version];
if (!mappedMinAppVersion) {
  errors.push(`versions.json missing key for ${manifest.version}`);
} else if (mappedMinAppVersion !== manifest.minAppVersion) {
  errors.push(
    `minAppVersion mismatch: versions.json (${mappedMinAppVersion}) != manifest.json (${manifest.minAppVersion})`,
  );
}

for (const requiredFile of ["main.js", "manifest.json"]) {
  if (!fs.existsSync(path.join(root, requiredFile))) {
    errors.push(`missing required release file: ${requiredFile}`);
  }
}

if (fs.existsSync(path.join(root, "styles.css")) === false) {
  errors.push("missing styles.css");
}

if (errors.length > 0) {
  console.error("Release check failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Release check passed.");
console.log(`- version: ${manifest.version}`);
console.log(`- minAppVersion: ${manifest.minAppVersion}`);
console.log("- release files: main.js, manifest.json, styles.css");

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}
