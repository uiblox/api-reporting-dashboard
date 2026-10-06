// Seeded sample data for the API Health dashboard.
// Replace ALL_REQUESTS (and APIS / APPS) with your real data — every metric
// in the dashboard is derived from these, so nothing else needs to change.

import type {
  ApiDefinition,
  RequestRecord,
  RequestStatus,
  SampleApiProfile,
} from "./types";

export const NOW: number = Math.floor(Date.now() / 1000) * 1000;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const APPS: readonly string[] = [
  "Web Checkout",
  "iOS App",
  "Android App",
  "Partner Portal",
  "Batch Scheduler",
];

// appWeights follow the APPS order above.
const PROFILES: SampleApiProfile[] = [
  {
    id: "payments-charge",
    method: "POST",
    path: "/v1/payments/charge",
    perDay: 224,
    medianMs: 821,
    sigma: 0.55,
    failRate: 0.094,
    abortRate: 0.013,
    sloP90Ms: 2000,
    appWeights: [4, 3, 3, 2, 0],
  },
  {
    id: "reports-export",
    method: "POST",
    path: "/v1/reports/export",
    perDay: 65,
    medianMs: 13200,
    sigma: 0.88,
    failRate: 0.015,
    abortRate: 0.077,
    sloP90Ms: 30000,
    appWeights: [0, 0, 0, 3, 4],
  },
  {
    id: "shipping-quote",
    method: "GET",
    path: "/v1/shipping/quote",
    perDay: 150,
    medianMs: 1230,
    sigma: 0.67,
    failRate: 0.02,
    abortRate: 0.013,
    sloP90Ms: 2500,
    appWeights: [4, 3, 3, 1, 0],
  },
  {
    id: "orders",
    method: "POST",
    path: "/v1/orders",
    perDay: 333,
    medianMs: 325,
    sigma: 0.45,
    failRate: 0,
    abortRate: 0.003,
    sloP90Ms: 1000,
    appWeights: [5, 3, 3, 1, 2],
  },
  {
    id: "inventory-reserve",
    method: "POST",
    path: "/v1/inventory/reserve",
    perDay: 271,
    medianMs: 148,
    sigma: 0.37,
    failRate: 0.015,
    abortRate: 0,
    sloP90Ms: 500,
    appWeights: [4, 2, 2, 1, 2],
  },
  {
    id: "users-get",
    method: "GET",
    path: "/v1/users/{id}",
    perDay: 270,
    medianMs: 94,
    sigma: 0.3,
    failRate: 0,
    abortRate: 0.004,
    sloP90Ms: 300,
    appWeights: [2, 5, 3, 1, 0],
  },
];

export const APIS: ApiDefinition[] = PROFILES.map(
  ({ id, method, path, sloP90Ms }) => ({ id, method, path, sloP90Ms }),
);

export const API_BY_ID: Record<string, ApiDefinition> = Object.fromEntries(
  APIS.map((a) => [a.id, a]),
);

function mulberry32(seed: number): () => number {
  return function rand(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261005);

function normal(): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

const lognormal = (median: number, sigma: number): number =>
  median * Math.exp(sigma * normal());

function pickWeighted(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

const hexId = (): string =>
  "req_" +
  Math.floor(rand() * 0xffffff)
    .toString(16)
    .padStart(6, "0");

function generate(days = 7): RequestRecord[] {
  const out: RequestRecord[] = [];
  for (const api of PROFILES) {
    const n = Math.round(api.perDay * days);
    for (let i = 0; i < n; i++) {
      const r = rand();
      const status: RequestStatus =
        r < api.failRate
          ? "failed"
          : r < api.failRate + api.abortRate
            ? "aborted"
            : "succeeded";
      const median =
        status === "failed"
          ? api.medianMs * 0.6
          : status === "aborted"
            ? api.medianMs * 0.9
            : api.medianMs;
      const sigma = status === "succeeded" ? api.sigma : api.sigma + 0.2;
      // A small slow tail so P99 sits well away from P90, like real traffic.
      const tail = rand() < 0.02 ? 3 + rand() * 4 : 1;
      const duration = Math.max(3, Math.round(lognormal(median, sigma) * tail));
      const end = NOW - Math.floor(rand() * days * DAY);
      out.push({
        id: hexId(),
        apiId: api.id,
        app: APPS[pickWeighted(api.appWeights)],
        status,
        start: end - duration,
        end,
        duration,
      });
    }
  }

  // Two requests that never came back.
  out.push(
    {
      id: hexId(),
      apiId: "payments-charge",
      app: "Partner Portal",
      status: "running",
      start: NOW - 22 * MIN,
      end: null,
      duration: null,
    },
    {
      id: hexId(),
      apiId: "reports-export",
      app: "Batch Scheduler",
      status: "running",
      start: NOW - (2 * HOUR + 41 * MIN),
      end: null,
      duration: null,
    },
  );

  return out.sort((a, b) => b.start - a.start);
}

export const ALL_REQUESTS: RequestRecord[] = generate();
