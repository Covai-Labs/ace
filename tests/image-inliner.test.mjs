import assert from 'node:assert/strict';
import test from 'node:test';
import {
  blobToDataUri,
  fetchUrlAsDataUri,
  inlineImagesInContent,
  inlineConversationImages,
} from '../content/utils/image-inliner.js';

test('blobToDataUri converts Blob to base64 Data URI', async () => {
  const binaryData = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic bytes
  const blob = new Blob([binaryData], { type: 'image/png' });

  const dataUri = await blobToDataUri(blob);
  assert.ok(dataUri.startsWith('data:image/png;base64,'));
});

test('fetchUrlAsDataUri returns data URI directly if already data:image', async () => {
  const existing = 'data:image/png;base64,abc123==';
  const res = await fetchUrlAsDataUri(existing);
  assert.equal(res, existing);
});

test('fetchUrlAsDataUri ignores non-http/blob/relative URLs gracefully', async () => {
  assert.equal(await fetchUrlAsDataUri('javascript:alert(1)'), null);
  assert.equal(await fetchUrlAsDataUri(''), null);
});

test('inlineImagesInContent converts markdown and HTML images to Data URIs', async () => {
  const mockFetcher = async (url) => {
    if (url === 'https://claude.ai/api/files/1/preview') {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=';
    }
    if (url === 'blob:https://claude.ai/123-456') {
      return 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    }
    return null;
  };

  const input =
    'Here is the chart:\n\n' +
    '![chart](https://claude.ai/api/files/1/preview)\n\n' +
    'And an HTML image:\n\n' +
    '<img src="blob:https://claude.ai/123-456" alt="screenshot" />\n\n' +
    'And an existing data URI:\n\n' +
    '![already inline](data:image/webp;base64,UklGRkAAAABXRUJQVlA4=)';

  const result = await inlineImagesInContent(input, mockFetcher);

  assert.ok(result.includes('![chart](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE=)'));
  assert.ok(result.includes('src="data:image/jpeg;base64,/9j/4AAQSkZJRg=="'));
  assert.ok(result.includes('![already inline](data:image/webp;base64,UklGRkAAAABXRUJQVlA4=)'));
});

test('inlineImagesInContent preserves original URL if fetch fails or returns null', async () => {
  const mockFetcher = async () => null;

  const input = '![broken](https://broken.domain/image.png)';
  const result = await inlineImagesInContent(input, mockFetcher);

  assert.equal(result, input);
});

test('inlineConversationImages processes all messages in conversation', async () => {
  const mockFetcher = async (url) => `data:image/png;base64,mock_${url.split('/').pop()}`;

  const conversation = {
    title: 'Claude Chat',
    messages: [
      {
        role: 'User',
        content: 'Check this: ![p1](https://claude.ai/preview1)',
      },
      {
        role: 'Assistant',
        content: 'Here is the diagram: ![p2](https://claude.ai/preview2)',
      },
    ],
  };

  const updated = await inlineConversationImages(conversation, mockFetcher);

  assert.ok(updated.messages[0].content.includes('data:image/png;base64,mock_preview1'));
  assert.ok(updated.messages[1].content.includes('data:image/png;base64,mock_preview2'));
});

test('inlineImagesInContent safely handles URLs that share a prefix', async () => {
  const mockFetcher = async (url) => {
    if (url === 'https://example.com/image/1') {
      return 'data:image/png;base64,DATA1';
    }
    if (url === 'https://example.com/image/10') {
      return 'data:image/png;base64,DATA10';
    }
    return null;
  };

  const input =
    '![one](https://example.com/image/1)\n' +
    '![ten](https://example.com/image/10)\n' +
    '<img src="https://example.com/image/1" />\n' +
    '<img src="https://example.com/image/10" />';

  const result = await inlineImagesInContent(input, mockFetcher);

  assert.ok(result.includes('![one](data:image/png;base64,DATA1)'));
  assert.ok(result.includes('![ten](data:image/png;base64,DATA10)'));
  assert.ok(result.includes('<img src="data:image/png;base64,DATA1" />'));
  assert.ok(result.includes('<img src="data:image/png;base64,DATA10" />'));
  assert.ok(!result.includes('DATA10?'));
});
