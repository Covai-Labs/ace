import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const decantCoreDir = path.join(rootDir, 'packages', 'decant-core');
const pkgJsonPath = path.join(decantCoreDir, 'package.json');
const lockfilePath = path.join(decantCoreDir, 'package-lock.json');

const isCheck = process.argv.includes('--check');

if (!fs.existsSync(pkgJsonPath)) {
  console.error(`package.json not found at ${pkgJsonPath}`);
  process.exit(1);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decant-lockfile-'));
try {
  fs.copyFileSync(pkgJsonPath, path.join(tmpDir, 'package.json'));
  execSync('npm install --package-lock-only --ignore-scripts --no-audit --no-fund', {
    cwd: tmpDir,
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const generatedLock = fs.readFileSync(path.join(tmpDir, 'package-lock.json'), 'utf8');

  if (isCheck) {
    if (!fs.existsSync(lockfilePath)) {
      console.error('Error: packages/decant-core/package-lock.json does not exist.');
      process.exit(1);
    }
    const currentLock = fs.readFileSync(lockfilePath, 'utf8');
    if (currentLock !== generatedLock) {
      console.error(
        'Error: packages/decant-core/package-lock.json is out of sync with package.json.\n' +
          'Run "npm run sync:decant-lockfile" to synchronize it.',
      );
      process.exit(1);
    }
    console.log('packages/decant-core/package-lock.json is in sync.');
  } else {
    fs.writeFileSync(lockfilePath, generatedLock, 'utf8');
    console.log('Successfully updated packages/decant-core/package-lock.json');
  }
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
