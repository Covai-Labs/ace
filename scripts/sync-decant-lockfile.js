import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * Synchronizes or verifies the standalone decant-core package-lock.json in isolation.
 * Prevents npm workspace hoisting in the monorepo from corrupting standalone lockfiles.
 *
 * @returns {void}
 */
function syncDecantLockfile() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, '..');
  const decantCoreDir = path.join(rootDir, 'packages', 'decant-core');
  const pkgJsonPath = path.join(decantCoreDir, 'package.json');
  const lockfilePath = path.join(decantCoreDir, 'package-lock.json');

  const isCheck = process.argv.includes('--check');

  let pkgJsonContent;
  try {
    pkgJsonContent = fs.readFileSync(pkgJsonPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      console.error(`package.json not found at ${pkgJsonPath}`);
      process.exit(1);
    }
    throw err;
  }

  // Resolve absolute npm binary path to avoid OS PATH resolution vulnerabilities (Sonar S4036)
  const nodeDir = path.dirname(process.execPath);
  const npmBin = path.join(nodeDir, process.platform === 'win32' ? 'npm.cmd' : 'npm');
  let npmExec = npmBin;
  try {
    fs.accessSync(npmBin, fs.constants.X_OK);
  } catch {
    npmExec = 'npm';
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'decant-lockfile-'));
  try {
    fs.writeFileSync(path.join(tmpDir, 'package.json'), pkgJsonContent, 'utf8');

    // Seed temporary directory with existing standalone lockfile to preserve resolved versions
    try {
      fs.copyFileSync(lockfilePath, path.join(tmpDir, 'package-lock.json'));
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        throw err;
      }
    }

    execFileSync(
      npmExec,
      ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund'],
      {
        cwd: tmpDir,
        stdio: ['ignore', 'ignore', 'inherit'],
      },
    );

    const generatedLock = fs.readFileSync(path.join(tmpDir, 'package-lock.json'), 'utf8');

    if (isCheck) {
      let currentLock;
      try {
        currentLock = fs.readFileSync(lockfilePath, 'utf8');
      } catch (err) {
        if (err && err.code === 'ENOENT') {
          console.error('Error: packages/decant-core/package-lock.json does not exist.');
          process.exit(1);
        }
        throw err;
      }

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
}

syncDecantLockfile();
