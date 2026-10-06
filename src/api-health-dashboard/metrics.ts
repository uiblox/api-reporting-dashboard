import { APIS, NOW } from "./mockData";
import type {
  ApiIssue,
  ApiRow,
  HistogramBin,
  IssueItem,
  Percentiles,
  RequestRecord,
  RequestStatus,
  Severity,
  Summary,
  TimeRange,
  TimeRangeKey,
} from "./types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const TIME_RANGES: Record<TimeRangeKey, TimeRange> = {
  "1h": { label: "Last hour", scopeLabel: "last hour", ms: HOUR },
  "24h": { label: "Last 24 hours", scopeLabel: "last 24 hours", ms: DAY },
  "7d": { label: "Last 7 days", scopeLabel: "last 7 days", ms: 7 * DAY },
};

export const THRESHOLDS = {
  minSuccessRate: 95, // %
  maxAbortRate: 3, // %
  stuckAfterMs: 15 * MIN,
  silentAfterMs: 30 * MIN,
} as const;

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  degraded: 1,
  watch: 2,
  healthy: 3,
};

/* ---------------------------------------------------------------- stats */

const sortNum = (arr: number[]): number[] => [...arr].sort((a, b) => a - b);

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

export function percentileRow(sorted: number[]): Percentiles {
  return {
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p99: percentile(sorted, 99),
    max: sorted.length ? sorted[sorted.length - 1] : null,
  };
}

function latest(list: RequestRecord[], key: "start" | "end"): number | null {
  return list.reduce<number | null>((m, r) => {
    const v = r[key];
    return v != null && (m == null || v > m) ? v : m;
  }, null);
}

export interface RequestFilter {
  rangeMs: number;
  app?: string;
  apiId?: string | null;
}

/** Requests that started in range. Requests still running are always in scope. */
export function filterRequests(
  all: RequestRecord[],
  { rangeMs, app = "all", apiId = null }: RequestFilter,
): RequestRecord[] {
  const from = NOW - rangeMs;
  return all.filter(
    (r) =>
      (r.start >= from || r.status === "running") &&
      (app === "all" || r.app === app) &&
      (!apiId || r.apiId === apiId),
  );
}

export function summarize(reqs: RequestRecord[]): Summary {
  const by: Record<RequestStatus, RequestRecord[]> = {
    succeeded: [],
    failed: [],
    aborted: [],
    running: [],
  };
  for (const r of reqs) by[r.status].push(r);

  const finishedDurations = (list: RequestRecord[]): number[] =>
    sortNum(list.map((r) => r.duration).filter((d): d is number => d != null));

  const durations = {
    succeeded: finishedDurations(by.succeeded),
    failed: finishedDurations(by.failed),
    aborted: finishedDurations(by.aborted),
    running: sortNum(by.running.map((r) => NOW - r.start)), // age so far
  };

  const total = reqs.length;
  const counts = {
    total,
    succeeded: by.succeeded.length,
    failed: by.failed.length,
    aborted: by.aborted.length,
    running: by.running.length,
  };
  const pct = (n: number): number => (total ? (n / total) * 100 : 0);

  return {
    counts,
    pct: {
      succeeded: pct(counts.succeeded),
      failed: pct(counts.failed),
      aborted: pct(counts.aborted),
      running: pct(counts.running),
    },
    durations,
    percentiles: {
      succeeded: percentileRow(durations.succeeded),
      failed: percentileRow(durations.failed),
      aborted: percentileRow(durations.aborted),
      running: percentileRow(durations.running),
    },
    last: {
      invoked: latest(reqs, "start"),
      success: latest(by.succeeded, "end"),
      failure: latest(by.failed, "end"),
      abort: latest(by.aborted, "end"),
      started: latest(by.running, "start"),
    },
    oldestRunningAge: durations.running.length
      ? durations.running[durations.running.length - 1]
      : null,
  };
}

/** Log-scaled histogram bins. */
export function histogram(sorted: number[], binCount = 28): HistogramBin[] {
  if (!sorted.length) return [];
  const min = Math.max(1, sorted[0]);
  const max = Math.max(min * 1.01, sorted[sorted.length - 1]);
  const lMin = Math.log(min);
  const step = (Math.log(max) - lMin) / binCount;
  const bins: HistogramBin[] = Array.from({ length: binCount }, (_, i) => ({
    key: String(i),
    from: Math.exp(lMin + i * step),
    to: Math.exp(lMin + (i + 1) * step),
    count: 0,
  }));
  for (const v of sorted) {
    const i = Math.min(
      binCount - 1,
      Math.max(0, Math.floor((Math.log(Math.max(1, v)) - lMin) / step)),
    );
    bins[i].count += 1;
  }
  return bins;
}

