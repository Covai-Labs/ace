/**
 * Optional permissions helper for Chrome and Firefox MV3 extensions.
 */

function getPermissionsApi() {
  if (typeof browser !== 'undefined' && browser.permissions) {
    return browser.permissions;
  }
  if (typeof chrome !== 'undefined' && chrome.permissions) {
    return chrome.permissions;
  }
  return null;
}

/**
 * Checks whether an optional permission is currently granted.
 * @param {'downloads' | 'clipboardWrite' | string} permission
 * @returns {Promise<boolean>}
 */
export async function hasPermission(permission) {
  const api = getPermissionsApi();
  if (!api || typeof api.contains !== 'function') {
    return false;
  }
  try {
    return await api.contains({ permissions: [permission] });
  } catch (err) {
    console.warn(`[Permissions] Error checking permission "${permission}":`, err);
    return false;
  }
}

/**
 * Requests an optional permission from the user.
 * Must be invoked inside a user gesture handler (e.g. click).
 * @param {'downloads' | 'clipboardWrite' | string} permission
 * @returns {Promise<boolean>}
 */
export async function requestPermission(permission) {
  const api = getPermissionsApi();
  if (!api || typeof api.request !== 'function') {
    return false;
  }
  try {
    return await api.request({ permissions: [permission] });
  } catch (err) {
    console.warn(`[Permissions] Error requesting permission "${permission}":`, err);
    return false;
  }
}

/**
 * Revokes an optional permission.
 * @param {'downloads' | 'clipboardWrite' | string} permission
 * @returns {Promise<boolean>}
 */
export async function removePermission(permission) {
  const api = getPermissionsApi();
  if (!api || typeof api.remove !== 'function') {
    return false;
  }
  try {
    return await api.remove({ permissions: [permission] });
  } catch (err) {
    console.warn(`[Permissions] Error removing permission "${permission}":`, err);
    return false;
  }
}
