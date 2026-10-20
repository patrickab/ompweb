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
- No new dependencies or package manifest/lock changes without explicit approval. Approved exception: `@gigachad/chat-ui` and its rendering dependencies, plus registering `custom/*.test.mjs` in the test command.
- One concern per commit. The body states `Seam:`, `Upstream contact:`, `On conflict:` and `On breakage:`, and the commit carries its own `custom/AGENTS.md` update
- Contracts shared with gigachad-bot (postMessage protocol, embed palette values) live in its `@gigachad/chat-ui` package (`@gigachad/chat-ui/protocol`, `@gigachad/chat-ui/palette.css`), never as copies here. A protocol change bumps `EMBED_PROTOCOL_VERSION` there and ships as a new tarball

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
| `components/ChatWindow.tsx` | import `custom/components/TranscriptTurn`, wrap planned turn nodes, opt into `groupPlainTurns`, wrap the history selector in `FullHistory` | embedded Q&A presentation and existing full-history callback, refs/history/fork behavior retained |
| `lib/chat-transcript-plan.ts` | optional `PlanOptions.groupPlainTurns` and its grouping condition | keeps plain Q&A indivisible at history page boundaries, default planner behavior unchanged |
| `components/MessageView.tsx` | `message-user-footer`, `message-assistant-footer` and `message-model-label` class hooks | embedded-only chrome hiding in `custom/theme/chat-ui.css` |
| `package.json`, `package-lock.json` | local `@gigachad/chat-ui` artifact and `custom/*.test.mjs` test registration | approved shared conversation UI dependency and integration regression coverage |

## Extension points

- **Styling**: CSS in `custom/theme/`, see "Theme layer"
- **Replace an upstream module**: add a file at the same path under `custom/overrides/`, e.g. `custom/overrides/components/ThemeSwitcher.tsx` replaces `components/ThemeSwitcher.tsx`. Keep its exports' names and signatures. `custom/next.config.ts` picks it up (Turbopack alias for `next dev`, webpack replacement for `next build`), restart the dev server after adding one
- **Wrap an upstream module**: the replacement imports the original by a relative path (`../../../components/X`), which neither bundler redirects. Never `@/components/X` or `./X`, those resolve back to the replacement. Type its props as `ComponentProps<typeof UpstreamX>`, so an upstream prop change fails `tsc`
- **Add app-wide behavior**: render it from `CustomRoot` in `custom/root.tsx`, e.g. `SelectEnhancer`, which gives every native `<select>` a styled listbox under a mouse (touch keeps the native picker)

Current overrides: `ThemeSwitcher` (light/dark toggle), `LanguageSwitcher` (removed), `hooks/useKeyboardShortcuts` (embedded new session), `BranchNavigator` (embedded branch tree), `ChatInput` (embedded composer), `MessageView` (card-owned actions), `MarkdownBody` (shared conversation rendering) and `ChatWindow` (embedded file links open in the shell). Each wraps upstream.

## Embedding (gigachad-bot)

gigachad-bot frames this app as its chat and settings surface.

