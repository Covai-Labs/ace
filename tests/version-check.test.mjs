import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('package.json version is valid SemVer string', () => {
  const pkgPath = path.resolve('package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  assert.ok(pkg.version, 'package.json must specify a version');
  assert.match(
    pkg.version,
    /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/,
    'Version must follow SemVer format',
  );
});

test('legacy root manifest.json is not present (WXT generates manifests dynamically)', () => {
  const manifestPath = path.resolve('manifest.json');
  assert.strictEqual(
    fs.existsSync(manifestPath),
    false,
    'manifest.json should not exist in root; WXT generates manifests dynamically from wxt.config.ts and package.json',
  );
});

test('built extension manifests match package.json version if built', () => {
  const pkgPath = path.resolve('package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const targets = ['.output/chrome-mv3/manifest.json', '.output/firefox-mv3/manifest.json'];
  for (const targetPath of targets) {
    const fullPath = path.resolve(targetPath);
    if (fs.existsSync(fullPath)) {
      const manifest = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      assert.strictEqual(
        manifest.version,
        pkg.version,
        `${targetPath} version (${manifest.version}) must match package.json version (${pkg.version})`,
      );
    }
  }
});
