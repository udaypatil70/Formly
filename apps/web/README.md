# Formforge web

This is the [Vite](https://vitejs.dev) + [React](https://react.dev) frontend for Formforge, bootstrapped from `create-vite`.

## Getting Started

The monorepo root (`..` from this folder) provides the shared `pnpm` workspaces, so run the dev server from the repo root:

```bash
pnpm dev
# or, from inside apps/web directly
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the app.

The entry point is `src/main.tsx`. Routes live in `src/App.tsx`, styled with Tailwind CSS v4. The API server is expected at the URL in `VITE_API_URL` (defaults to `http://localhost:8000/trpc`).

## Available scripts

```bash
pnpm dev        # start the Vite dev server
pnpm build      # production build to dist/
pnpm start      # preview the production build
pnpm lint       # ESLint
pnpm typecheck  # tsc --noEmit
```

## Tech stack

- Vite + React 19 + TypeScript
- React Router (v7) for routing
- Tailwind CSS v4 (via `@tailwindcss/vite`)
- tRPC + TanStack Query for API calls