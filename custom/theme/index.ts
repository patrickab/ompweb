// Fork theme, imported once by custom/root.tsx, which app/layout.tsx imports after globals.css.
//
// - palette.css: role colors per mode, tokens.css: upstream tokens from them, base.css: page-wide rules
// - One CSS file per surface after that, add new surfaces as new files here. Surface rules win ties with upstream
//   because Next keeps CSS in import order and layout.tsx imports this after globals.css
// - Import CSS from here, never via CSS @import: Turbopack does not track @import'ed files, edits would not rebuild
import "./fonts.css";
import "./palette.css";
import "./tokens.css";
import "./base.css";
import "./shell.css";
import "./new-session.css";
import "./chat.css";
import "./settings.css";
import "./overlays.css";
import "./select.css";
import "./embed.css";