import assert from "node:assert/strict";
import "../tests/setup-dom.mjs";
import test, { afterEach } from "node:test";
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react/pure.js";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { QaTurn } = await jiti.import("./components/QaTurn.tsx");
const { summarizeTurn } = await jiti.import("./components/turn-summary.ts");
const { MessageView } = await jiti.import("./overrides/components/MessageView.tsx");
const { planTranscriptRows } = await jiti.import("../lib/chat-transcript-plan.ts");
afterEach(cleanup);

const messages = [
  { role: "user", content: "Inspect **this** file" },
  { role: "assistant", content: [
    { type: "thinking", thinking: "Private reasoning" },
    { type: "text", text: "First **finding**." },
    { type: "toolCall", toolName: "read", toolCallId: "read-1", input: { path: "example.ts" } },
  ] },
  { role: "toolResult", toolCallId: "read-1", content: [{ type: "text", text: "Raw tool output" }] },
  { role: "assistant", content: [
    { type: "toolCall", toolName: "read", toolCallId: "read-2", input: { path: "other.ts" } },
    { type: "text", text: "Final answer: $x^2$." },
  ] },
  { role: "user", content: "Next question" },
];

function card(overrides = {}) {
  return React.createElement(QaTurn, {
    turnId: "prompt", sessionId: "qa-regression", messages, userIndex: 0, endIndex: 4, live: false,
    question: React.createElement(MessageView, { message: messages[0] }),
    ...overrides,
  }, React.createElement(MessageView, { message: messages[3] }));
}

test("plain question/answer turns stay indivisible at history page boundaries", () => {
  const plain = [messages[0], { role: "assistant", content: [{ type: "text", text: "Answer" }] }, messages[4]];
  const rows = planTranscriptRows(plain, { groupPlainTurns: true });
  assert.deepEqual(rows.map(({ kind, userIndex, endIndex }) => ({ kind, userIndex, endIndex })), [
    { kind: "group", userIndex: 0, endIndex: 2 },
    { kind: "group", userIndex: 2, endIndex: 3 },
  ]);
  assert.deepEqual(rows[0].segments.map(({ kind, index }) => ({ kind, index })), [{ kind: "text", index: 1 }]);
});

test("turn previews and copying exclude reasoning and tool results, retaining answer order", () => {
  assert.deepEqual(summarizeTurn(messages, 0, 4), {
    question: "Inspect **this** file", label: "Inspect **this** file",
    answer: "First **finding**.\n\nFinal answer: $x^2$.",
    tools: [{ name: "read", count: 2 }], endsWithText: true,
  });
});

test("preview interactions do not expand a turn, and explicit expansion survives remounting", () => {
  let view = render(card());
  const preview = view.getByRole("region", { name: "Answer preview" });
  fireEvent.click(preview);
  fireEvent.scroll(preview, { target: { scrollTop: 40 } });
  assert.equal(view.container.querySelector(".gc-turn").dataset.expanded, "false");
  assert.ok(view.getByText("read ×2"));
  fireEvent.click(view.getByRole("button", { name: /Inspect/ }));
  assert.equal(view.container.querySelector(".gc-turn").dataset.expanded, "true");
  view.unmount();
  view = render(card());
  assert.equal(view.container.querySelector(".gc-turn").dataset.expanded, "true");
  fireEvent.click(view.getByRole("button", { name: "Collapse question and answer" }));
  assert.equal(view.container.querySelector(".gc-turn").dataset.expanded, "false");
});

test("a live turn cannot be collapsed or forked even when previously collapsed", () => {
  const view = render(card({ live: true, fork: { entryId: "prompt", editPrompt: true, onFork() { throw new Error("Live turn must not fork"); }, forking: false, disabled: false } }));
  assert.equal(view.container.querySelector(".gc-turn").dataset.expanded, "true");
  assert.equal(view.queryByRole("button", { name: "Collapse question and answer" }), null);
  assert.equal(view.queryByRole("button", { name: /New session from/ }), null);
});

test("an unanswered question retains its supported fork action and busy guard", () => {
  const view = render(React.createElement(QaTurn, {
    turnId: "unanswered", sessionId: "qa-question-only", messages: [messages[0]], userIndex: 0, endIndex: 1, live: false,
    question: React.createElement(MessageView, { message: messages[0] }),
    fork: { entryId: "prompt", editPrompt: true, onFork() {}, forking: false, disabled: true },
  }));
  assert.equal(view.getByRole("button", { name: /New session from this question/ }).disabled, true);
  assert.equal(view.queryByRole("group", { name: "Answer actions" }), null);
});
