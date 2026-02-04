DashGit Dashboard
=================

Overview
--------
This project is a small, single-purpose, wibecoded dashboard that aggregates open Pull Requests (GitHub) and Merge Requests (GitLab) where the user is involved (author, assignee, or reviewer). It is intentionally lightweight and focused on that single purpose.

Quick features
--------------
- Fetches PRs/MRs the current user is involved with (author/assignee/reviewer)
- Shows review states, approvals and pipeline status
- Stores settings locally (development build uses `localStorage` by default)

Prerequisites
-------------
- Node.js (recommended v18+)
- npm
- If building for desktop (Tauri): Rust toolchain and `@tauri-apps/cli` (see Tauri docs)

Development
-----------
Install dependencies:

```bash
npm install
```

Run the dev server (hot reload):

```bash
npm run dev
```

Build
------------------
This runs TypeScript build checks and produces a Vite production build of the frontend:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Tauri / Desktop
----------------
This repository includes a `src-tauri` directory. To build a Tauri desktop app you will need the Rust toolchain and Tauri CLI. Typical steps (after installing Rust and Tauri prerequisites) are:

```bash
# build the frontend first
npm run build
# then build the Tauri app (example)
# (adjust for your platform; this requires @tauri-apps/cli)
npx tauri build
```

Notes about secrets
-------------------
- The app stores user tokens in `localStorage` under key `dashgit-settings` in the current implementation. For production/desktop apps consider using OS-secure storage (keychain) or Tauri's secure storage plugins.
- If you add tokens during development, do not commit them into the repo. Rotate any tokens accidentally exposed.

Recommendations
---------------
- Move tokens out of `localStorage` to secure storage before shipping.
- Add secret-scanning in CI (git-secrets, truffleHog, or GitHub secret scanning).
- Limit the scopes of Personal Access Tokens (PATs) used with GitHub/GitLab.

Where to look
-------------
- Main UI and app logic: `src/App.tsx`
- Adapters for APIs: `src/adapters/github.ts` and `src/adapters/gitlab.ts`
- Types: `src/types.ts`
- Tauri desktop glue: `src-tauri/`

License & authorship
--------------------
This repository is a minimal, single-purpose project (wibecoded). Use and modify as you like.
