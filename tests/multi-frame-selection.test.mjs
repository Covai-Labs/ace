import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseHTML } from 'linkedom';
import { GoogleSearchAIParser } from 'decant-core';

// 1. Test scoring formula directly
function scoreFrameReport(report) {
  if (!report || !report.available) return -1;
  let score = 0;
  if (report.isDedicatedAi) score += 1000;
  score += (report.count || 0) * 10;
  if (report.isTopFrame) score += 5;
  return score;
}

test('multi-frame scoring: Dedicated AI in top frame beats subframe cookie rotator', () => {
  const topGoogleFrame = {
    available: true,
    platform: 'Google Search AI',
    isDedicatedAi: true,
    count: 4,
    isTopFrame: true,
    frameId: 0,
  };

  const subframeCookieRotator = {
    available: true,
    platform: 'Web Article',
    isDedicatedAi: false,
    count: 1,
    isTopFrame: false,
    frameId: 1234,
  };

  const reports = [subframeCookieRotator, topGoogleFrame];
  reports.sort((a, b) => scoreFrameReport(b) - scoreFrameReport(a));

  assert.equal(reports[0].frameId, 0);
  assert.equal(reports[0].platform, 'Google Search AI');
  assert.ok(scoreFrameReport(topGoogleFrame) > scoreFrameReport(subframeCookieRotator));
});

test('multi-frame scoring: Subframe dedicated AI (e.g. Copilot in M365) beats empty top frame', () => {
  const topShellFrame = {
    available: false,
    platform: '',
    isDedicatedAi: false,
    count: 0,
    isTopFrame: true,
    frameId: 0,
  };

  const subframeCopilot = {
    available: true,
    platform: 'Copilot',
    isDedicatedAi: true,
    count: 6,
    isTopFrame: false,
    frameId: 5678,
  };

  const reports = [topShellFrame, subframeCopilot];
  reports.sort((a, b) => scoreFrameReport(b) - scoreFrameReport(a));

  assert.equal(reports[0].frameId, 5678);
  assert.equal(reports[0].platform, 'Copilot');
  assert.equal(scoreFrameReport(topShellFrame), -1);
  assert.ok(scoreFrameReport(subframeCopilot) > 0);
});

test('multi-frame scoring: Higher message count wins between same parser types', () => {
  const frameLow = {
    available: true,
    platform: 'Copilot',
    isDedicatedAi: true,
    count: 1,
    isTopFrame: false,
    frameId: 1,
  };

  const frameHigh = {
    available: true,
    platform: 'Copilot',
    isDedicatedAi: true,
    count: 5,
    isTopFrame: false,
    frameId: 2,
  };

  const reports = [frameLow, frameHigh];
  reports.sort((a, b) => scoreFrameReport(b) - scoreFrameReport(a));

  assert.equal(reports[0].frameId, 2);
  assert.equal(reports[0].count, 5);
});

test('wiring: content.js handles DISCOVER_FRAMES and popup.js contains targeted messaging', () => {
  const contentJs = fs.readFileSync('entrypoints/content.js', 'utf8');
  const popupJs = fs.readFileSync('entrypoints/popup/popup.js', 'utf8');

  assert.match(contentJs, /request\.action === ['"]DISCOVER_FRAMES['"]/);
  assert.match(contentJs, /action:\s*['"]FRAME_REPORT['"]/);
  assert.match(popupJs, /action:\s*['"]DISCOVER_FRAMES['"]/);
  assert.match(popupJs, /discoverBestFrame/);
  assert.match(popupJs, /activeTargetFrameId/);
  assert.match(popupJs, /targetFrameId/);

  // Subframes without active parser must not hijack COPY_CHAT / EXPORT_CHAT
  assert.match(
    contentJs,
    /if \(currentFrameIsTop\) \{\s*sendResponse\(\{ success: false, error: 'No parser available' \}\);/,
  );
});

test('GoogleSearchAIParser correctly extracts all turns from actual-page fixture', async () => {
  const fixturePath = path.resolve('Scratch/google ai chat fucked up again/actual-page.html');
  if (!fs.existsSync(fixturePath)) return;

  const html = fs.readFileSync(fixturePath, 'utf8');
  const { document } = parseHTML(html);

  const prevDoc = globalThis.document;
  globalThis.document = document;

  try {
    const parser = new GoogleSearchAIParser();
    const parsed = await parser.parse();

    assert.ok(parsed, 'Parser returned a result');
    assert.equal(parsed.messages.length, 4, 'Expected 4 turns in conversation');
    assert.equal(parsed.messages[0].role, 'User');
    assert.equal(parsed.messages[1].role, 'Model');
    assert.ok(
      parsed.messages[1].content.includes('Average Treatment Effect') ||
        parsed.messages[1].content.includes('ATE'),
    );
    assert.equal(parsed.messages[2].role, 'User');
    assert.equal(parsed.messages[3].role, 'Model');
    assert.ok(
      parsed.messages[3].content.includes('Euler') ||
        parsed.messages[3].content.includes('identity'),
    );
  } finally {
    if (prevDoc) {
      globalThis.document = prevDoc;
    } else {
      delete globalThis.document;
    }
  }
});
