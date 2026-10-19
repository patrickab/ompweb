import { createContext } from "react";

/**
 * True below a Q&A card (`custom/components/QaTurn.tsx`).
 *
 * The card owns copy, fork and the layout around messages, so `custom/overrides/components/MessageView.tsx`
 * drops the matching upstream chrome (fork button, timestamp, model label, edit-from-here) for messages rendered inside it.
 */
export const TurnCardContext = createContext(false);
