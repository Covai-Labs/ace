import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('GoogleAIStudioParser correctly extracts user and assistant messages from fixture', async () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures/google-ai-studio-chat.html'), 'utf8');
  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);

  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  const { GoogleAIStudioParser } = await import('decant-core');
  const parser = new GoogleAIStudioParser();

  assert.equal(parser.isAvailable('https://aistudio.google.com/app/prompts/new_chat'), true);

  const result = await parser.parse();
  assert.equal(result.title, 'My AI Studio System Prompt');
  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'User');
  assert.match(result.messages[0].content, /Write a Python function/);
  assert.equal(result.messages[1].role, 'Google AI Studio');
  assert.match(result.messages[1].content, /def fib\(n\):/);
});

test('GoogleAIStudioParser handles modern [data-turn-role] DOM, merges thoughts, and unwraps inline ms-katex', async () => {
  const html = `<!DOCTYPE html><html><head><title>Modern AI Studio</title></head><body>
    <ms-chat-turn id="turn-1" class="text-chunk-host">
      <div class="chat-turn-container user">
        <div class="actions-container"><button aria-label="Edit"><span>edit</span></button></div>
        <div class="virtual-scroll-container user-prompt-container" data-turn-role="User">
          <div class="turn-content">
            <div class="author-label">User <span class="timestamp">10:09 PM</span></div>
            <ms-prompt-chunk><ms-text-chunk><ms-cmark-node><p>Explain A to B.</p></ms-cmark-node></ms-text-chunk></ms-prompt-chunk>
          </div>
        </div>
      </div>
    </ms-chat-turn>
    <ms-chat-turn id="turn-2" class="text-chunk-host thought-activity-host">
      <div class="chat-turn-container model">
        <div class="virtual-scroll-container model-prompt-container" data-turn-role="Model">
          <div class="turn-content">
            <div class="author-label">Model <span class="timestamp">10:09 PM</span></div>
            <ms-prompt-chunk><ms-thought-chunk><mat-expansion-panel>
              <mat-expansion-panel-header>Thoughts</mat-expansion-panel-header>
              <div><ms-text-chunk><ms-cmark-node><p>Reasoning step 1.</p></ms-cmark-node></ms-text-chunk></div>
            </mat-expansion-panel></ms-thought-chunk></ms-prompt-chunk>
          </div>
        </div>
      </div>
    </ms-chat-turn>
    <ms-chat-turn id="turn-3" class="text-chunk-host">
      <div class="chat-turn-container model">
        <div class="virtual-scroll-container model-prompt-container" data-turn-role="Model">
          <div class="turn-content">
            <ms-prompt-chunk><ms-text-chunk><ms-cmark-node>
              <p>Result A <ms-katex class="inline"><pre><code><span class="katex"><span class="katex-mathml"><math><semantics><mrow><mo>→</mo></mrow><annotation encoding="application/x-tex">\\rightarrow</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">→</span></span></code></pre></ms-katex> B.</p>
            </ms-cmark-node></ms-text-chunk></ms-prompt-chunk>
          </div>
        </div>
      </div>
    </ms-chat-turn>
  </body></html>`;

  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  const { GoogleAIStudioParser } = await import('decant-core');
  const parser = new GoogleAIStudioParser();
  const result = await parser.parse();

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'User');
  assert.equal(result.messages[0].content, 'Explain A to B.');
  assert.equal(result.messages[1].role, 'Google AI Studio');
  assert.equal(result.messages[1].thinking, 'Reasoning step 1.');
  assert.ok(result.messages[1].content.startsWith('<think>\nReasoning step 1.\n</think>\n\n'));
  assert.match(result.messages[1].content, /Result A \$\\rightarrow\$ B\./);
  assert.doesNotMatch(result.messages[1].content, /Thoughts|10:09 PM/);
});

test('GoogleAIStudioParser scrolls virtualized unmounted turns into view and restores scroll position', async () => {
  const html = `<!DOCTYPE html><html><body>
    <div id="scroller">
      <ms-chat-turn id="turn-u1">
        <div class="virtual-scroll-container" data-turn-role="User"></div>
      </ms-chat-turn>
      <ms-chat-turn id="turn-m1">
        <div class="virtual-scroll-container" data-turn-role="Model">
          <div class="turn-content">
            <ms-prompt-chunk><ms-text-chunk><ms-cmark-node><p>Final answer.</p></ms-cmark-node></ms-text-chunk></ms-prompt-chunk>
          </div>
        </div>
      </ms-chat-turn>
    </div>
  </body></html>`;

  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);
  const scroller = document.getElementById('scroller');
  Object.defineProperty(scroller, 'scrollHeight', { value: 2000, configurable: true });
  Object.defineProperty(scroller, 'clientHeight', { value: 600, configurable: true });
  scroller.scrollTop = 1400;

  const unmountedTurn = document.getElementById('turn-u1');
  unmountedTurn.scrollIntoView = () => {
    const container = unmountedTurn.querySelector('[data-turn-role="User"]');
    container.innerHTML =
      '<div class="turn-content"><ms-prompt-chunk><ms-text-chunk><ms-cmark-node><p>Scrolled user prompt.</p></ms-cmark-node></ms-text-chunk></ms-prompt-chunk></div>';
  };

  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  const { GoogleAIStudioParser } = await import('decant-core');
  const parser = new GoogleAIStudioParser();
  const result = await parser.parse();

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].role, 'User');
  assert.equal(result.messages[0].content, 'Scrolled user prompt.');
  assert.equal(result.messages[1].role, 'Google AI Studio');
  assert.equal(result.messages[1].content, 'Final answer.');
  assert.equal(scroller.scrollTop, 1400);
});

test('GoogleAIStudioParser reads live textarea.value and retains user prompt "Thinking..."', async () => {
  const html = `<!DOCTYPE html><html><body>
    <ms-chat-turn id="turn-ta">
      <div class="virtual-scroll-container" data-turn-role="User">
        <div class="turn-content"><textarea></textarea></div>
      </div>
    </ms-chat-turn>
    <ms-chat-turn id="turn-thinking-prompt">
      <div class="virtual-scroll-container" data-turn-role="User">
        <div class="turn-content">
          <ms-prompt-chunk><ms-text-chunk><ms-cmark-node><p>Thinking...</p></ms-cmark-node></ms-text-chunk></ms-prompt-chunk>
        </div>
      </div>
    </ms-chat-turn>
  </body></html>`;

  const { window, document, HTMLElement, Node, DOMParser } = parseHTML(html);
  document.querySelector('textarea').value = 'Live textarea prompt';
  global.window = window;
  global.document = document;
  global.HTMLElement = HTMLElement;
  global.Node = Node;
  global.DOMParser = DOMParser;

  const { GoogleAIStudioParser } = await import('decant-core');
  const parser = new GoogleAIStudioParser();
  const result = await parser.parse();

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0].content, 'Live textarea prompt');
  assert.equal(result.messages[1].content, 'Thinking...');
});