export function binIndexFor(
  bins: HistogramBin[],
  value: number | null,
): number | null {
  if (value == null || !bins.length) return null;
  const i = bins.findIndex((b) => value <= b.to);
  return i === -1 ? bins.length - 1 : i;
}

/* ------------------------------------------------------- per-API health */

export function buildApiRows(reqs: RequestRecord[]): ApiRow[] {
  return APIS.map((api) => {
    const s = summarize(reqs.filter((r) => r.apiId === api.id));
    const { counts } = s;
    const successRate = counts.total
      ? (counts.succeeded / counts.total) * 100
      : null;
    const abortRate = counts.total
      ? (counts.aborted / counts.total) * 100
      : null;

    const issues: ApiIssue[] = [];
    if (successRate != null && successRate < THRESHOLDS.minSuccessRate) {
      issues.push({
        severity: "critical",
        text: `Success rate ${fmtPct(successRate)} (${counts.failed} failed, ${counts.aborted} aborted)`,
      });
    } else if (abortRate != null && abortRate > THRESHOLDS.maxAbortRate) {
      issues.push({
        severity: "degraded",
        text: `Abort rate ${fmtPct(abortRate)} (${counts.aborted} aborted)`,
      });
    }

    const stuck = s.durations.running.filter(
      (age) => age >= THRESHOLDS.stuckAfterMs,
    );
    if (stuck.length) {
      const oldest = stuck[stuck.length - 1];
      issues.push({
        severity: "degraded",
        text: `${stuck.length} request${stuck.length > 1 ? "s" : ""} in progress for ${fmtDuration(oldest)} — possibly stuck`,
      });
    }

    const p90 = s.percentiles.succeeded.p90;
    if (p90 != null && p90 > api.sloP90Ms) {
      issues.push({
        severity: "watch",
        text: `P90 ${fmtDuration(p90)} is over the ${fmtDuration(api.sloP90Ms)} SLO`,
      });
    }

    if (
      s.last.invoked == null ||
      NOW - s.last.invoked > THRESHOLDS.silentAfterMs
    ) {
      issues.push({
        severity: "watch",
        text:
          s.last.invoked != null
            ? `No calls in 30m — last call ${fmtAgo(s.last.invoked)}`
            : "No calls in this time range",
      });
    }

    const health = issues.reduce<Severity>(
      (worst, i) =>
        SEVERITY_RANK[i.severity] < SEVERITY_RANK[worst] ? i.severity : worst,
      "healthy",
    );

    return { api, summary: s, successRate, health, issues };
  });
}

export function buildIssues(rows: ApiRow[]): IssueItem[] {
  return rows
    .flatMap((row, apiOrder) =>
      row.issues.map((issue) => ({ ...issue, api: row.api, apiOrder })),
    )
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        a.apiOrder - b.apiOrder,
    );
}

/* ----------------------------------------------------------- formatting */

export function fmtDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 10_000) return `${(ms / 1000).toFixed(2)} s`;
  if (ms < MIN) return `${(ms / 1000).toFixed(1)} s`;
  if (ms < HOUR)
    return `${Math.floor(ms / MIN)}m ${Math.floor((ms % MIN) / 1000)}s`;
  return `${Math.floor(ms / HOUR)}h ${Math.floor((ms % HOUR) / MIN)}m`;
}

export function fmtAgo(ts: number | null | undefined): string {
  if (ts == null) return "—";
  const d = NOW - ts;
  if (d < MIN) return "just now";
  if (d < HOUR) return `${Math.floor(d / MIN)}m ago`;
  if (d < DAY)
    return `${Math.floor(d / HOUR)}h ${Math.floor((d % HOUR) / MIN)}m ago`;
  return `${Math.floor(d / DAY)}d ${Math.floor((d % DAY) / HOUR)}h ago`;
}

export function fmtClock(ts: number | null | undefined): string {
  if (ts == null) return "—";
  const d = new Date(ts);
  const time = d.toLocaleTimeString("en-GB", { hour12: false });
  const sameDay = new Date(NOW).toDateString() === d.toDateString();
  return sameDay
    ? time
    : `${d.toLocaleDateString("en-GB", { weekday: "short" })} ${time}`;
}

export const fmtPct = (v: number | null | undefined): string =>
  v == null ? "—" : `${v.toFixed(1)}%`;
export const fmtInt = (v: number | null | undefined): string =>
  v == null ? "—" : v.toLocaleString("en-US");
