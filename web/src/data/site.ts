// Shared site-wide constants.

export const SITE = {
  name: 'AI Chat Exporter',
  url: 'https://ace.covai.org',
  chromeStore: 'https://chromewebstore.google.com/detail/cgakhbhkplndjjknhgegfcipffflcaoj',
  firefoxAddons: 'https://addons.mozilla.org/en-US/firefox/addon/ai-chat-export/',
  github: 'https://github.com/Covai-Labs/ace',
  youtubeDemo: 'https://www.youtube.com/watch?v=5V2EZqDkUnU',
};

export function softwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE.name,
    operatingSystem: 'Chrome, Firefox, Edge',
    applicationCategory: 'UtilitiesApplication',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    url: SITE.url,
    downloadUrl: SITE.chromeStore,
  };
}
