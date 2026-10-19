import test from "node:test";
import assert from "node:assert/strict";
import { parseHTML } from "linkedom";
import {
  ChatGPTParser,
  GeminiParser,
  CopilotParser,
  PerplexityParser,
} from "../ai/index.js";

test("ChatGPTParser formats API result with Method: API by default", () => {
  const parser = new ChatGPTParser();
  const convoData = {
    title: "Test API Chat",
    model_slug: "gpt-4o",
  };
  const apiMessages = [
    {
      role: "User",
      segments: [{ type: "text", content: "Hello" }],
    },
    {
      role: "ChatGPT",
      segments: [{ type: "text", content: "Hi there!" }],
    },
  ];

  const result = parser.formatApiResult(
    convoData,
    apiMessages,
    "Fallback Title",
    {},
    "API",
  );
  assert.equal(result.metadata.Method, "API");
  assert.equal(result.metadata.Model, "gpt-4o");
  assert.equal(result.messages.length, 2);
});

test("ChatGPTParser formats SSR result with Method: SSR", () => {
  const parser = new ChatGPTParser();
  const convoData = {
    title: "Test Shared Chat",
    model_slug: "gpt-4o-mini",
  };
  const apiMessages = [
    {
      role: "User",
      segments: [{ type: "text", content: "Shared prompt" }],
    },
  ];

  const result = parser.formatApiResult(
    convoData,
    apiMessages,
    "Fallback Title",
    {},
    "SSR",
  );
  assert.equal(result.metadata.Method, "SSR");
});

test("GeminiParser sets Method: DOM in metadata", async () => {
  const { document, window } = parseHTML(
    "<html><head><title>Gemini Test</title></head><body></body></html>",
  );
  globalThis.document = document;
  globalThis.window = window;

  const parser = new GeminiParser();
  const result = await parser.parse();
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.metadata.Source, "Gemini");
});

test("CopilotParser sets Method: DOM in metadata", async () => {
  const { document, window } = parseHTML(
    "<html><head><title>Copilot Test</title></head><body></body></html>",
  );
  globalThis.document = document;
  globalThis.window = window;

  const parser = new CopilotParser();
  const result = await parser.parse();
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.metadata.Source, "Copilot");
});

test("PerplexityParser sets Method: DOM in metadata", async () => {
  const { document, window } = parseHTML(
    "<html><head><title>Perplexity Test</title></head><body></body></html>",
  );
  globalThis.document = document;
  globalThis.window = window;

  const parser = new PerplexityParser();
  const result = await parser.parse();
  assert.equal(result.metadata.Method, "DOM");
  assert.equal(result.metadata.Source, "Perplexity");
});
