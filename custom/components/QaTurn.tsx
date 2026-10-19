"use client";

import { Children, useEffect, useMemo, useRef, useState } from "react";
import { CopyAction, ForkAction, TurnCard, TurnHeader, TurnPreview, TurnRegion, TurnSurface } from "@gigachad/chat-ui";
import { SafeMarkdownBody } from "../../components/MessageView";
import type { TranscriptTurnFork, TranscriptTurnProps } from "./TranscriptTurn";
import { TurnCardContext } from "./turn-card";
import { summarizeTurn } from "./turn-summary";

/** Expand/collapse choices the reader made, by session and turn, so they survive the card leaving the render window. */
const expansionChoices = new Map<string, boolean>();
const MAX_REMEMBERED_CHOICES = 2000;

function rememberChoice(key: string, expanded: boolean) {
  expansionChoices.delete(key);
  expansionChoices.set(key, expanded);
  if (expansionChoices.size > MAX_REMEMBERED_CHOICES) expansionChoices.delete(expansionChoices.keys().next().value as string);
}

/** Copy and fork for one side of the turn, none while it runs. */
function turnActions(text: string, subject: "Question" | "Answer", fork?: TranscriptTurnFork) {
  return [
    text.trim() ? <CopyAction key="copy" text={text} label={`Copy ${subject.toLowerCase()} as markdown`} /> : null,
    fork && (
      <ForkAction
        key="fork"
        label={fork.editPrompt ? "New session from this question, editing it" : "New session from this answer"}
        onFork={() => fork.onFork(fork.entryId, fork.editPrompt)}
        disabled={fork.disabled}
        busy={fork.forking}
      />
    ),
  ];
}

/**
 * One user turn as gigachad-bot's shared Q&A card (`@gigachad/chat-ui`): a collapsed header with a scrollable answer preview, or the turn's upstream nodes.
 *
 * - Collapsed: the upstream nodes are not mounted. Marker elements keep `data-message-index` for ChatMinimap's lookup
 * - Expanded: the question and the answer's nodes untouched, inside `TurnCardContext` so `MessageView` drops chrome the card replaces
 * - The newest turn starts expanded, older ones collapsed; the reader's choice sticks per session and turn
 * - A running turn stays expanded and has no actions, its streaming reply renders below the card
 */
export function QaTurn({ turnId, sessionId, cwd, onOpenFile, messages, userIndex, endIndex, live, fork, question, children }: TranscriptTurnProps) {
  const summary = useMemo(() => summarizeTurn(messages, userIndex, endIndex), [messages, userIndex, endIndex]);
  const choiceKey = `${sessionId ?? ""}:${turnId}`;
  const [choice, setChoice] = useState(() => expansionChoices.get(choiceKey));
  const [seenKey, setSeenKey] = useState(choiceKey);
  if (seenKey !== choiceKey) {
    setSeenKey(choiceKey);
    setChoice(expansionChoices.get(choiceKey));
  }
  const newest = endIndex === messages.length;
  const expanded = live || (choice ?? newest);

  const toggleRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  useEffect(() => {
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    toggleRef.current?.focus();
  }, [expanded]);
  const toggle = () => {
    restoreFocusRef.current = true;
    rememberChoice(choiceKey, !expanded);
    setChoice(!expanded);
  };

  const anchors = useMemo(() => {
    const indices: number[] = [];
    for (let idx = userIndex; idx < endIndex; idx++) {
      if (messages[idx].role === "user" || messages[idx].role === "assistant") indices.push(idx);
    }
    return indices;
  }, [messages, userIndex, endIndex]);

  if (!expanded) {
    const tools = summary.tools.map((tool) => ({ key: tool.name, label: tool.count > 1 ? `${tool.name} \u00d7${tool.count}` : tool.name }));
    return (
      <TurnCard expanded={false}>
        {anchors.map((idx) => <span key={idx} className="cf-turn-anchor" data-message-index={idx} aria-hidden="true" />)}
        <TurnHeader label={summary.label} onExpand={toggle} ref={toggleRef} />
        <TurnPreview tools={tools}>
          {summary.answer.trim() ? <SafeMarkdownBody className="gc-markdown-compact" cwd={cwd} onOpenFile={onOpenFile}>{summary.answer}</SafeMarkdownBody> : null}
        </TurnPreview>
      </TurnCard>
    );
  }

  const hasAnswer = Children.toArray(children).length > 0;
  return (
    <TurnCard expanded>
      <TurnCardContext.Provider value>
        <TurnRegion
          role="question"
          actions={live ? undefined : turnActions(summary.question, "Question", hasAnswer ? undefined : fork)}
          onCollapse={live ? undefined : toggle}
          collapseRef={toggleRef}
        >
          {question}
        </TurnRegion>
        {hasAnswer && (
          <TurnSurface>
            <TurnRegion role="answer" tail={summary.endsWithText ? "text" : "activity"} actions={live ? undefined : turnActions(summary.answer, "Answer", fork)}>
              {children}
            </TurnRegion>
          </TurnSurface>
        )}
      </TurnCardContext.Provider>
    </TurnCard>
  );
}

/** Turns the card shows: anchored by a typed prompt. A compaction summary or a branch summary is not one, those render as upstream does. */
export function isQaTurn({ messages, userIndex }: Pick<TranscriptTurnProps, "messages" | "userIndex">): boolean {
  const anchor = messages[userIndex];
  return anchor.role === "user" && !anchor.branchSummary;
}
