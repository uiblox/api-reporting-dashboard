# API Health dashboard (React + TypeScript + Material UI + MUI X Charts)

## Install

```bash
npm install @mui/material @mui/icons-material @emotion/react @emotion/styled @mui/x-charts@^8
```

Optional fonts (add to `index.html`):

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet">
```

## Use

```tsx
import ApiHealthDashboard from './api-health-dashboard/ApiHealthDashboard';

export default function App() {
  return <ApiHealthDashboard />;
}
```

## Files

- `ApiHealthDashboard.tsx` — the page and all MUI components.
- `types.ts` — shared types (`RequestRecord`, `ApiDefinition`, `Summary`, …).
- `metrics.ts` — percentiles, funnel, health rules, issue detection and formatters.
- `mockData.ts` — seeded sample requests. Swap `ALL_REQUESTS` for your real `RequestRecord[]`; every number on the page is derived from it.

Written for `strict: true`. Needs `"jsx": "react-jsx"` in `tsconfig.json` (the default in Vite and Next.js templates).

Health thresholds (success rate, abort rate, stuck after 15m, silent after 30m) live in `THRESHOLDS` in `metrics.ts`, and per-API P90 SLOs live on each entry in `APIS`.
