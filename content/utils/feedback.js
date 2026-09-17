/**
 * Determines whether the unsupported AI warning banner should be displayed.
 *
 * @param {object|null|undefined} report - Availability check report from parser
 * @returns {boolean} True if the parser is available but using generic article fallback
 */
export function shouldShowUnsupportedWarning(report) {
  return Boolean(report && report.available && report.isDedicatedAi === false);
}

/**
 * Builds the GitHub issue URL for platform support requests using the YAML form template.
 *
 * @param {string} pageUrl - The URL of the unsupported page
 * @returns {string} Fully constructed GitHub issue URL with prefilled parameters
 */
export function buildPlatformSupportIssueUrl(pageUrl) {
  let domain = '';
  let cleanUrl = '';
  const rawUrl = pageUrl || '';
  try {
    if (rawUrl) {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        domain = parsed.hostname;
        cleanUrl = rawUrl;
      }
    }
  } catch {
    // Ignore invalid URL
  }
  const issueTitle = `platform: Support for ${domain || 'New AI Platform'}`;
  return `https://github.com/Covai-Labs/ai-chat-exporter/issues/new?template=platform_support.yml&title=${encodeURIComponent(issueTitle)}&platform=${encodeURIComponent(domain)}&url=${encodeURIComponent(cleanUrl)}`;
}
