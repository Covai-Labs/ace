import test from "node:test";
import assert from "node:assert/strict";
import {
  ChatGPTParser,
  linearize,
  linearizeMessagesArray,
} from "../ai/chatgpt.js";

// Synthetic mapping-shape conversation with a Deep Research tool-call node
// whose args JSON must not leak into visible export text.
function mappingWithToolCallJson() {
  const node = (id, parent, message, children = []) => ({
    id,
    parent,
    children,
    message,
  });
  const msg = (role, content, recipient = "all") => ({
    id: `msg-${role}-${recipient}`,
    author: { role },
    create_time: 1790572783,
    content,
    recipient,
    metadata: {},
  });
  return {
    title: "Deep research",
    current_node: "n4",
    mapping: {
      n1: node(
        "n1",
        null,
        msg("user", { content_type: "text", parts: ["Research AI tells"] }),
      ),
      n2: node(
        "n2",
        "n1",
        msg("assistant", {
          content_type: "code",
          language: "python3",
          text: '{"path":"/Deep Research App/start","args":{"user_query":"Do research"}}',
        }),
        [],
      ),
      n3: node(
        "n3",
        "n2",
        {
          id: "msg-thought",
          author: { role: "assistant" },
          create_time: 1790572784,
          content: {
            content_type: "thoughts",
            thoughts: [
              { summary: "Researched signals", content: "", finished: true },
            ],
          },
          recipient: "all",
          metadata: {},
        },
        [],
      ),
      n4: node(
        "n4",
        "n3",
        msg("assistant", {
          content_type: "text",
          parts: ["## Report\n\nFindings here."],
        }),
      ),
    },
  };
}

test("ChatGPT linearize drops tool-invocation code payloads from visible text", () => {
  const fixture = mappingWithToolCallJson();
  const apiMessages = linearize(fixture.mapping, false, fixture.current_node);
  const parser = new ChatGPTParser();
  const res = parser.formatApiResult(fixture, apiMessages, "Test", {});

  assert.equal(res.messages.length, 2);
  const combined = res.messages.map((m) => m.content).join("\n");
  assert.ok(!combined.includes("/Deep Research App/start"));
  assert.ok(!combined.includes('"user_query"'));
  assert.ok(combined.includes("<think>"));
  assert.ok(combined.includes("Researched signals"));
  assert.ok(combined.includes("Findings here."));
});

// Synthetic newer `messages`-array shape (no mapping tree).
function messagesArrayFixture() {
  const m = (id, role, content, extra = {}) => ({
    id,
    author: { role },
    create_time: 1790572783,
    content,
    status: "finished_successfully",
    metadata: {},
    recipient: "all",
    ...extra,
  });
  return {
    title: "Detect AI Writing Signals",
    default_model_slug: "gpt-5-6",
    messages: [
      m("u1", "user", {
        content_type: "text",
        parts: ["How to spot AI text?"],
      }),
      m("a1", "assistant", {
        content_type: "code",
        language: "python3",
        text: '{"path":"/Deep Research App/start","args":{}}',
      }),
      m("t1", "tool", {
        content_type: "code",
        language: "json",
        text: '{"session_id":"abc"}',
      }),
      m("th1", "assistant", {
        content_type: "thoughts",
        thoughts: [
          { summary: "Researched signals", content: "", finished: true },
        ],
        source_analysis_msg_id: "x",
      }),
      m("r1", "assistant", {
        content_type: "reasoning_recap",
        content: "Worked for 11s",
      }),
      m("a2", "assistant", {
        content_type: "text",
        parts: ["Deep Research has started on your question."],
      }),
    ],
  };
}

test("ChatGPT linearizeMessagesArray skips tool payloads, keeps thoughts", () => {
  const fixture = messagesArrayFixture();
  const apiMessages = linearizeMessagesArray(fixture.messages, false);

  assert.equal(apiMessages.length, 2);
  assert.equal(apiMessages[0].role, "User");
  assert.equal(apiMessages[1].role, "ChatGPT");
  const kinds = apiMessages[1].segments.map((s) => s.type);
  assert.ok(kinds.includes("thought"));
  assert.ok(kinds.includes("text"));
  const combined = apiMessages[1].segments.map((s) => s.content).join("\n");
  assert.ok(!combined.includes("/Deep Research App/start"));
  assert.ok(!combined.includes("session_id"));
  assert.ok(combined.includes("Researched signals"));
  assert.ok(combined.includes("Worked for 11s"));
  assert.ok(combined.includes("Deep Research has started"));
});

test("ChatGPT linearizeMessagesArray honours thought markers and text shapes", () => {
  const m = (id, role, content, extra = {}) => ({
    id,
    author: { role },
    create_time: 1790572783,
    content,
    status: "finished_successfully",
    metadata: {},
    recipient: "all",
    ...extra,
  });
  const apiMessages = linearizeMessagesArray(
    [
      // recipient-marked reasoning with plain text parts
      m(
        "t1",
        "assistant",
        { content_type: "text", parts: ["Should I mention dates?"] },
        { recipient: "thought" },
      ),
      // standalone content.text without parts
      m("a1", "assistant", {
        content_type: "text",
        text: "Standalone answer.",
      }),
      // voice transcription part
      m("u1", "user", {
        content_type: "text",
        parts: [
          { content_type: "audio_transcription", text: "Dictated query" },
        ],
      }),
      // citation references map
      m(
        "a2",
        "assistant",
        { content_type: "text", parts: ["Cited claim【1】"] },
        {
          metadata: {
            content_references: [
              {
                matched_text: "【1】",
                items: [{ title: "Source", url: "https://s.example" }],
              },
            ],
          },
        },
      ),
    ],
    false,
  );

  const thoughts = apiMessages.find((msg) =>
    msg.segments.some((s) => s.type === "thought"),
  );
  assert.ok(thoughts, "recipient-marked reasoning becomes thought segments");
  const allText = apiMessages
    .flatMap((msg) => msg.segments.map((s) => s.content))
    .join("\n");
  assert.ok(allText.includes("Standalone answer."));
  assert.ok(allText.includes("Dictated query"));
  const cited = apiMessages.find((msg) =>
    msg.segments.some((s) => s.content.includes("Cited claim")),
  );
  assert.deepEqual(Object.keys(cited.citeMap), ["【1】"]);
});

test("ChatGPT linearize skips code-type parts in mapping messages", () => {
  const mapping = {
    n1: {
      id: "n1",
      parent: null,
      children: [],
      message: {
        id: "m1",
        author: { role: "assistant" },
        create_time: 1790572783,
        content: {
          content_type: "code",
          language: "python3",
          parts: ['{"path":"/tool/start","args":{}}'],
        },
        recipient: "all",
        metadata: {},
      },
    },
  };
  const apiMessages = linearize(mapping, false, "n1");
  assert.equal(apiMessages.length, 0);
});

test("ChatGPT formatApiResult renders messages-array thoughts as <think>", () => {
  const fixture = messagesArrayFixture();
  const apiMessages = linearizeMessagesArray(fixture.messages, false);
  const parser = new ChatGPTParser();
  const res = parser.formatApiResult(fixture, apiMessages, "Fallback", {});

  assert.equal(res.metadata.Model, "gpt-5-6");
  const assistantMsg = res.messages.find((m) => m.role === "ChatGPT");
  assert.ok(assistantMsg.content.startsWith("<think>\n"));
  assert.ok(assistantMsg.content.includes("</think>\n\n"));
  assert.ok(!assistantMsg.content.includes("<details>"));
  assert.ok(!assistantMsg.content.includes("/Deep Research App/start"));
});
