"use client";

import type { MouseEvent } from "react";
import { Moon, Sun } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useTheme } from "@/hooks/useTheme";
import { useI18n } from "@/lib/i18n";

/** Light/dark toggle replacing upstream's theme menu, the icon shows the mode it switches to. */
export function ThemeSwitcher() {
  const { isDark, setTheme } = useTheme();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const label = t(isDark ? "appShell.switchToLightMode" : "appShell.switchToDarkMode");
  const toggle = (event: MouseEvent<HTMLButtonElement>) => setTheme(isDark ? "light" : "dark", { x: event.clientX, y: event.clientY });

  return (
    <button type="button" onClick={toggle} title={label} aria-label={label} className="shell-toolbar-btn ui-focus-ring" style={{ minWidth: isMobile ? 44 : undefined }}>
      {isDark ? <Sun size={16} strokeWidth={1.8} aria-hidden="true" /> : <Moon size={16} strokeWidth={1.8} aria-hidden="true" />}
    </button>
  );
}
