# Frontend development

Implemented: Vite/strict TypeScript build, React entry point, TanStack Query provider and a read-only React Flow design diagram. This is a starting screen; task CRUD, editable workflows, authentication, SSE, approvals and run monitoring remain E1/E4 work.

`src/App.tsx` owns the current screen, `src/main.tsx` the providers and `src/style.css` local styling. Node 24/npm and exact dependency versions plus package-lock.json make installation reproducible. `npm run build` includes TypeScript checking. The Dockerfile builds static assets and nginx serves same-origin `/api`/`internal` routing only as documented: internal routes are blocked from the browser proxy. Build never contains credentials.

Next: generated contract client, bounded query retries, authenticated fetch SSE, server validation and immutable version UI. Do not implement execution or policy authority in React. Add meaningful E2E tests when user workflows exist; no screenshot test is required for this foundation screen.
