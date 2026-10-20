import { execSync } from 'node:child_process';

try {
  let currentHooks = '';
  try {
    currentHooks = execSync('git config --get core.hooksPath', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // Unset or non-git environment
  }

  if (currentHooks && currentHooks !== '.githooks') {
    // Respect existing custom git hooks path
    process.exit(0);
  }

  execSync('git config core.hooksPath .githooks', {
    stdio: 'ignore',
  });
} catch {
  // Silently ignore in environments without git (e.g. npm ci in container or archive)
}