- **Framing**: `OMP_WEB_FRAME_ANCESTORS` (space or comma separated origins, e.g. `http://127.0.0.1:2999`) lets those origins frame every page: CSP `frame-ancestors 'self' <origins>`, no `X-Frame-Options: DENY` (`custom/framing.ts`). Unset keeps upstream's headers. `/api/files` keeps `SAMEORIGIN`, so DOCX/PDF previews stay blank inside a frame
- `next build` bakes headers into `.next`, so the value only takes effect after a build. `./run.sh` rebuilds when it differs from the last build (`.next/cf-frame-ancestors`), `npm run dev` reads it at start
- **Embed mode**: inside a frame, `EmbedMode` (`custom/components/EmbedMode.tsx`) adds `html.cf-embed` before hydration and `custom/theme/embed.css` hides ompweb's sidebar, topbar, file panel, Settings Back/close and the composer's input box. Hooks: `#workspace-sidebar`, `.sidebar-resize-handle`, `.shell-topbar`, `.right-panel-*`, `.settings-header .settings-back`, `.settings-close-btn`, `.chat-input-shell`. A renamed hook brings that chrome back inside gigachad-bot
- **Bridge**: `EmbedBridge` talks to the shell over postMessage (`custom/embed/channel.ts`), protocol from gigachad-bot's package as `@gigachad/chat-ui/protocol`. Change it there and bump `EMBED_PROTOCOL_VERSION`
  - In: `open-session` dispatches upstream's `OPEN_SESSION_EVENT` (`lib/notification-client.ts`, the notification-click path). `new-session` calls the callback AppShell hands `useGlobalKeyboardShortcuts` (Ctrl+Alt+N), via the wrapper `custom/overrides/hooks/useKeyboardShortcuts.ts`. `open-settings` clicks the hidden `.sidebar-settings-row`. `set-theme` uses `useTheme`
  - Out: `view` (session id from `?session=`, Settings open = `#workspace-sidebar` absent, polled every 400ms) and `key` for the shortcuts the shell lists in `hello` (Alt+T, Alt+W, ...)
  - Trust: only the parent window, origin fixed by `hello`. CSP `frame-ancestors` already limits the parent to the configured origins
