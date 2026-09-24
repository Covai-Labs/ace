import test from 'node:test';
import assert from 'node:assert/strict';
import { stripThinking } from '../content/utils/strip-thinking.js';

test('stripThinking removes <think> tags and their contents', () => {
  const input =
    '<think>\nAnalyzing user request...\nCalculating tokens...\n</think>\n\nHere is the answer to your question.';
  const output = stripThinking(input);
  assert.equal(output, 'Here is the answer to your question.');
});

test('stripThinking removes <details> Thought Process blocks', () => {
  const input =
    '<details><summary>Thought Process</summary>\n\nThe user wants an explanation.\n\n</details>\n\nSure, here is the explanation.';
  const output = stripThinking(input);
  assert.equal(output, 'Sure, here is the explanation.');
});

test('stripThinking removes Claude > **Thinking Process:** blockquotes', () => {
  const input =
    '> **Thinking Process:**\n> \n> Need to analyze the problem.\n> Step 1: Check code.\n\nFinal answer goes here.';
  const output = stripThinking(input);
  assert.equal(output, 'Final answer goes here.');
});

test('stripThinking preserves <think> tags inside fenced code blocks', () => {
  const input = 'Explanation:\n\n```xml\n<think>This is code</think>\n```\n\nDone.';
  const output = stripThinking(input);
  assert.ok(output.includes('<think>This is code</think>'));
});

test('stripThinking preserves `...` inline code containing thinking text', () => {
  const input = 'Use `<think>` tag to wrap reasoning.\n\nResult.';
  const output = stripThinking(input);
  assert.ok(output.includes('`<think>`'));
});

test('stripThinking handles empty or invalid inputs', () => {
  assert.equal(stripThinking(''), '');
  assert.equal(stripThinking(null), '');
  assert.equal(stripThinking(undefined), '');
});
