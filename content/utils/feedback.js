/**
 * Determines whether the unsupported AI warning banner should be displayed.
 *
 * @param {object|null|undefined} report - Availability check report from parser
 * @returns {boolean} True if the parser is available but using generic article fallback
 */
export function shouldShowUnsupportedWarning(report) {
  return Boolean(report && report.available && report.isDedicatedAi === false);
}
