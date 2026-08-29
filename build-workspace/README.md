# build-workspace

A [bashbuild](../../bashbuild) workspace for Lily's Music Studio. The
filesystem layout is the build graph; every script runs with the working
directory at this folder, and exit code is truth.

```sh
# from the bashbuild repo:
uv run bashbuild ../lilys-music-studio/build-workspace
# or from here:
uv run --project ../../bashbuild bashbuild .
```

## Components

| Component            | Depends on      | Produces                                          |
| -------------------- | --------------- | ------------------------------------------------- |
| `studio-latest`      | —               | `build/studio-latest/web/universal-release/dist/`  |
| `netlify-deployment` | `studio-latest` | A production deploy to Netlify (+ deploy receipt) |

### studio-latest

- **source** — rsyncs this repo (the parent of `build-workspace/`), excluding
  `build-workspace`, `node_modules`, `dist` and `.git`. Nothing else is pulled
  in: the app is fully static and vendors its own assets, so there is no
  sibling workspace to build first.
- **build** (`web/universal-release`) — `npm ci && npm run build` (which is
  `tsc -b && vite build`), then copies `dist/` into the build output.

### netlify-deployment

- **source** — stages `studio-latest`'s `dist/`.
- **build** (`web/universal-release`) — `netlify deploy --prod` of that `dist/`.
  Requires the Netlify CLI installed and authenticated. The target site is
  **pinned** in `run.sh` (`SITE_ID=95a0cd35-e5b8-481f-9374-fc4854b73c85`) and
  passed via `--site` on every deploy, so it can never go to another site; a
  mismatching `NETLIFY_SITE_ID` is rejected. Change that one line if the site
  is ever recreated.

## Secrets

`NETLIFY_AUTH_TOKEN` is declared in the manifest, so bashbuild prompts for it
(hidden) before the TUI starts and exports it for the deploy script.

Pressing Enter skips it, which leaves the variable **unset** rather than empty —
so the CLI falls back to the credentials from `netlify login`, which is how the
sibling website workspaces have always worked. Note that skipping any declared
secret makes bashbuild ask `Continue anyway? [y/N]` once at startup. If you
always deploy from a machine with `netlify login`, deleting the `secrets:` block
removes both the prompt and that confirmation.

## Order

1. `studio-latest`: source → build.
2. `netlify-deployment`: source → build.

## Notes

- The deploy uses `--no-build`, so Netlify publishes the already-built `dist/`
  as-is and never runs its own build. No `netlify.toml` is needed.
- The app has no client-side router — deep links use query strings
  (`?mode=boat`), not paths — so no SPA redirect rule is required either.