- **Branch tree**: `custom/overrides/components/BranchNavigator.tsx` wraps upstream. Embedded, it posts `branch-tree` (message previews only) whenever AppShell's tree or active leaf changes, and applies `select-leaf` through upstream's `onLeafChange`. Its props are `ComponentProps<typeof UpstreamBranchNavigator>`
- **File links**: `custom/overrides/components/ChatWindow.tsx` wraps upstream and, embedded, replaces its `onOpenFile` with posting `open-file` (absolute path, relative tool paths resolved against the session cwd by `custom/embed/open-file.ts`), so every file link of the conversation (markdown, Q&A cards, tool output, /btw) opens in gigachad-bot's floating file view instead of the hidden file panel. Standalone passes upstream's callback through. Its props are `ComponentProps<typeof UpstreamChatWindow>`, a renamed `onOpenFile` fails `tsc`
- **Composer**: gigachad-bot's composer and model selector replace ompweb's. `custom/overrides/components/ChatInput.tsx` wraps upstream and keeps it mounted but hidden, so ChatWindow's send path (optimistic turn, SSE connect, queue, new session) stays upstream's
  - Out: `composer` (session from `draftKey`, `isStreaming`, `model`, `thinkingLevel` and the levels upstream's reasoning menu lists) on change. `composer-restore` for every `recoverDraft` on this composer's key (abort withdrew queued messages, queue panel Edit): the wrapper hands it over, clears the draft and remounts the hidden input box empty (`key`)
  - In: `composer-send` submits like the input box: `onBuiltinCommand` for `/…`, `onFollowUp` while busy, else `onSend` (which also runs `!`/`!!` shell commands). `composer-abort` calls `onAbort`, `composer-set-model` `onModelChange`, `composer-set-thinking` `onThinkingLevelChange`. Each names its session, a composer for another one ignores it
  - Autocomplete: `composer-complete` is answered with `composer-completions` (`custom/embed/completions.ts`). A `/word` draft lists the session's `slashCommands` (extensions, prompts, skills, never builtins) ranked with upstream's `slashMatchRank`, loading them once per key through `onLoadSlashCommands`. An `@` token lists files from `/api/file-index` with `lib/file-fuzzy.ts`, inserted like upstream's `applyAtCompletion`
  - Lost in embed: word prediction, fast/slow pickers, steer-or-queue choice, builtin commands in the menu (typed ones still run)
  - On breakage: a renamed `ChatInput` prop or `file-fuzzy`/`ChatInput-slash-commands` helper fails `tsc` (props are `ComponentPropsWithoutRef<typeof UpstreamChatInput>`). Upstream logic added to the input box's own submit or menus is not mirrored, compare `handleSend`, `filteredSlashCommands` and `applyAtCompletion` in `components/ChatInput.tsx` on rebase. A changed `/api/file-index` response empties the file list. Text upstream puts back into the input box any other way than `recoverDraft` stays hidden

- **Q&A cards**: `custom/components/TranscriptTurn.tsx` receives typed turn boundaries, rendered question/answer nodes, file-link context and upstream fork state from `ChatWindow`. Embedded user turns become `QaTurn` cards, standalone and non-user anchors return the original nodes. `QaTurn` composes gigachad-bot's shared turn components (`TurnCard`, `TurnHeader`, `TurnPreview`, `TurnRegion`, `TurnSurface`, `CopyAction`, `ForkAction` from `@gigachad/chat-ui`), so the cards render and look exactly like gigachad's local chat. Never restyle them here, change the package. `groupPlainTurns` keeps text-only turns together before upstream history windowing. `FullHistory` invokes the existing `togglePreCompactionHistory` callback once for a loaded compacted view, including available earlier messages automatically embedded. It retains the native selector standalone. History loading, activity folding, tool/thinking rendering and streaming stay upstream-owned.
  - Older turns start collapsed with an always-visible answer preview capped at 12.5vh and tool names. Only the header toggles, so preview scrolling and selection do not expand the card. User choices survive paging by session/entry id.
  - Copy uses original question/answer markdown, excluding reasoning and tool results. Fork invokes upstream's resolved target/callback and respects its busy state. There is no delete action: persisted message deletion is unsupported by OMP and is explicitly deferred. Never rewrite JSONL behind a live session.
  - `MessageView` keeps messages intact and suppresses only callbacks owned by the card. `custom/theme/chat-ui.css` maps the package's role tokens and hides native copy/footer/model chrome through `.message-copy-actions`, `.message-user-footer`, `.message-assistant-footer`, `.message-model-label`, `.chat-message-card`, `.chat-message` and `.message-overflow-toggle`. Renamed hooks restore redundant chrome rather than change session behavior.
- **Shared conversation UI**: canonical source is gigachad-bot `src/frontend/packages/chat-ui/` (`@gigachad/chat-ui`: turn components, `turn.css`, markdown renderer, `markdown.css`, `palette.css`, `protocol`). The shell consumes that source, this fork installs the versioned `custom/vendor/gigachad-chat-ui-<version>.tgz` artifact. No sibling checkout is required at install or runtime. Bump its version for shipped changes, then from the shell's `src/frontend` run `npm run sync:ompweb`: it packs the tarball here, removes older ones and installs it (manifest and lock). `npm run check:ompweb` detects a stale artifact. Commit manifest, lock and artifact together.
  - `EmbeddedMarkdown` uses the shared Streamdown/KaTeX pipeline and upstream file/agent/GitHub link helpers, lightbox and code renderers. `MarkdownBody`'s typed wrapper selects embedded conversation text (`undefined` / `markdown-user-message` class); other classes and standalone retain upstream rendering. A new class fails closed to upstream. Compare the adapter's link/image policy with upstream `MarkdownBody` on rebase.
  - Verify both apps' typechecks, `custom/*.test.mjs`, upstream message/markdown/fork/transcript tests and shell rendering tests. Check actual embedded history paging, card focus/preview scrolling, tab switching and standalone layout after serving matching sources. Do not fork or prompt in existing sessions to test actions.

## Theme layer (`custom/theme/`)

- `palette.css`: role colors `--cf-*` per mode, the only place colors are defined. Light applies to every theme, dark to `.dark`/`.omp`
  - Embedded (`html.cf-embed`) it switches to gigachad-bot's role colors, the `--gc-<mode>-*` values from `@gigachad/chat-ui/palette.css` (imported in `index.ts`), so the frame blends into the shell. Change values in the package, never here
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
