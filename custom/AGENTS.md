# Fork rules (patrickab/ompweb)

Private fork of [kahme247/ompweb](https://github.com/kahme247/ompweb) with a large, growing UI customization.
Goal: rebase onto upstream at any time without merge conflicts. These rules win over the root `AGENTS.md` where they conflict.

## Principles

- Keep the diff against upstream as close to zero lines as possible. Add files, never edit upstream ones. All fork code lives in `custom/`
- Upstream edits are single-line seams only (an import, a bundler alias, a config entry) that redirect into `custom/`. Never rewrite upstream files in place
- Override through indirection: CSS cascade, module aliasing, wrapper components, extension points the framework already offers
- A change that can't be done at a seam: stop and ask whether it's worth the conflict risk or belongs in a wrapper
- Never touch protocol or session logic, it tracks omp versions: `lib/rpc-manager.ts`, `lib/omp/`, `lib/session-*.ts`, `hooks/useAgentSession.ts`, `app/api/`
- Deliver only the requested scope, propose further work instead of doing it

## Avoiding merge conflicts

The fork pays for every upstream line it changes on every rebase. Apply these in order, take the first that works.

1. **Drop before you change**: a feature gigachad-bot does not need is hidden, not rewritten. CSS in `custom/theme/` (`display: none` on a stable class hook) or embed mode (`html.cf-embed`). Hidden chrome costs no upstream lines and comes back by deleting one rule
2. **Adapt before you edit**: reach upstream behavior through what it already exposes, never by editing it. Upstream events (`OPEN_SESSION_EVENT`), callbacks handed to hooks (`useGlobalKeyboardShortcuts` options), component props (`onLeafChange`), URL state (`?session=`), existing DOM hooks (`.sidebar-settings-row`). Write the adapter in `custom/`
3. **Wrap before you replace**: an override that imports the upstream module and adds around it survives upstream changes to its body. A full replacement forks the file, use it only when wrapping cannot reach the behavior
4. **Seam last**: a new single upstream line only when nothing above works, each in its own commit and in "Seams in use"

- Never change ompweb's server API, protocol or session handling for gigachad-bot. gigachad-bot adapts to ompweb's API (`src/lib/omp_web.py`), not the other way round
- Type every upstream contact so an upstream change fails `tsc` instead of failing silently: import the upstream symbol, type props as `ComponentProps<typeof Upstream>`. CSS hooks cannot be typed, they go inert, list them under "Embedding"
- No new dependencies, no edits to `package.json` or `package-lock.json`
- One concern per commit. The body states `Seam:`, `Upstream contact:`, `On conflict:` and `On breakage:`, and the commit carries its own `custom/AGENTS.md` update
- Contracts shared with gigachad-bot (`custom/embed/protocol.ts`, `custom/theme/palette.css` embed tokens) change together with their gigachad-bot mirror, the protocol bumps `EMBED_PROTOCOL_VERSION`

## Git

- `main` mirrors `upstream/main`, fast-forward only: `git fetch upstream && git switch main && git merge --ff-only upstream/main && git push origin main`
- Work lives on `custom` as few single-purpose commits. Each seam gets its own commit, so a conflict stays one line in one commit
- `git rerere` is on. Rebase on upstream releases, not every push: `git switch custom && git rebase main && git push --force-with-lease origin custom`
- `upstream` has push URL `no-push`. Never commit or push unless asked

## Seams in use

Every upstream line the fork changes. Keep this table complete, it is the rebase checklist.

| Upstream file | Seam | Points at |
|---|---|---|
| `app/layout.tsx` | `import { CustomRoot } from "@/custom/root";` after `import "./globals.css";` | `custom/root.tsx` (theme CSS + root components) |
| `app/layout.tsx` | `<CustomRoot />` after `{children}` in `<body>` | `custom/root.tsx` |
| `next.config.ts` | `import { withCustom } from "./custom/next.config";` | `custom/next.config.ts` |
| `next.config.ts` | `export default withCustom(nextConfig);` | module overrides, see below |
| `AGENTS.md` | pointer line at the top | this file |

## Extension points

- **Styling**: CSS in `custom/theme/`, see "Theme layer"
- **Replace an upstream module**: add a file at the same path under `custom/overrides/`, e.g. `custom/overrides/components/ThemeSwitcher.tsx` replaces `components/ThemeSwitcher.tsx`. Keep its exports' names and signatures. `custom/next.config.ts` picks it up (Turbopack alias for `next dev`, webpack replacement for `next build`), restart the dev server after adding one
- **Wrap an upstream module**: the replacement imports the original by a relative path (`../../../components/X`), which neither bundler redirects. Never `@/components/X` or `./X`, those resolve back to the replacement. Type its props as `ComponentProps<typeof UpstreamX>`, so an upstream prop change fails `tsc`
- **Add app-wide behavior**: render it from `CustomRoot` in `custom/root.tsx`, e.g. `SelectEnhancer`, which gives every native `<select>` a styled listbox under a mouse (touch keeps the native picker)

Current overrides: `ThemeSwitcher` (light/dark toggle instead of the 15-theme menu), `LanguageSwitcher` (removed), `hooks/useKeyboardShortcuts` (wraps, embedded `new-session`), `BranchNavigator` (wraps, embedded branch tree), `ChatInput` (wraps, embedded composer bridge).

## Embedding (gigachad-bot)

gigachad-bot frames this app as its chat and settings surface.

- **Framing**: `OMP_WEB_FRAME_ANCESTORS` (space or comma separated origins, e.g. `http://127.0.0.1:2999`) lets those origins frame every page: CSP `frame-ancestors 'self' <origins>`, no `X-Frame-Options: DENY` (`custom/framing.ts`). Unset keeps upstream's headers. `/api/files` keeps `SAMEORIGIN`, so DOCX/PDF previews stay blank inside a frame
- `next build` bakes headers into `.next`, so the value only takes effect after a build. `./run.sh` rebuilds when it differs from the last build (`.next/cf-frame-ancestors`), `npm run dev` reads it at start
- **Embed mode**: inside a frame, `EmbedMode` (`custom/components/EmbedMode.tsx`) adds `html.cf-embed` before hydration and `custom/theme/embed.css` hides ompweb's sidebar, topbar, file panel, Settings Back/close and the composer's input box. Hooks: `#workspace-sidebar`, `.sidebar-resize-handle`, `.shell-topbar`, `.right-panel-*`, `.settings-header .settings-back`, `.settings-close-btn`, `.chat-input-shell`. A renamed hook brings that chrome back inside gigachad-bot
- **Bridge**: `EmbedBridge` talks to the shell over postMessage, protocol in `custom/embed/protocol.ts`, mirrored in gigachad-bot `src/frontend/features/omp/protocol.ts`. Change both and bump `EMBED_PROTOCOL_VERSION`
  - In: `open-session` dispatches upstream's `OPEN_SESSION_EVENT` (`lib/notification-client.ts`, the notification-click path). `new-session` calls the callback AppShell hands `useGlobalKeyboardShortcuts` (Ctrl+Alt+N), via the wrapper `custom/overrides/hooks/useKeyboardShortcuts.ts`. `open-settings` clicks the hidden `.sidebar-settings-row`. `set-theme` uses `useTheme`
  - Out: `view` (session id from `?session=`, Settings open = `#workspace-sidebar` absent, polled every 400ms) and `key` for the shortcuts the shell lists in `hello` (Alt+T, Alt+W, ...)
  - Trust: only the parent window, origin fixed by `hello`. CSP `frame-ancestors` already limits the parent to the configured origins
- **Branch tree**: `custom/overrides/components/BranchNavigator.tsx` wraps upstream. Embedded, it posts `branch-tree` (message previews only) whenever AppShell's tree or active leaf changes, and applies `select-leaf` through upstream's `onLeafChange`. Its props are `ComponentProps<typeof UpstreamBranchNavigator>`
- **Composer**: gigachad-bot's composer and model selector replace ompweb's. `custom/overrides/components/ChatInput.tsx` wraps upstream and keeps it mounted but hidden, so ChatWindow's send path (optimistic turn, SSE connect, queue, new session) stays upstream's
  - Out: `composer` (session from `draftKey`, `isStreaming`, `model`, `thinkingLevel` and the levels upstream's reasoning menu lists) on change. `composer-restore` for every `recoverDraft` on this composer's key (abort withdrew queued messages, queue panel Edit): the wrapper hands it over, clears the draft and remounts the hidden input box empty (`key`)
  - In: `composer-send` submits like the input box: `onBuiltinCommand` for `/…`, `onFollowUp` while busy, else `onSend` (which also runs `!`/`!!` shell commands). `composer-abort` calls `onAbort`, `composer-set-model` `onModelChange`, `composer-set-thinking` `onThinkingLevelChange`. Each names its session, a composer for another one ignores it
  - Autocomplete: `composer-complete` is answered with `composer-completions` (`custom/embed/completions.ts`). A `/word` draft lists the session's `slashCommands` (extensions, prompts, skills, never builtins) ranked with upstream's `slashMatchRank`, loading them once per key through `onLoadSlashCommands`. An `@` token lists files from `/api/file-index` with `lib/file-fuzzy.ts`, inserted like upstream's `applyAtCompletion`
  - Lost in embed: word prediction, fast/slow pickers, steer-or-queue choice, builtin commands in the menu (typed ones still run)
  - On breakage: a renamed `ChatInput` prop or `file-fuzzy`/`ChatInput-slash-commands` helper fails `tsc` (props are `ComponentPropsWithoutRef<typeof UpstreamChatInput>`). Upstream logic added to the input box's own submit or menus is not mirrored, compare `handleSend`, `filteredSlashCommands` and `applyAtCompletion` in `components/ChatInput.tsx` on rebase. A changed `/api/file-index` response empties the file list. Text upstream puts back into the input box any other way than `recoverDraft` stays hidden

## Theme layer (`custom/theme/`)

- `palette.css`: role colors `--cf-*` per mode, the only place colors are defined. Light applies to every theme, dark to `.dark`/`.omp`
  - Embedded (`html.cf-embed`) it switches to gigachad-bot's role tokens (`src/frontend/app/globals.css`), so the frame blends into the shell. Change both together
- `tokens.css`: upstream tokens (`--bg`, `--text`, `--accent`, radii, shadows, fonts) derived from the palette
- `base.css`: page type, focus, switching off upstream decoration. Then one file per surface (`shell.css`, `chat.css`, ...)
- Register CSS in `index.ts`, never through CSS `@import`: Turbopack does not track `@import`ed files and keeps serving stale CSS, even across restarts
- Token files use `:root:root` (0,2,0) to outrank upstream theme blocks (0,1,1). Surface rules win ties by import order
- Select only upstream class hooks and stable, unlocalized attributes (e.g. `svg[aria-label="omp logo"]`). Never visible text, `nth-child` or localized `title`/`aria-label`. A rule whose hook disappears goes inert instead of breaking
- Upstream styles mostly inline: overriding them needs `!important`, keep those rules narrow
- Design rules: `~/git/cool-frog/frontend/AGENTS.md`. No decoration, neutral chrome, Outfit, panels 16px
- Mobile (<= 640px) keeps upstream layout unless a change targets it

## Cannot be done at a seam

Decide case by case, these cost conflict risk or maintenance:

- Inline layout styles: CSS `!important` only
- New theme ids or theme lists: `hooks/useTheme.ts` plus the pre-paint script in `app/layout.tsx`
- Markup inside an upstream component: replacing it via alias forks the whole file, diff it against upstream on every rebase
- Dependencies: `package-lock.json` conflicts, vendor assets into `custom/` instead
- Tailwind utilities in `custom/` TSX: needs `@source "../custom";` in `app/globals.css`

## After a rebase

1. Re-check every row of "Seams in use"
2. `npm run dev`, inspect light and dark, desktop and 390px wide. A hook upstream renamed shows up as upstream styling returning
3. `node_modules/.bin/tsc --noEmit` and `npx eslint custom`

## Run

- `./run.sh`: production on 30177, rebuilds when a source file is newer than the last build
  - Drops `.next/cache` first when `next.config.ts`, `custom/next.config.ts` or `custom/overrides/` changed: webpack's persistent cache keeps resolving the old replacement ("Can't resolve '../../../components/…'")
- `npm run dev`: hot reload on 30178. `rm -rf .next` when switching from a build to dev
