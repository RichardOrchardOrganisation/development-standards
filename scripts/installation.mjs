import { existsSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPOSITORY = 'https://github.com/RichardOrchardOrganisation/development-standards';
export const LOCK_PATH = 'development-standards.lock.json';
export const BEGIN = '<!-- development-standards:begin -->';
export const END = '<!-- development-standards:end -->';
const legacyInstallerHash = 'b9bbccb15c4ba9bfe66a83e8d0af498ce34f9e797544e553b2b8495f71927948';
const legacyFiles = [
  {
    "source": "LICENSE",
    "target": "docs/development-standards-LICENSE"
  },
  {
    "source": "development-standards.json",
    "target": "development-standards.json"
  },
  {
    "source": "coverlet.runsettings",
    "target": "coverlet.runsettings"
  },
  {
    "source": "config/suppression-baseline.json",
    "target": "config/suppression-baseline.json"
  },
  {
    "source": "config/typescript-coverage.json",
    "target": "config/typescript-coverage.json"
  },
  {
    "source": "config/feature-map.json",
    "target": "config/feature-map.json"
  },
  {
    "source": "scripts/Test-CoverageGate.ps1",
    "target": "scripts/Test-CoverageGate.ps1"
  },
  {
    "source": "scripts/Get-CrapReport.ps1",
    "target": "scripts/Get-CrapReport.ps1"
  },
  {
    "source": "scripts/Test-TypeScriptCoverageGate.mjs",
    "target": "scripts/Test-TypeScriptCoverageGate.mjs"
  },
  {
    "source": "scripts/check-suppressions.mjs",
    "target": "scripts/check-suppressions.mjs"
  },
  {
    "source": "scripts/check-feature-map.mjs",
    "target": "scripts/check-feature-map.mjs"
  },
  {
    "source": "scripts/check-pr-verification.mjs",
    "target": "scripts/check-pr-verification.mjs"
  },
  {
    "source": "scripts/verify.mjs",
    "target": "scripts/verify.mjs"
  },
  {
    "source": "docs/testing.md",
    "target": "docs/testing.md"
  },
  {
    "source": "docs/coverage.md",
    "target": "docs/coverage.md"
  },
  {
    "source": "docs/verification.md",
    "target": "docs/verification.md"
  },
  {
    "source": "docs/suppressions.md",
    "target": "docs/suppressions.md"
  },
  {
    "source": "docs/adoption.md",
    "target": "docs/adoption.md"
  },
  {
    "source": "docs/provenance.md",
    "target": "docs/provenance.md"
  },
  {
    "source": "templates/pull_request_template.md",
    "target": ".github/pull_request_template.md"
  },
  {
    "source": "examples/consumer-quality.yml",
    "target": "examples/development-standards-quality.yml"
  },
  {
    "source": "examples/consumer-pr-verification.yml",
    "target": "examples/development-standards-pr-verification.yml"
  }
];

export function validateRelativePath(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0') || /[<>:"|?*]/.test(value) || path.posix.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.split('/').some((part) => !part || part === '.' || part === '..') || value.split('/').some((part) => part.toLowerCase() === '.git')) {
    throw new Error(`Invalid repository-relative path: ${value}`);
  }
  return value;
}

export function targetRoot(target, source) {
  if (!existsSync(target) || !lstatSync(target).isDirectory()) throw new Error('Target must be an existing directory.');
  const root = realpathSync(target);
  if (root === realpathSync(source)) throw new Error('Use a consuming project, not the kit.');
  return root;
}

export function safeDestination(root, relative) {
  validateRelativePath(relative);
  const destination = path.join(root, relative);
  let current = root;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    // lstat also detects dangling symlinks, which existsSync would miss.
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`Symlink destination: ${relative}`);
    if (i < parts.length - 1 && !stat.isDirectory()) throw new Error(`Parent is not a directory: ${relative}`);
    if (i === parts.length - 1 && !stat.isFile()) throw new Error(`Destination is not a regular file: ${relative}`);
  }
  return destination;
}

export function normalize(text) {
  return text === null ? null : text.replaceAll('\r\n', '\n');
}

export function managedBlock(fragment) {
  if (typeof fragment !== 'string' || !fragment.trim() || fragment.includes(BEGIN) || fragment.includes(END)) throw new Error('Invalid AGENTS fragment.');
  return `${BEGIN}\n${fragment.trim()}\n${END}`;
}

export function splitGuide(text) {
  if (text === null || text.split(BEGIN).length !== 2 || text.split(END).length !== 2) throw new Error('AGENTS.md must contain exactly one managed standards section.');
  const start = text.indexOf(BEGIN);
  const stop = text.indexOf(END);
  if (stop < start) throw new Error('Malformed managed AGENTS section.');
  return { prefix: text.slice(0, start), block: text.slice(start, stop + END.length), suffix: text.slice(stop + END.length) };
}

export function installationFiles(read) {
  let document = read('installation-manifest.json');
  if (document === null) {
    const oldInstaller = read('scripts/install.mjs');
    if (oldInstaller === null || createHash('sha256').update(normalize(oldInstaller)).digest('hex') !== legacyInstallerHash) throw new Error('Unknown legacy installer. A versioned installation manifest is required.');
    document = JSON.stringify({ version: 1, files: legacyFiles });
  }
  const manifest = JSON.parse(document);
  if (manifest.version !== 1 || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('Unsupported installation manifest.');
  const targets = new Set(['agents.md', LOCK_PATH.toLowerCase()]);
  for (const item of manifest.files) {
    validateRelativePath(item.source);
    validateRelativePath(item.target);
    const target = item.target.toLowerCase();
    if (targets.has(target) || [...targets].some((known) => target.startsWith(`${known}/`) || known.startsWith(`${target}/`))) throw new Error(`Duplicate or overlapping manifest target: ${item.target}`);
    targets.add(target);
  }
  return manifest.files;
}

export function readInstallation(read) {
  const files = new Map();
  for (const item of installationFiles(read)) {
    const content = read(item.source);
    if (content === null) throw new Error(`Missing standards source: ${item.source}`);
    files.set(item.target, content);
  }
  const fragment = read('templates/AGENTS.fragment.md');
  if (fragment === null) throw new Error('Missing AGENTS fragment.');
  const packageJson = JSON.parse(read('package.json'));
  if (typeof packageJson.version !== 'string' || !packageJson.version) throw new Error('Missing kit package version.');
  return { files, block: managedBlock(fragment), version: packageJson.version };
}

export function lockDocument(commit, version, keptLocal = []) {
  return `${JSON.stringify({ repository: REPOSITORY, commit, version, ...(keptLocal.length ? { keptLocal } : {}) }, null, 2)}\n`;
}

export function isMain(moduleUrl, scriptPath = process.argv[1]) {
  if (!scriptPath) return false;
  return realpathSync(scriptPath) === realpathSync(fileURLToPath(moduleUrl));
}
