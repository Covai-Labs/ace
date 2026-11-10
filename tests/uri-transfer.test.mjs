import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildObsidianUri,
  cleanObsidianTitle,
  buildAppUri,
} from '../content/utils/uri-transfer.js';

const popupHtml = fs.readFileSync('entrypoints/popup/index.html', 'utf8');
const previewHtml = fs.readFileSync('entrypoints/preview/index.html', 'utf8');
const optionsHtml = fs.readFileSync('entrypoints/options/index.html', 'utf8');
const optionsJs = fs.readFileSync('entrypoints/options/options.js', 'utf8');
const backgroundJs = fs.readFileSync('entrypoints/background.js', 'utf8');

test('cleanObsidianTitle strips invalid filename and Obsidian reserved characters', () => {
  assert.equal(
    cleanObsidianTitle('My / Chat : [Test] #1 ? * Title | ^'),
    'My  Chat  Test 1   Title',
  );
  assert.equal(cleanObsidianTitle(''), 'AI Conversation');
});

test('buildObsidianUri formats obsidian://new URI with title, content, and optional vault', () => {
  const uriShort = buildObsidianUri({
    title: 'Research Note',
    content: 'Some markdown content',
    vault: 'Personal Vault',
  });
  assert.ok(uriShort.startsWith('obsidian://new?'));
  assert.ok(uriShort.includes('name=Research+Note'));
  assert.ok(uriShort.includes('vault=Personal+Vault'));
  assert.ok(uriShort.includes('content=Some+markdown+content'));

  const uriNoVault = buildObsidianUri({
    title: 'Basic Note',
    content: 'Hello World',
  });
  assert.ok(!uriNoVault.includes('vault='));
});

test('buildAppUri generates URIs for Logseq, Bear, NotePlan, and Drafts', () => {
  const logseq = buildAppUri('logseq', { title: 'Journal Note', content: 'Chat content' });
  assert.ok(logseq.startsWith('logseq://x-callback-url/quickCapture?'));
  assert.ok(logseq.includes('page=Journal+Note'));

  const bear = buildAppUri('bear', { title: 'Bear Note', content: 'Chat content' });
  assert.ok(bear.startsWith('bear://x-callback-url/create?'));
  assert.ok(bear.includes('title=Bear+Note'));

  const noteplan = buildAppUri('noteplan', { title: 'Plan Note', content: 'Chat content' });
  assert.ok(noteplan.startsWith('noteplan://x-callback-url/addText?'));
  assert.ok(noteplan.includes('noteTitle=Plan+Note'));

  const drafts = buildAppUri('drafts', { title: 'Draft Note', content: 'Chat content' });
  assert.ok(drafts.startsWith('drafts://x-callback-url/create?'));
  assert.ok(drafts.includes('text=%23+Draft+Note'));
});

test('popup, preview, and options UI include PKM app options', () => {
  assert.match(popupHtml, /<option value="obsidian">Obsidian<\/option>/);
  assert.match(popupHtml, /<option value="logseq">Logseq<\/option>/);
  assert.match(popupHtml, /<option value="bear">Bear<\/option>/);
  assert.match(previewHtml, /<option value="obsidian">Obsidian<\/option>/);
  assert.match(previewHtml, /<option value="logseq">Logseq<\/option>/);
  assert.match(optionsHtml, /<option value="obsidian">Obsidian \(obsidian:\/\/\)<\/option>/);
  assert.match(optionsHtml, /<option value="logseq">Logseq \(logseq:\/\/\)<\/option>/);
  assert.match(optionsHtml, /id="obsidian-vault-input"/);
  assert.match(optionsJs, /obsidianVaultName/);
  assert.match(backgroundJs, /uriAppTargets/);
});
