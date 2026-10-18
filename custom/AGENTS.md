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

## Git

- `main` mirrors `upstream/main`, fast-forward only: `git fetch upstream && git switch main && git merge --ff-only upstream/main && git push origin main`
- Work lives on `custom` as few single-purpose commits. Each seam gets its own commit, so a conflict stays one line in one commit
- `git rerere` is on. Rebase on upstream releases, not every push: `git switch custom && git rebase main && git push --force-with-lease origin custom`
- `upstream` has push URL `no-push`. Never commit or push unless asked

## Seams in use

Every upstream line the fork changes. Keep this table complete, it is the rebase checklist.

| Upstream file | Seam | Points at |
|---|---|---|
| `app/layout.tsx` | `import "@/custom/theme";` after `import "./globals.css";` | `custom/theme/index.ts` |
| `next.config.ts` | `import { withCustom } from "./custom/next.config";` | `custom/next.config.ts` |
| `next.config.ts` | `export default withCustom(nextConfig);` | module overrides, see below |
| `AGENTS.md` | pointer line at the top | this file |

## Extension points

- **Styling**: CSS in `custom/theme/`, see "Theme layer"
- **Replace an upstream module**: add a file at the same path under `custom/overrides/`, e.g. `custom/overrides/components/ThemeSwitcher.tsx` replaces `components/ThemeSwitcher.tsx`. Keep its exports' names and signatures. `custom/next.config.ts` picks it up (Turbopack alias for `next dev`, webpack replacement for `next build`), restart the dev server after adding one. A replacement can't import the module it replaces

Current overrides: none.

## Theme layer (`custom/theme/`)

- `palette.css`: role colors `--cf-*` per mode, the only place colors are defined. Light applies to every theme, dark to `.dark`/`.omp`
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
- `npm run dev`: hot reload on 30178. `rm -rf .next` when switching from a build to dev
