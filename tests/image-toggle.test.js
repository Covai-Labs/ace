import assert from 'node:assert/strict';
import test from 'node:test';
import { stripImages } from '../content/utils/strip-images.js';

test('stripImages removes markdown images and leaves message content clean', () => {
  // Case 1: Simple inline image removal
  assert.equal(
    stripImages('Check out this image: ![Football Shoe](https://example.com/shoe.png) and text'),
    'Check out this image:  and text',
  );

  // Case 2: Strip list sections that only contained images
  assert.equal(stripImages('**Images:**\n- ![alt](url)'), '');

  // Case 3: Retain non-image attachments while cleaning image bullet points
  assert.equal(
    stripImages('Some text\n\n**Attachments & Images:**\n- ![alt](url)\n- file.txt'),
    'Some text\n\n**Attachments & Images:**\n\n- file.txt',
  );
});
