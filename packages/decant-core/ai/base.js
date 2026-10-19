export class ChatParser {
  name = 'Generic';

  getPlatformName() {
    return this.name || this.constructor.name.replace(/Parser$/, '');
  }

  constructor() {}

  /**
   * Checks if this parser can handle the current URL
   * @param {string} url
   * @returns {boolean}
   */
  isAvailable(_url) {
    throw new Error('Not implemented');
  }

  /**
   * Parses the current page content into a standardized format
   * @returns {Promise<{ title: string, messages: Array<{role: string, content: string}>, metadata?: Record<string, string> }>}
   */
  async parse() {
    throw new Error('Not implemented');
  }
}
