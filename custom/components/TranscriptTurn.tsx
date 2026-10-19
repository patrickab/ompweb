"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { AgentMessage } from "@/lib/types";
import { QaTurn, isQaTurn } from "./QaTurn";
import { useIsEmbedded } from "./useIsEmbedded";
import type { useAgentSession } from "@/hooks/useAgentSession";

/** Branch point of a turn's reply and how to fork there: the `resolveForkTargets` target plus ChatWindow's fork state. */
export interface TranscriptTurnFork {
  entryId: string;
  editPrompt: boolean;
  onFork: (entryId: string, editPrompt: boolean) => void;
  /** This fork is in flight. */
  forking: boolean;
  /** Any fork is in flight. */
  disabled: boolean;
}

export interface TranscriptTurnProps {
  /** Stable across history loads: the prompt's entry id, else its message index. */
  turnId: string;
  sessionId: string | undefined;
  cwd?: string;
  onOpenFile?: (filePath: string) => void;
  /** The whole committed transcript; the turn is `[userIndex, endIndex)`, its anchor first. */
  messages: readonly AgentMessage[];
  userIndex: number;
  endIndex: number;
  /** The run is still going: the turn renders flat and its streaming reply sits below it. */
  live: boolean;
  /** Offered only while the session is idle, as on a message row. */
  fork?: TranscriptTurnFork;
  /** The anchor message, rendered. */
  question: ReactNode;
  /** The rest of the turn, rendered. */
  children?: ReactNode;
}

/** Render embedded Q&A cards around upstream nodes, leaving standalone layout unchanged. */
export function TranscriptTurn(props: TranscriptTurnProps) {
  const embedded = useIsEmbedded();
  return embedded && isQaTurn(props) ? <QaTurn {...props} /> : <>{props.question}{props.children}</>;
}

type FullHistoryProps = Pick<ReturnType<typeof useAgentSession>, "loading" | "error" | "showPreCompactionHistory" | "togglePreCompactionHistory"> & {
  hasCompaction: boolean;
  children: ReactNode;
};

/** Open the existing full-history view embedded, retaining the native selector standalone. */
export function FullHistory({ loading, error, hasCompaction, showPreCompactionHistory, togglePreCompactionHistory, children }: FullHistoryProps) {
  const embedded = useIsEmbedded();
  const requested = useRef(false);
  useEffect(() => {
    if (showPreCompactionHistory) {
      requested.current = false;
    } else if (embedded && hasCompaction && !loading && !error && !requested.current) {
      requested.current = true;
      togglePreCompactionHistory();
    }
  }, [embedded, hasCompaction, loading, error, showPreCompactionHistory, togglePreCompactionHistory]);
  return embedded ? null : children;
}
