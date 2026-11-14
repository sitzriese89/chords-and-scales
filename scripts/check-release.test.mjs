// Self-test for check-release.mjs: node --test scripts/check-release.test.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  changelogSection,
  checkRelease,
  collectVersions,
  isPrerelease,
  versionFromTag,
} from './check-release.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(repoRoot, 'scripts', 'check-release.mjs');
const temp = mkdtempSync(join(tmpdir(), 'check-release-'));
after(() => rmSync(temp, { recursive: true, force: true }));

const CHANGELOG = `# Changelog

## [Unreleased]

- Work in progress.

## [1.2.3] - 2026-01-31

### Added

- Everything.

## [1.2.2] - 2026-01-01

- Older.

[1.2.3]: https://example.com/v1.2.3
`;

/** A minimal copy of this repository's layout where every version is `version`. */
function fixture(name, version = '1.2.3', overrides = {}) {
  const root = join(temp, name);
  const files = {
    'Cargo.toml': `[workspace]\nresolver = "3"\nmembers = ["crates/*", "app/src-tauri"]\n\n[workspace.package]\nversion = "${version}" # the app version\nedition = "2024"\n`,
    'crates/theory/Cargo.toml': `[package]\nname = "theory"\nversion.workspace = true\n\n[dependencies]\nserde = { version = "1" }\n`,
    'crates/theory-wasm/Cargo.toml': `[package]\nname = "theory-wasm"\nversion = { workspace = true }\n`,
    'app/src-tauri/Cargo.toml': `[package]\nname = "chords-and-scales"\nversion.workspace = true\n\n[build-dependencies]\ntauri-build = { version = "2" }\n`,
    'app/src-tauri/tauri.conf.json': JSON.stringify({ productName: 'Chords & Scales' }),
    'app/package.json': JSON.stringify({ name: 'chords-and-scales', version }),
    'Cargo.lock': [
      'version = 4',
      ...['chords-and-scales', 'theory', 'theory-wasm'].map(
        (n) => `[[package]]\nname = "${n}"\nversion = "${version}"\n`,
      ),
      '[[package]]\nname = "serde"\nversion = "1.0.0"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\n',
    ].join('\n\n'),
    'CHANGELOG.md': CHANGELOG,
    ...overrides,
  };
  for (const [path, content] of Object.entries(files)) {
    if (content === null) continue;
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

describe('versionFromTag', () => {
  test('strips the v', () => {
    assert.equal(versionFromTag('v0.1.0'), '0.1.0');
    assert.equal(versionFromTag('v0.0.0-test.1'), '0.0.0-test.1');
    assert.equal(versionFromTag('v1.0.0-rc.1+build.5'), '1.0.0-rc.1+build.5');
  });
  test('rejects tags that are not v + SemVer', () => {
    for (const tag of ['0.1.0', 'v0.1', 'v01.0.0', 'v0.1.0-', 'release-0.1.0', 'V0.1.0', '']) {
      assert.throws(() => versionFromTag(tag), /not "v" followed by a SemVer version/, tag);
    }
  });
  test('pre-release detection', () => {
    assert.equal(isPrerelease('0.0.0-test.1'), true);
    assert.equal(isPrerelease('1.0.0'), false);
    assert.equal(isPrerelease('1.0.0+build.1'), false);
  });
});

describe('changelogSection', () => {
  test('returns the body of the version section, up to the next one', () => {
    assert.equal(changelogSection(CHANGELOG, '1.2.3'), '### Added\n\n- Everything.');
    assert.equal(changelogSection(CHANGELOG, '1.2.2'), '- Older.');
  });
  test('does not match a version that only shares a prefix', () => {
    assert.equal(changelogSection('## [1.2.30]\n\n- x\n', '1.2.3'), undefined);
    assert.equal(changelogSection('## [1.2.3-rc.1]\n\n- x\n', '1.2.3'), undefined);
  });
  test('accepts headings without brackets or with a v', () => {
    assert.equal(changelogSection('## 1.2.3\n- a\n', '1.2.3'), '- a');
    assert.equal(changelogSection('## [v1.2.3] - today\n- b\n', '1.2.3'), '- b');
  });
});

describe('checkRelease', () => {
  test('passes when the tag, every version and the changelog agree', () => {
    const result = checkRelease(fixture('ok'), 'v1.2.3');
    assert.deepEqual(result.errors, []);
    assert.equal(result.version, '1.2.3');
    assert.equal(result.prerelease, false);
    assert.equal(result.notes, '### Added\n\n- Everything.');
  });

  test('lists every version source it checked', () => {
    const { found, errors } = collectVersions(fixture('sources'));
    assert.deepEqual(errors, []);
    assert.deepEqual(
      found.map((f) => f.source),
      [
        'Cargo.toml [workspace.package]',
        'Cargo.lock (theory)',
        'Cargo.lock (theory-wasm)',
        'Cargo.lock (chords-and-scales)',
        'app/package.json',
        'app/src-tauri/tauri.conf.json (from its Cargo.toml)',
      ],
    );
  });

  test('fails when the tag does not match the repository', () => {
    const { errors } = checkRelease(fixture('tag-mismatch'), 'v1.2.4');
    assert.ok(errors.some((e) => e.startsWith('Cargo.toml [workspace.package]: version is "1.2.3"')));
    assert.ok(errors.some((e) => e.startsWith('app/package.json')));
    assert.ok(errors.some((e) => e.includes('no "## [1.2.4]" section')));
  });

  const mismatches = {
    'app/package.json': {
      'app/package.json': JSON.stringify({ version: '1.2.2' }),
    },
    'workspace Cargo.toml': {
      'Cargo.toml': `[workspace]\nmembers = ["crates/*", "app/src-tauri"]\n\n[workspace.package]\nversion = "1.2.2"\n`,
    },
    'tauri.conf.json version': {
      'app/src-tauri/tauri.conf.json': JSON.stringify({ version: '1.2.2' }),
    },
    'tauri.conf.json pointing at a package.json': {
      'app/src-tauri/tauri.conf.json': JSON.stringify({ version: '../other.json' }),
      'app/other.json': JSON.stringify({ version: '1.2.2' }),
    },
    'crate version': {
      'app/src-tauri/Cargo.toml': `[package]\nname = "chords-and-scales"\nversion = "1.2.2"\n`,
    },
    'Cargo.lock': {
      'Cargo.lock': '[[package]]\nname = "theory"\nversion = "1.2.2"\n',
    },
  };
  for (const [what, overrides] of Object.entries(mismatches)) {
    test(`fails on a mismatched ${what}`, () => {
      const name = `mismatch-${what.replace(/\W+/g, '-')}`;
      const { errors } = checkRelease(fixture(name, '1.2.3', overrides), 'v1.2.3');
      assert.ok(errors.length > 0, 'expected an error');
      assert.ok(
        errors.some((e) => /"1\.2\.2"|no entry/.test(e)),
        errors.join('\n'),
      );
    });
  }

  test('accepts a tauri.conf.json version that matches, directly or via package.json', () => {
    const direct = fixture('tauri-direct', '1.2.3', {
      'app/src-tauri/tauri.conf.json': JSON.stringify({ version: '1.2.3' }),
    });
    assert.deepEqual(checkRelease(direct, 'v1.2.3').errors, []);
    const viaPackage = fixture('tauri-via-package', '1.2.3', {
      'app/src-tauri/tauri.conf.json': JSON.stringify({ version: '../package.json' }),
    });
    assert.deepEqual(checkRelease(viaPackage, 'v1.2.3').errors, []);
  });

  test('fails without a changelog section, or with an empty one', () => {
    const missing = fixture('no-changelog', '1.2.3', { 'CHANGELOG.md': null });
    assert.deepEqual(checkRelease(missing, 'v1.2.3').errors, ['CHANGELOG.md: missing']);
    const empty = fixture('empty-section', '1.2.3', {
      'CHANGELOG.md': '# Changelog\n\n## [1.2.3]\n\n## [1.2.2]\n\n- Older.\n',
    });
    assert.deepEqual(checkRelease(empty, 'v1.2.3').errors, [
      'CHANGELOG.md: the "## [1.2.3]" section is empty',
    ]);
  });

  test('handles pre-release tags', () => {
    const root = fixture('prerelease', '0.0.0-test.1', {
      'CHANGELOG.md': '## [0.0.0-test.1]\n\n- Test build.\n',
    });
    const result = checkRelease(root, 'v0.0.0-test.1');
    assert.deepEqual(result.errors, []);
    assert.equal(result.prerelease, true);
    assert.notDeepEqual(checkRelease(root, 'v0.0.0-test.2').errors, []);
  });
});

describe('this repository', () => {
  test('declares one version everywhere', () => {
    const { found, errors } = collectVersions(repoRoot);
    assert.deepEqual(errors, []);
    const versions = new Set(found.map((f) => f.version));
    assert.equal(versions.size, 1, found.map((f) => `${f.source}: ${f.version}`).join('\n'));
  });
});

describe('command line', () => {
  const run = (args, env = {}) =>
    spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: '', GITHUB_REF_NAME: '', ...env },
    });

  test('exits 1 and names the problem on a mismatched tag', () => {
    const r = run(['v999.0.0']);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Release check failed for v999\.0\.0/);
    assert.match(r.stderr, /app\/package\.json: version is/);
  });

  test('exits 2 on bad usage', () => {
    assert.equal(run([]).status, 2);
    assert.equal(run(['v1.0.0', '--notes-out']).status, 2);
    assert.equal(run(['v1.0.0', 'v1.0.1']).status, 2);
  });

  test('on success, writes the notes and the GitHub Actions outputs', () => {
    const root = fixture('cli', '0.3.0-rc.1', {
      'CHANGELOG.md': '## [0.3.0-rc.1] - 2026-02-01\n\n- Candidate.\n\n## [0.2.0]\n\n- Old.\n',
    });
    const notes = join(temp, 'cli-notes.md');
    const output = join(temp, 'cli-output.txt');
    writeFileSync(output, '');
    const r = run(['--root', root, '--notes-out', notes], {
      GITHUB_REF_NAME: 'v0.3.0-rc.1',
      GITHUB_OUTPUT: output,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Release check passed: v0\.3\.0-rc\.1 \(version 0\.3\.0-rc\.1, pre-release\)/);
    assert.equal(readFileSync(notes, 'utf8'), '- Candidate.\n');
    assert.equal(readFileSync(output, 'utf8'), 'version=0.3.0-rc.1\nprerelease=true\n');
  });
});
