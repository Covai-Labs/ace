import test from "node:test";
import assert from "node:assert/strict";
import { scoreContent, cleanTitle } from "../web/scoring.js";

test("scoreContent gives high score to text-dense and structural HTML", () => {
  const blogHtml = `
    <article>
      <h2>First Section</h2>
      <p>${"This is a clean and informative paragraph explaining a key concept in great detail with clear prose. ".repeat(5)}</p>
      <h2>Second Section</h2>
      <p>${"Another structured paragraph continuing the explanation with well-formed thoughts. ".repeat(5)}</p>
    </article>
  `;

  const score = scoreContent(blogHtml);
  assert.ok(score > 50, `Expected score > 50, got ${score}`);
});

test("scoreContent heavily rewards code blocks and tables", () => {
  const plainTextHtml = `<p>${"Some basic article text describing algorithms and syntax. ".repeat(10)}</p>`;
  const techDocHtml = `
    <div>
      <h2>Code Example</h2>
      <pre><code>function binarySearch(arr, target) { return -1; }</code></pre>
      <p>${"Some basic article text describing algorithms and syntax. ".repeat(10)}</p>
      <table>
        <thead><tr><th>Method</th><th>Complexity</th></tr></thead>
        <tbody><tr><td>Search</td><td>O(log N)</td></tr></tbody>
      </table>
    </div>
  `;

  const plainScore = scoreContent(plainTextHtml);
  const techScore = scoreContent(techDocHtml);

  assert.ok(
    techScore > plainScore,
    `Tech score (${techScore}) should exceed plain score (${plainScore})`,
  );
});

test("scoreContent penalizes link farms / navigation noise", () => {
  const noisyNavHtml = `
    <div>
      <a href="/1">Link One</a> | <a href="/2">Link Two</a> | <a href="/3">Link Three</a> |
      <a href="/4">Link Four</a> | <a href="/5">Link Five</a> | <a href="/6">Link Six</a>
      <p>Short snippet</p>
    </div>
  `;

  const score = scoreContent(noisyNavHtml);
  assert.ok(score < 20, `Expected noisy nav score < 20, got ${score}`);
});

test("cleanTitle strips site and brand suffixes cleanly", () => {
  assert.equal(
    cleanTitle("Understanding Transformers | Medium", "Medium"),
    "Understanding Transformers",
  );
  assert.equal(
    cleanTitle("How to Build Addons - The Verge", "The Verge"),
    "How to Build Addons",
  );
  assert.equal(cleanTitle("Simple Guide — SiteBrand"), "Simple Guide");
  assert.equal(
    cleanTitle("Clean Title Without Suffix"),
    "Clean Title Without Suffix",
  );
  assert.equal(cleanTitle(""), "Untitled");
});
