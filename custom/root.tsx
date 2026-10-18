import "./theme";
import { SelectEnhancer } from "./components/SelectEnhancer";

/** Everything the fork mounts once at the app root, rendered by app/layout.tsx. */
export function CustomRoot() {
  return <SelectEnhancer />;
}
