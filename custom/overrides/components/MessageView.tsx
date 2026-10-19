"use client";

import { useContext, type ComponentProps } from "react";
import { MessageView as UpstreamMessageView } from "../../../components/MessageView";
import { TurnCardContext } from "../../components/turn-card";

export * from "../../../components/MessageView";

type Props = ComponentProps<typeof UpstreamMessageView>;


/** Keep upstream messages intact, replacing only the actions owned by the enclosing Q&A card. */
export function MessageView(props: Props) {
  const inCard = useContext(TurnCardContext);
  // Message metadata also drives thinking/tool timing and speech identity. Never rewrite it for presentation.
  if (!inCard) return <UpstreamMessageView {...props} />;
  return <UpstreamMessageView {...props} showTimestamp={false} onFork={undefined} onNavigate={undefined} onEditContent={undefined} />;
}
