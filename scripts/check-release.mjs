#!/usr/bin/env node
// Release gate: checks that a release tag, every version in the repo and CHANGELOG.md agree.
//
//   node scripts/check-release.mjs v0.1.0                         # check only
//   node scripts/check-release.mjs v0.1.0 --notes-out notes.md    # also write the release notes
//
// The tag defaults to $GITHUB_REF_NAME; `--root` checks another checkout (default: this one).
// Exit code 0 when everything agrees, 1 otherwise (one line per problem), 2 on bad usage.
// Under GitHub Actions it also writes `version` and `prerelease` to $GITHUB_OUTPUT.
// The release workflow runs this before any build job starts.
// Self-test: node --test scripts/check-release.test.mjs

import { appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

// SemVer 2.0 version (no leading zeros), optionally with pre-release and build metadata.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

/** `v1.2.3` → `1.2.3`; throws on anything that isn't `v` + a SemVer version. */
export function versionFromTag(tag) {
  if (typeof tag !== 'string' || !tag.startsWith('v') || !SEMVER.test(tag.slice(1))) {
    throw new Error(`tag "${tag}" is not "v" followed by a SemVer version (e.g. v0.1.0)`);
  }
  return tag.slice(1);
}

/** True for a pre-release version such as `0.2.0-beta.1`. */
export function isPrerelease(version) {
  return SEMVER.exec(version)?.[4] !== undefined;
}

/** Splits TOML text at `[table]` / `[[array]]` headers into `[{ header, body }]`. */
function tomlSections(text) {
  const sections = [];
  let current = { header: '', lines: [] };
  sections.push(current);
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    const header = /^\[\[?\s*([^\]]+?)\s*\]\]?$/.exec(line);
    if (header) {
      current = { header: header[1], lines: [] };
      sections.push(current);
    } else {
      current.lines.push(line);
    }
  }
  return sections.map((s) => ({ header: s.header, body: s.lines.join('\n') }));
}

function section(sections, header) {
  return sections.find((s) => s.header === header)?.body;
}

/** The `version` of a TOML table body: `{ version }`, `{ inherited: true }` or `{}`. */
function tomlVersion(body) {
  if (/^version\s*\.\s*workspace\s*=\s*true$/m.test(body)) return { inherited: true };
  if (/^version\s*=\s*\{\s*workspace\s*=\s*true\s*\}$/m.test(body)) return { inherited: true };
  const m = /^version\s*=\s*"([^"]*)"$/m.exec(body);
  return m ? { version: m[1] } : {};
}

function tomlString(body, key) {
  return new RegExp(`^${key}\\s*=\\s*"([^"]*)"$`, 'm').exec(body)?.[1];
}

/** Workspace member directories from the root Cargo.toml (supports a trailing `/*` glob). */
function workspaceMembers(root, workspaceBody) {
  const list = /^members\s*=\s*\[([^\]]*)\]/m.exec(workspaceBody)?.[1] ?? '';
  const members = [];
  for (const [, member] of list.matchAll(/"([^"]+)"/g)) {
    if (member.endsWith('/*')) {
      const parent = join(root, member.slice(0, -2));
      for (const entry of readdirSync(parent).sort()) {
        if (existsSync(join(parent, entry, 'Cargo.toml'))) members.push(join(parent, entry));
      }
    } else {
      members.push(join(root, member));
    }
  }
  return members;
}

/**
 * Every place in the repository that declares the app's version, as
 * `{ source, version }`. Sources that inherit a version are listed with the version they get.
 * Problems that make a source unreadable are returned in `errors`.
 */
