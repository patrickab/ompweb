"use client";

import { forwardRef, memo, useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { ChatInput as UpstreamChatInput, type AttachedImage, type ChatInputHandle } from "../../../components/ChatInput";
import { toast } from "@/components/ui/toast";
import { isEmbedded } from "../../components/EmbedMode";
import { onShellMessage, postToShell } from "../../embed/channel";
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
 * - Out: `composer` state (session, busy, model) on change
 * - In: `composer-send`, `composer-abort`, `composer-set-model`, through the same props upstream's own controls call
 * - Standalone: upstream unchanged
 */
export const ChatInput = memo(forwardRef<ChatInputHandle, Props>(function ChatInput(props, ref) {
  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; });
  const sessionId = composerSessionId(props.draftKey);
  const { isStreaming } = props;
  const provider = props.model?.provider;
  const modelId = props.model?.modelId;

  useEffect(() => {
    if (!isEmbedded()) return;
    const model = provider && modelId ? { provider, modelId } : null;
    postToShell({ type: "composer", sessionId, streaming: isStreaming, model });
  }, [sessionId, isStreaming, provider, modelId]);

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
    ];
    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, []);

  return <UpstreamChatInput ref={ref} {...props} />;
}));
