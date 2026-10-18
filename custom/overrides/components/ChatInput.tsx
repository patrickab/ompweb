"use client";

import { forwardRef, memo, useEffect, useMemo, useRef, useState, type ComponentPropsWithoutRef } from "react";
import { ChatInput as UpstreamChatInput, type AttachedImage, type ChatInputHandle } from "../../../components/ChatInput";
import { toast } from "@/components/ui/toast";
import { clearDraft, subscribeDraftRecovery } from "@/lib/draft-store";
import { selectableThinkingLevels } from "@/lib/thinking-levels";
import { isEmbedded } from "../../components/EmbedMode";
import { isShellConnected, onShellMessage, postToShell } from "../../embed/channel";
import type { ComposerImage } from "../../embed/protocol";

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
 * Upstream composer, driven by gigachad-bot's composer while embedded (`custom/theme/embed.css` hides this one).
 *
 * - Out: `composer` state (session, busy, model, thinking level) on change. `composer-restore` for what omp hands back to the input box
 * - In: `composer-send`, `composer-abort`, `composer-set-model`, `composer-set-thinking`, through the same props upstream's own controls call
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

  useEffect(() => {
    if (!isEmbedded()) return;
    const isForThisComposer = (target: string | null) => target === composerSessionId(propsRef.current.draftKey);
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
