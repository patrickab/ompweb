"use client";

import { forwardRef, memo, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { ChatInput as UpstreamChatInput, type AttachedImage, type ChatInputHandle } from "../../../components/ChatInput";
import { toast } from "@/components/ui/toast";
import { clearDraft, subscribeDraftRecovery } from "@/lib/draft-store";
import { selectableThinkingLevels } from "@/lib/thinking-levels";
import { isEmbedded } from "../../components/EmbedMode";
import { isShellConnected, onShellMessage, postToShell } from "../../embed/channel";
import { commandCompletions, fileCompletions, slashQueryOf } from "../../embed/completions";
import type { Completion, ComposerImage } from "../../embed/protocol";
import type { SlashCommandInfo } from "@/hooks/useAgentSession";

export * from "../../../components/ChatInput";

type Props = ComponentPropsWithoutRef<typeof UpstreamChatInput>;

/** Session the composer belongs to: ChatWindow's `draftKey` is the session id, or `new:<cwd>` on the new-session screen. */
function composerSessionId(draftKey: string | undefined): string | null {
  return draftKey && !draftKey.startsWith("new:") ? draftKey : null;
}

function toAttachedImage(image: ComposerImage): AttachedImage {
  return { ...image, previewUrl: `data:${image.mimeType};base64,${image.data}` };
}

/** Submit like upstream's composer: a client builtin (`/btw`, ...) first, then a prompt, a follow-up while the agent is busy. */
async function submitLikeComposer(props: Props, text: string, images: AttachedImage[]) {
  const message = text.trim();
  if (!message && images.length === 0) return;
  if (images.length === 0 && message.startsWith("/") && props.onBuiltinCommand) {
    if ((await props.onBuiltinCommand(message)).handled) return;
  }
  if (props.isStreaming) {
    await props.onFollowUp?.(message, images);
    return;
  }
  props.onSend(message, images.length > 0 ? images : undefined);
}

/**
 * Completions for the shell's draft: omp commands for a `/word` draft, else files for an `@` token before the caret.
 *
 * - `loadCommands` runs only when the session reported no commands yet, the way upstream's menu asks once per open
 * - No `cwd` (new session without a directory): no file completions, like upstream
 */
async function completionsFor(props: Props, text: string, caret: number, loadCommands: () => Promise<SlashCommandInfo[]>): Promise<Completion[]> {
  const slashQuery = slashQueryOf(text);
  if (slashQuery !== null) {
    const commands = props.slashCommands?.length ? props.slashCommands : await loadCommands();
    return commandCompletions(commands, text, slashQuery);
  }
  if (!props.cwd) return [];
  return (await fileCompletions(props.cwd, text, caret)) ?? [];
}

/**
 * Upstream composer, driven by gigachad-bot's composer while embedded (`custom/theme/embed.css` hides this one).
 *
 * - Out: `composer` state (session, busy, model, thinking level) on change. `composer-restore` for what omp hands back to the input box
 * - In: `composer-send`, `composer-abort`, `composer-set-model`, `composer-set-thinking`, through the same props upstream's own controls call
 * - `composer-complete` is answered with `composer-completions` (commands, `@` files)
 * - Standalone: upstream unchanged
 */
export const ChatInput = memo(forwardRef<ChatInputHandle, Props>(function ChatInput(props, ref) {
  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; });
  const sessionId = composerSessionId(props.draftKey);
  const { isStreaming, availableThinkingLevels } = props;
  const provider = props.model?.provider;
  const modelId = props.model?.modelId;
  const thinkingLevel = props.thinkingLevel ?? "auto";
  // Upstream shows the reasoning menu only with a change handler, listing `selectableThinkingLevels`.
  const hasThinkingMenu = Boolean(props.onThinkingLevelChange);
  const thinkingLevels = useMemo(
    () => (hasThinkingMenu ? selectableThinkingLevels(availableThinkingLevels) : []),
    [hasThinkingMenu, availableThinkingLevels],
  );

  useEffect(() => {
    if (!isEmbedded()) return;
    const model = provider && modelId ? { provider, modelId } : null;
    postToShell({ type: "composer", sessionId, streaming: isStreaming, model, thinkingLevel, thinkingLevels });
  }, [sessionId, isStreaming, provider, modelId, thinkingLevel, thinkingLevels]);

  // One command load per composer key: a session without commands must not reload on every keystroke.
  const commandsRequestedForRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isEmbedded()) return;
    const isForThisComposer = (target: string | null) => target === composerSessionId(propsRef.current.draftKey);
    const loadCommands = async () => {
      const { draftKey, onLoadSlashCommands } = propsRef.current;
      if (!onLoadSlashCommands || commandsRequestedForRef.current === draftKey) return [];
      commandsRequestedForRef.current = draftKey;
      return onLoadSlashCommands();
    };
    const unsubscribers = [
      onShellMessage("composer-send", (message) => {
        if (!isForThisComposer(message.sessionId)) return;
        submitLikeComposer(propsRef.current, message.text, message.images.map(toAttachedImage))
          .catch((error: unknown) => toast.error(error instanceof Error ? error.message : String(error)));
      }),
      onShellMessage("composer-abort", (message) => {
        if (isForThisComposer(message.sessionId)) propsRef.current.onAbort();
      }),
      onShellMessage("composer-set-model", (message) => {
        if (isForThisComposer(message.sessionId)) propsRef.current.onModelChange?.(message.provider, message.modelId);
      }),
      onShellMessage("composer-set-thinking", (message) => {
        if (isForThisComposer(message.sessionId)) propsRef.current.onThinkingLevelChange?.(message.level);
      }),
      onShellMessage("composer-complete", ({ sessionId: target, requestId, text, caret }) => {
        if (!isForThisComposer(target)) return;
        const answer = (items: Completion[]) => postToShell({ type: "composer-completions", sessionId: target, requestId, items });
        completionsFor(propsRef.current, text, caret, loadCommands).then(answer, () => answer([]));
      }),
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  // A recovery (abort withdrew queued messages, queue Edit) goes to the shell. The hidden input box got it too:
  // drop its draft and remount it empty, so it never resurfaces there.
  const [hiddenInputGeneration, setHiddenInputGeneration] = useState(0);
  useEffect(() => {
    if (!isEmbedded()) return;
    return subscribeDraftRecovery((key, recovery) => {
      if (key !== propsRef.current.draftKey || !isShellConnected()) return;
      const { text, replace = null, images = [] } = recovery;
      postToShell({ type: "composer-restore", sessionId: composerSessionId(key), text, replace, images });
      clearDraft(key);
      setHiddenInputGeneration((generation) => generation + 1);
    });
  }, []);

  return <UpstreamChatInput key={hiddenInputGeneration} ref={ref} {...props} />;
}));
