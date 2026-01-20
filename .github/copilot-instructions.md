# Copilot Instructions for DashGit Dashboard

## Project Overview
**DashGit** is a unified dashboard for GitHub and GitLab pull requests/merge requests. It aggregates open PRs/MRs where the user is involved (as author, assignee, or reviewer) from both platforms into a single, filterable view with unified data structures.

## Architecture

### Data Flow
1. **Settings Modal** → User configures GitHub token/username and GitLab token/host
2. **Settings Storage** → Settings persisted to localStorage as `'dashgit-settings'`
3. **Fetch Data** → On load/refresh, `fetchData()` calls both adapters in parallel
4. **Adapters** → Transform platform-specific APIs into `UnifiedPullRequest`
5. **Rendering** → Data grouped by status (approval, review, yours) and rendered as sortable tables

### Key Components
- **App.tsx** (553 lines): Main component orchestrating settings, data fetching, and rendering
  - `SettingsModal`: GitHub/GitLab credential management
  - `Section`: Collapsible table container for PR grouping
  - `PRRow`: Individual PR display with status indicators
  - `UserAvatar`: Small reviewer/author avatar with hover tooltip
  
- **types.ts**: Unified type definitions (`UnifiedPullRequest`, `User`, `PipelineStatus`, `ReviewState`)
- **adapters/github.ts**: GraphQL-based GitHub PR fetching and mapping
- **adapters/gitlab.ts**: GraphQL-based GitLab MR fetching and mapping

### Data Unification Strategy
Both adapters map to `UnifiedPullRequest` with these logic flags computed per-user:
- `isAuthor`: Is user the PR author?
- `isReviewer`: Is user in the reviewer list?
- `myReviewState`: User's personal review decision (`approved`, `changes_requested`, `pending`, `commented`)
- `overallReviewState`: Collective review state from all reviewers

## Critical Development Workflows

### Starting the Dev Server
```bash
npm run dev
# Runs Vite dev server with hot reload (React 19 + TypeScript)
```

### Building for Production
```bash
npm run build
# Runs: tsc -b (TypeScript compilation check) && vite build
# Output: dist/ directory
```

### Linting
```bash
npm run lint
# ESLint configuration in eslint.config.js (flat config format)
```

### Debugging Tips
- **API Errors**: Check browser DevTools → Network → GraphQL requests. Both adapters log errors to console
- **Settings Issues**: Inspect localStorage key `'dashgit-settings'` in DevTools
- **Build Failures**: Common issue—TypeScript errors blocking Vite build. Use `tsc -b` first

## Project-Specific Conventions

### Styling
- **Tailwind CSS 4** with TailwindCSS PostCSS plugin (not legacy)
- Utility-first approach with no custom CSS components
- Dark mode support with `dark:` prefix throughout (e.g., `dark:bg-gray-800`)
- No CSS-in-JS or styled-components; all styling in className attributes

### State Management
- **No Redux/Context API**—all state local to App.tsx via `useState`, `useMemo`
- Settings fetched from localStorage on mount, synced on every save
- Data sorted client-side: `sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())`

### Icon System
- Uses **lucide-react** for all UI icons (not FontAwesome, not custom SVGs)
- Import individual icons: `import { CheckCircle2, AlertCircle, ... } from 'lucide-react'`

### Adapter Pattern
Each adapter (`github.ts`, `gitlab.ts`) exports a single async function:
```typescript
export const fetch[PlatformName] = async (...): Promise<UnifiedPullRequest[]>
```
- No class-based design; pure functions with inline mappers
- Both use GraphQL (not REST) for query efficiency
- Error handling: throw descriptive errors caught by `fetchData()` and displayed to user

### Configuration
- **GitLab**: Configurable host (default: `https://gitlab.com`). Custom instances supported via settings
- **GitHub**: GraphQL query hardcoded to `search(involves:${username})` for simplicity
- **Vite Proxy** (vite.config.ts): Unused in current implementation but configured for `/gitlab-proxy`

## Integration Points & External Dependencies

### APIs
- **GitHub GraphQL API** (`https://api.github.com/graphql`)
  - Requires Personal Access Token (Classic)
  - Query searches open PRs where user is `involved`
  
- **GitLab GraphQL API** (`${gitlabHost}/api/graphql`)
  - Supports custom GitLab instances
  - Uses `currentUser.authoredMergeRequests`, `assignedMergeRequests`, `reviewRequestedMergeRequests` fragments

### Dependencies to Know
- **lucide-react**: Icon library (18+ icons in use)
- **clsx / tailwind-merge**: Utility helpers for conditional/merged Tailwind classes
- **React 19**: Latest with improved hydration and batch updates
- **TypeScript 5.9**: Strict mode enabled in tsconfig

### Local Storage
- Key: `'dashgit-settings'`
- Stored as JSON string with `AppSettings` interface shape
- Cleared when browser data is cleared; not synced across tabs

## Common Pitfalls & Solutions

1. **"Failed to fetch from GitHub" with GraphQL errors**
   - Token may lack required scopes (repo, read:user)
   - Check `json.errors` in adapter—GraphQL returns 200 with error objects

2. **GitLab MR query complexity errors**
   - Adapters use optimized limits (`first: 5`, `first: 15`, `first: 20`) to avoid hitting API complexity budgets
   - Cannot increase pagination without risking GraphQL rejection

3. **Dark mode not working**
   - Tailwind 4 config requires `@theme` directive in CSS; check `src/index.css`
   - Class `.dark` applied to root via OS preference detection

4. **Stale data after settings change**
   - `handleSaveSettings()` explicitly calls `fetchData()` to refresh
   - Manual refresh button missing—would use `RefreshCw` icon

## File Structure for Quick Reference
```
src/
  App.tsx          ← Main component (settings, data fetch, rendering)
  types.ts         ← Shared types (UnifiedPullRequest, User, etc.)
  index.css        ← Tailwind globals + dark mode config
  adapters/
    github.ts      ← GitHub GraphQL adapter
    gitlab.ts      ← GitLab GraphQL adapter + MR mapping
```
