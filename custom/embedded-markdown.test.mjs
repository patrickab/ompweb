import assert from "node:assert/strict";
import "../tests/setup-dom.mjs";
import test, { afterEach } from "node:test";
import React from "react";
import { cleanup, fireEvent, render } from "@testing-library/react/pure.js";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { jsx: { runtime: "automatic" }, tsconfigPaths: true });
const { EmbeddedMarkdown } = await jiti.import("./components/EmbeddedMarkdown.tsx");
const { AgentLinkContext } = await jiti.import("../lib/agent-links.ts");
afterEach(cleanup);

test("shared renderer renders prose and LaTex while preserving source code", () => {
  const view = render(React.createElement(EmbeddedMarkdown, null, "**Result** $x^2$\n\n\\[y = 2\\]\n\n`$not_math$`"));
  assert.equal(view.container.querySelector("strong").textContent, "Result");
  assert.equal(view.container.querySelectorAll(".katex").length, 2);
  assert.equal(view.container.querySelector("code").textContent, "$not_math$");
});

test("shared renderer preserves OMP file and agent link actions without executing hostile URLs", () => {
  const openedFiles = [];
  const openedAgents = [];
  const view = render(React.createElement(AgentLinkContext.Provider, { value: (ids) => openedAgents.push(ids) },
    React.createElement(EmbeddedMarkdown, { cwd: "/tmp/project", onOpenFile: (path) => openedFiles.push(path) },
      "[File](./example.ts) and [Agent](agent://Scout) and [unsafe](javascript:alert%281%29)")));
  fireEvent.click(view.getByRole("link", { name: "File" }));
  assert.deepEqual(openedFiles, ["/tmp/project/example.ts"]);
  fireEvent.click(view.getByRole("link", { name: "Agent" }));
  assert.deepEqual(openedAgents, [["Scout"]]);
  assert.equal(view.container.querySelector('a[href^="javascript:"]'), null);
});

test("linked images never produce nested interactive lightbox buttons inside anchors", () => {
  const view = render(React.createElement(EmbeddedMarkdown, null, "[**![Preview](https://example.com/image.png)**](https://example.com)"));
  assert.equal(view.container.querySelector("a button"), null);
  assert.ok(view.getByRole("img", { name: "Preview" }));
});