export function collectVersions(root) {
  const found = [];
  const errors = [];
  const rel = (p) => relative(root, p).split('\\').join('/');
  const read = (p) => readFileSync(p, 'utf8');

  // Root Cargo.toml: [workspace.package] version, inherited by the members.
  const rootToml = tomlSections(read(join(root, 'Cargo.toml')));
  const workspaceBody = section(rootToml, 'workspace') ?? '';
  const workspaceVersion = tomlVersion(section(rootToml, 'workspace.package') ?? '').version;
  if (workspaceVersion !== undefined) {
    found.push({ source: 'Cargo.toml [workspace.package]', version: workspaceVersion });
  }

  // Each workspace member's [package] version, and its entry in Cargo.lock.
  const lockPath = join(root, 'Cargo.lock');
  const lock = existsSync(lockPath) ? tomlSections(read(lockPath)) : [];
  let tauriCrateVersion;
  for (const dir of workspaceMembers(root, workspaceBody)) {
    const manifest = join(dir, 'Cargo.toml');
    const pkg = section(tomlSections(read(manifest)), 'package');
    if (pkg === undefined) continue; // a virtual manifest has no version
    const name = tomlString(pkg, 'name');
    const v = tomlVersion(pkg);
    let version = v.version;
    if (v.inherited) {
      if (workspaceVersion === undefined) {
        errors.push(`${rel(manifest)}: inherits the workspace version, but Cargo.toml has none`);
        continue;
      }
      version = workspaceVersion;
    } else if (version === undefined) {
      errors.push(`${rel(manifest)}: no [package] version`);
      continue;
    } else {
      found.push({ source: `${rel(manifest)} [package]`, version });
    }
    if (existsSync(join(dir, 'tauri.conf.json'))) tauriCrateVersion = version;

    if (lock.length > 0 && name !== undefined) {
      const entries = lock.filter(
        (s) =>
          s.header === 'package' &&
          tomlString(s.body, 'name') === name &&
          tomlString(s.body, 'source') === undefined,
      );
      if (entries.length === 0) {
        errors.push(`Cargo.lock: no entry for workspace crate "${name}"`);
      } else {
        for (const e of entries) {
          found.push({ source: `Cargo.lock (${name})`, version: tomlString(e.body, 'version') });
        }
      }
    }
  }

  // app/package.json
  const packageJson = join(root, 'app', 'package.json');
  const appVersion = JSON.parse(read(packageJson)).version;
  if (typeof appVersion === 'string') {
    found.push({ source: 'app/package.json', version: appVersion });
  } else {
    errors.push('app/package.json: no "version"');
  }

  // app/src-tauri/tauri.conf.json: a version string, a path to a package.json, or absent
  // (then Tauri uses the version of the crate next to it).
  const tauriConf = join(root, 'app', 'src-tauri', 'tauri.conf.json');
  if (existsSync(tauriConf)) {
    const conf = JSON.parse(read(tauriConf));
    if (typeof conf.version === 'string' && conf.version.endsWith('.json')) {
      const target = resolve(dirname(tauriConf), conf.version);
      found.push({
        source: `app/src-tauri/tauri.conf.json (via ${rel(target)})`,
        version: JSON.parse(read(target)).version,
      });
    } else if (typeof conf.version === 'string') {
      found.push({ source: 'app/src-tauri/tauri.conf.json', version: conf.version });
    } else if (tauriCrateVersion !== undefined) {
      found.push({
        source: 'app/src-tauri/tauri.conf.json (from its Cargo.toml)',
        version: tauriCrateVersion,
      });
    } else {
      errors.push('app/src-tauri/tauri.conf.json: no "version" and no crate to inherit one from');
    }
  }

  return { found, errors };
}

/**
 * The body of the `## [<version>]` section of a Keep a Changelog file (heading forms
 * `## [1.2.3] - 2026-01-31`, `## [v1.2.3]`, `## 1.2.3`), up to the next `## ` heading,
 * or `undefined` when there is no such section.
 */
export function changelogSection(text, version) {
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const heading = new RegExp(`^##\\s+\\[?v?${escaped}\\]?(?:\\s|$)`);
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return undefined;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l) || /^\[[^\]]+\]:\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
}

/**
 * Checks a release tag against the repository at `root`. Returns
 * `{ version, prerelease, notes, errors }`; the release may go ahead when `errors` is empty.
 */
export function checkRelease(root, tag) {
  let version;
  try {
    version = versionFromTag(tag);
  } catch (e) {
    return { errors: [e.message] };
  }
  const { found, errors } = collectVersions(root);
  if (found.length === 0) errors.push('no version found in the repository');
  for (const { source, version: v } of found) {
    if (v !== version) errors.push(`${source}: version is "${v}", tag ${tag} needs "${version}"`);
  }

  let notes;
  const changelog = join(root, 'CHANGELOG.md');
  if (!existsSync(changelog)) {
    errors.push('CHANGELOG.md: missing');
  } else {
    notes = changelogSection(readFileSync(changelog, 'utf8'), version);
    if (notes === undefined) errors.push(`CHANGELOG.md: no "## [${version}]" section`);
    else if (notes === '') errors.push(`CHANGELOG.md: the "## [${version}]" section is empty`);
  }
  return { version, prerelease: isPrerelease(version), notes, errors };
}

const USAGE = 'usage: node scripts/check-release.mjs [<tag>] [--notes-out <file>] [--root <dir>]';

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: { 'notes-out': { type: 'string' }, root: { type: 'string' } },
    });
  } catch (e) {
    console.error(`${e.message}\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = parsed;
  const tag = positionals[0] ?? process.env.GITHUB_REF_NAME;
  if (!tag || positionals.length > 1) {
    console.error(USAGE);
    return 2;
  }
  const root = resolve(values.root ?? join(dirname(fileURLToPath(import.meta.url)), '..'));
  const result = checkRelease(root, tag);
  if (result.errors.length > 0) {
    console.error(`Release check failed for ${tag}:`);
    for (const e of result.errors) console.error(`  - ${e}`);
    return 1;
  }
  if (values['notes-out']) writeFileSync(values['notes-out'], `${result.notes}\n`);
  // In GitHub Actions, hand the results to later steps.
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${result.version}\nprerelease=${result.prerelease}\n`,
    );
  }
  const kind = result.prerelease ? ', pre-release' : '';
  console.log(`Release check passed: ${tag} (version ${result.version}${kind})`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exitCode = main(process.argv.slice(2));
