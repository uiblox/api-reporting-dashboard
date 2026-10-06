export type RequestStatus = "succeeded" | "failed" | "aborted" | "running";

export type Severity = "critical" | "degraded" | "watch" | "healthy";

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type TimeRangeKey = "1h" | "24h" | "7d";

export type LogFilter = "all" | RequestStatus;

export interface ApiDefinition {
  id: string;
  method: HttpMethod;
  path: string;
  /** P90 latency objective for successful requests, in ms. */
  sloP90Ms: number;
}

/** Sample-data tuning; not needed for real data. */
export interface SampleApiProfile extends ApiDefinition {
  perDay: number;
  medianMs: number;
  sigma: number;
  failRate: number;
  abortRate: number;
  appWeights: number[];
}

export interface RequestRecord {
  id: string;
  apiId: string;
  app: string;
  status: RequestStatus;
  /** Epoch ms. */
  start: number;
  /** Epoch ms, null while running. */
  end: number | null;
  /** ms, null while running. */
  duration: number | null;
}

export interface TimeRange {
  label: string;
  scopeLabel: string;
  ms: number;
}

export interface Percentiles {
  p50: number | null;
  p90: number | null;
  p99: number | null;
  max: number | null;
}

export type ByStatus<T> = Record<RequestStatus, T>;

export interface StatusCounts extends ByStatus<number> {
  total: number;
}

export interface Summary {
  counts: StatusCounts;
  pct: ByStatus<number>;
  /** Sorted ascending. Running = age so far. */
  durations: ByStatus<number[]>;
  percentiles: ByStatus<Percentiles>;
  last: {
    invoked: number | null;
    success: number | null;
    failure: number | null;
    abort: number | null;
    started: number | null;
  };
  oldestRunningAge: number | null;
}

export interface HistogramBin {
  key: string;
  from: number;
  to: number;
  count: number;
}

export interface ApiIssue {
  severity: Exclude<Severity, "healthy">;
  text: string;
}

export interface ApiRow {
  api: ApiDefinition;
  summary: Summary;
  successRate: number | null;
  health: Severity;
  issues: ApiIssue[];
}

export interface IssueItem extends ApiIssue {
  api: ApiDefinition;
  apiOrder: number;
}
