import React, { useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  Box,
  Chip,
  CssBaseline,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ThemeProvider,
  Tooltip,
  Typography,
  createTheme,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import type { SvgIconComponent } from "@mui/icons-material";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import HighlightOffRoundedIcon from "@mui/icons-material/HighlightOffRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import { BarChart } from "@mui/x-charts/BarChart";
import { ChartsReferenceLine } from "@mui/x-charts/ChartsReferenceLine";

import { ALL_REQUESTS, APPS, API_BY_ID, NOW } from "./mockData";
import {
  TIME_RANGES,
  binIndexFor,
  buildApiRows,
  buildIssues,
  filterRequests,
  fmtAgo,
  fmtClock,
  fmtDuration,
  fmtInt,
  fmtPct,
  histogram,
  summarize,
} from "./metrics";
import type {
  ApiDefinition,
  ApiRow,
  IssueItem,
  LogFilter,
  Percentiles,
  RequestRecord,
  RequestStatus,
  Severity,
  StatusCounts,
  Summary,
  TimeRangeKey,
} from "./types";

/* ================================================================ theme */

const MONO = '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';
const BORDER = "#e6e4df";

const theme = createTheme({
  palette: {
    background: { default: "#f6f6f4", paper: "#ffffff" },
    text: { primary: "#1c1c1c", secondary: "#6b6a66" },
    primary: { main: "#1f5fbf" },
    divider: BORDER,
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif',
    fontSize: 13,
    h1: { fontSize: 26, fontWeight: 600, letterSpacing: "-0.01em" },
    h2: { fontSize: 15, fontWeight: 600 },
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: {
          fontSize: 13,
          borderColor: "#efede8",
          padding: "11px 12px",
          whiteSpace: "nowrap",
        },
        head: {
          color: "#6b6a66",
          fontWeight: 500,
          fontSize: 12,
          backgroundColor: "#fafaf8",
        },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
  },
});

interface Tone {
  label: string;
  bg: string;
  fg: string;
}

const SEVERITY: Record<Severity, Tone> = {
  critical: { label: "Critical", bg: "#fde8e7", fg: "#b42318" },
  degraded: { label: "Degraded", bg: "#fdeee3", fg: "#b54708" },
  watch: { label: "Watch", bg: "#fcf3d7", fg: "#8a6100" },
  healthy: { label: "Healthy", bg: "#e5f3e8", fg: "#1e7b34" },
};

const STATUS: Record<RequestStatus, Tone & { Icon: SvgIconComponent }> = {
  succeeded: {
    label: "Succeeded",
    bg: "#e5f3e8",
    fg: "#1e7b34",
    Icon: CheckCircleOutlineRoundedIcon,
  },
  failed: {
    label: "Failed",
    bg: "#fde8e7",
    fg: "#b42318",
    Icon: HighlightOffRoundedIcon,
  },
  aborted: {
    label: "Aborted",
    bg: "#fdeee3",
    fg: "#b54708",
    Icon: BlockRoundedIcon,
  },
  running: {
    label: "In progress",
    bg: "#e6eefb",
    fg: "#1f5fbf",
    Icon: ScheduleRoundedIcon,
  },
};

/* ======================================================= small pieces */

/** Merge a base style with an optional caller sx (MUI's recommended pattern). */
const mergeSx = (base: SxProps<Theme>, sx?: SxProps<Theme>): SxProps<Theme> =>
  [base, ...(Array.isArray(sx) ? sx : [sx])] as SxProps<Theme>;

interface MonoProps {
  children: ReactNode;
  sx?: SxProps<Theme>;
  role?: string;
  tabIndex?: number;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLSpanElement>) => void;
}

const Mono = ({ children, sx, ...rest }: MonoProps) => (
  <Box
    component="span"
    sx={mergeSx({ fontFamily: MONO, fontSize: "0.95em" }, sx)}
    {...rest}
  >
    {children}
  </Box>
);

const Card = ({
  children,
  sx,
}: {
  children: ReactNode;
  sx?: SxProps<Theme>;
}) => (
  <Paper
    variant="outlined"
    sx={mergeSx({ borderColor: BORDER, borderRadius: 3, p: 2.5 }, sx)}
  >
    {children}
  </Paper>
);

const apiLabel = (api: ApiDefinition): string => `${api.method} ${api.path}`;

const onEnter = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter") fn();
};

interface PillOption<T extends string> {
  value: T;
  label: string;
}

interface PillGroupProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: PillOption<T>[];
  ariaLabel: string;
}

function PillGroup<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: PillGroupProps<T>) {
  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      flexWrap="wrap"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Chip
            key={o.value}
            label={o.label}
            clickable
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            sx={{
              height: 34,
              px: 0.75,
              borderRadius: 999,
              border: "1px solid",
              borderColor: selected ? "#1c1c1c" : "#d9d7d1",
              bgcolor: selected ? "#1c1c1c" : "#fff",
              color: selected ? "#fff" : "text.primary",
              "&:hover": { bgcolor: selected ? "#333" : "#f2f1ee" },
            }}
          />
        );
      })}
    </Stack>
  );
}

function SeverityChip({
  severity,
  withIcon = false,
}: {
  severity: Severity;
  withIcon?: boolean;
}) {
  const s = SEVERITY[severity];
  return (
    <Chip
      size="small"
      label={s.label}
      icon={withIcon ? <WarningAmberRoundedIcon /> : undefined}
      sx={{
        bgcolor: s.bg,
        color: s.fg,
        height: 24,
        fontSize: 12,
        "& .MuiChip-icon": { color: s.fg, fontSize: 15, ml: 0.75 },
      }}
    />
  );
}

function StatusChip({ status }: { status: RequestStatus }) {
  const { Icon, ...s } = STATUS[status];
  return (
    <Chip
      size="small"
      icon={<Icon />}
      label={s.label}
      sx={{
        bgcolor: s.bg,
        color: s.fg,
        height: 24,
        fontSize: 12,
        "& .MuiChip-icon": { color: s.fg, fontSize: 15 },
      }}
    />
  );
}

/* ====================================================== potential issues */

interface IssuesCardProps {
  issues: IssueItem[];
  onSelectApi: (apiId: string) => void;
}

function IssuesCard({ issues, onSelectApi }: IssuesCardProps) {
  return (
    <Card>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        spacing={1}
        mb={1.5}
      >
        <Typography variant="h2">Potential issues</Typography>
        <Typography variant="caption" color="text.secondary">
          Success rate under 95% · P90 over SLO · abort rate over 3% · requests
          running 15m+ · no calls in 30m
        </Typography>
      </Stack>
      {issues.length === 0 ? (
        <Typography color="text.secondary" sx={{ py: 1 }}>
          Every API in scope is within its thresholds.
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {issues.map((issue, i) => (
            <Stack
              key={`${issue.api.id}-${i}`}
              direction="row"
              spacing={1.5}
              alignItems="center"
              flexWrap="wrap"
              useFlexGap
            >
              <SeverityChip severity={issue.severity} withIcon />
              <Mono
                role="button"
                tabIndex={0}
                onClick={() => onSelectApi(issue.api.id)}
                onKeyDown={onEnter(() => onSelectApi(issue.api.id))}
                sx={{
                  color: "primary.main",
                  cursor: "pointer",
                  "&:hover": { textDecoration: "underline" },
                }}
              >
                {apiLabel(issue.api)}
              </Mono>
              <Typography component="span">{issue.text}</Typography>
            </Stack>
          ))}
        </Stack>
      )}
    </Card>
  );
}

/* ============================================================ KPI cards */

interface KpiCardProps {
  icon: ReactNode;
  iconColor: string;
  label: string;
  value: string;
  caption: string;
  footLabel: string;
  footAgo: string;
  footClock: string;
  extra?: ReactNode;
}

function KpiCard({
  icon,
  iconColor,
  label,
  value,
  caption,
  footLabel,
  footAgo,
  footClock,
  extra,
}: KpiCardProps) {
  return (
    <Card sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" mb={1.5}>
        <Box
          sx={{ color: iconColor, display: "flex", "& svg": { fontSize: 18 } }}
        >
          {icon}
        </Box>
        <Typography fontWeight={500}>{label}</Typography>
      </Stack>
      <Stack direction="row" alignItems="baseline" spacing={1.25}>
        <Typography sx={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {caption}
        </Typography>
      </Stack>
      <Divider sx={{ my: 1.75 }} />
      <Typography variant="caption" color="text.secondary">
        {footLabel}
      </Typography>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
      >
        <Typography fontWeight={600}>{footAgo}</Typography>
        <Mono sx={{ color: "text.secondary", fontSize: 12 }}>{footClock}</Mono>
      </Stack>
      {extra}
    </Card>
  );
}

function KpiRow({
  summary,
  rangeLabel,
}: {
  summary: Summary;
  rangeLabel: string;
}) {
  const { counts, pct, last, oldestRunningAge } = summary;
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: {
          xs: "1fr",
          sm: "repeat(2, 1fr)",
          md: "repeat(5, 1fr)",
        },
      }}
    >
      <KpiCard
        icon={<BoltRoundedIcon />}
        iconColor="#1e7b34"
        label="Invoked"
        value={fmtInt(counts.total)}
        caption={rangeLabel}
        footLabel="Last invoked"
        footAgo={fmtAgo(last.invoked)}
        footClock={fmtClock(last.invoked)}
      />
      <KpiCard
        icon={<CheckCircleOutlineRoundedIcon />}
        iconColor={STATUS.succeeded.fg}
        label="Completed successfully"
        value={fmtInt(counts.succeeded)}
        caption={fmtPct(pct.succeeded)}
        footLabel="Last success"
        footAgo={fmtAgo(last.success)}
        footClock={fmtClock(last.success)}
      />
      <KpiCard
        icon={<HighlightOffRoundedIcon />}
        iconColor={STATUS.failed.fg}
        label="Failed"
        value={fmtInt(counts.failed)}
        caption={fmtPct(pct.failed)}
        footLabel="Last failure"
        footAgo={fmtAgo(last.failure)}
        footClock={fmtClock(last.failure)}
      />
      <KpiCard
        icon={<BlockRoundedIcon />}
        iconColor={STATUS.aborted.fg}
        label="Aborted"
        value={fmtInt(counts.aborted)}
        caption={fmtPct(pct.aborted)}
        footLabel="Last abort"
        footAgo={fmtAgo(last.abort)}
        footClock={fmtClock(last.abort)}
      />
      <KpiCard
        icon={<ScheduleRoundedIcon />}
        iconColor={STATUS.running.fg}
        label="In progress"
        value={fmtInt(counts.running)}
        caption={fmtPct(pct.running)}
        footLabel="Last started"
        footAgo={fmtAgo(last.started)}
        footClock={fmtClock(last.started)}
        extra={
          oldestRunningAge != null ? (
            <Chip
              size="small"
              label={`Oldest running ${fmtDuration(oldestRunningAge)}`}
              sx={{
                mt: 1,
                height: 22,
                fontSize: 11.5,
                bgcolor: SEVERITY.degraded.bg,
                color: SEVERITY.degraded.fg,
              }}
            />
          ) : null
        }
      />
    </Box>
  );
}

/* =============================================================== funnel */

const FUNNEL_COLORS = ["#133f7a", "#1c5aa8", "#2f74d0", "#5a97e6"] as const;

interface FunnelStageProps {
  label: string;
  sub: string;
  value: number;
  total: number;
  color: string;
}

function FunnelStage({ label, sub, value, total, color }: FunnelStageProps) {
  const share = total ? (value / total) * 100 : 0;
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "140px 1fr 110px" },
        gap: { xs: 0.5, sm: 2 },
        alignItems: "center",
      }}
    >
      <Box>
        <Typography fontWeight={600}>{label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {sub}
        </Typography>
      </Box>
      <Tooltip
        title={`${fmtInt(value)} requests · ${fmtPct(share)} of invoked`}
        placement="top"
      >
        <Box
          sx={{
            height: 28,
            borderRadius: 1,
            bgcolor: "#f0efec",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              height: "100%",
              width: `${share}%`,
              bgcolor: color,
              borderRadius: 1,
              transition: "width 300ms ease",
            }}
          />
        </Box>
      </Tooltip>
      <Box sx={{ textAlign: { sm: "right" } }}>
        <Typography fontWeight={600} fontSize={15}>
          {fmtInt(value)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {fmtPct(share)} of invoked
        </Typography>
      </Box>
    </Box>
  );
}

interface FunnelDropProps {
  count: number;
  pct: number;
  noun: string;
  tone?: "error" | "info";
  metricLabel: string;
  metric: number | null;
}

function FunnelDrop({
  count,
  pct,
  noun,
  tone = "error",
  metricLabel,
  metric,
}: FunnelDropProps) {
  const t = tone === "info" ? STATUS.running : STATUS.failed;
  return (
    <Box sx={{ pl: { sm: "156px" }, my: 1 }}>
      <Stack
        direction="row"
        spacing={1.5}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <Chip
          size="small"
          icon={<ArrowDownwardRoundedIcon />}
          label={`− ${fmtInt(count)} ${noun} (${fmtPct(pct)})`}
          sx={{
            bgcolor: t.bg,
            color: t.fg,
            height: 24,
            fontSize: 12,
            "& .MuiChip-icon": { color: t.fg, fontSize: 15 },
          }}
        />
        <Typography variant="body2" color="text.secondary">
          {metricLabel}{" "}
          <Mono sx={{ color: "text.primary", fontWeight: 600, ml: 0.5 }}>
            {fmtDuration(metric)}
          </Mono>
        </Typography>
      </Stack>
    </Box>
  );
}

function FunnelCard({
  summary,
  scopeLabel,
}: {
  summary: Summary;
  scopeLabel: string;
}) {
  const { counts, pct, percentiles } = summary;
  const total = counts.total;
  return (
    <Card>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        mb={2.5}
        spacing={2}
      >
        <Box>
          <Typography variant="h2">Invocation → completion funnel</Typography>
          <Typography variant="caption" color="text.secondary">
            {scopeLabel}
          </Typography>
        </Box>
        <Stack direction="row" spacing={3}>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Completion rate
            </Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 600 }}>
              {fmtPct(pct.succeeded)}
            </Typography>
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              P90 to success
            </Typography>
            <Typography sx={{ fontSize: 22, fontWeight: 600 }}>
              {fmtDuration(percentiles.succeeded.p90)}
            </Typography>
          </Box>
        </Stack>
      </Stack>

      <FunnelStage
        label="Invoked"
        sub="All requests received"
        value={total}
        total={total}
        color={FUNNEL_COLORS[0]}
      />
      <FunnelDrop
        count={counts.aborted}
        pct={pct.aborted}
        noun="aborted"
        metricLabel="P90 time to abort"
        metric={percentiles.aborted.p90}
      />
      <FunnelStage
        label="Not aborted"
        sub="Caller kept the request open"
        value={total - counts.aborted}
        total={total}
        color={FUNNEL_COLORS[1]}
      />
      <FunnelDrop
        count={counts.running}
        pct={pct.running}
        noun="still in progress"
        tone="info"
        metricLabel="P90 running age"
        metric={percentiles.running.p90}
      />
      <FunnelStage
        label="Returned a response"
        sub="Finished, success or failure"
        value={counts.succeeded + counts.failed}
        total={total}
        color={FUNNEL_COLORS[2]}
      />
      <FunnelDrop
        count={counts.failed}
        pct={pct.failed}
        noun="failed"
        metricLabel="P90 time to fail"
        metric={percentiles.failed.p90}
      />
      <FunnelStage
        label="Succeeded"
        sub="Completed without error"
        value={counts.succeeded}
        total={total}
        color={FUNNEL_COLORS[3]}
      />
    </Card>
  );
}

/* ================================================ duration percentiles */

function DurationHistogram({
  sorted,
  p,
}: {
  sorted: number[];
  p: Percentiles;
}) {
  const bins = useMemo(() => histogram(sorted), [sorted]);
  if (!bins.length) {
    return (
      <Box sx={{ height: 200, display: "grid", placeItems: "center" }}>
        <Typography color="text.secondary">
          No successful requests in scope.
        </Typography>
      </Box>
    );
  }
  const last = bins.length - 1;
  const mid = Math.round(last / 2);
  const marks: { name: string; value: number | null }[] = [
    { name: "P50", value: p.p50 },
    { name: "P90", value: p.p90 },
    { name: "P99", value: p.p99 },
  ];

  return (
    <BarChart
      height={210}
      margin={{ top: 28, right: 12, bottom: 28, left: 12 }}
      series={[
        {
          data: bins.map((b) => b.count),
          color: "#2f74d0",
          valueFormatter: (v: number | null) => `${fmtInt(v)} requests`,
        },
      ]}
      xAxis={[
        {
          scaleType: "band",
          data: bins.map((b) => b.key),
          categoryGapRatio: 0.18,
          disableTicks: true,
          tickLabelInterval: (_value: string, index: number) =>
            index === 0 || index === mid || index === last,
          tickLabelStyle: { fontFamily: MONO, fontSize: 11, fill: "#6b6a66" },
          valueFormatter: (key: string, ctx: { location: string }) => {
            const i = Number(key);
            const b = bins[i];
            if (ctx.location === "tick")
              return fmtDuration(i === last ? b.to : b.from);
            return `${fmtDuration(b.from)} – ${fmtDuration(b.to)}`;
          },
        },
      ]}
      yAxis={[{ position: "none", width: 0 }]}
    >
      {marks.map((m) => {
        const i = binIndexFor(bins, m.value);
        if (i == null) return null;
        return (
          <ChartsReferenceLine
            key={m.name}
            x={bins[i].key}
            label={`${m.name} ${fmtDuration(m.value)}`}
            labelAlign="start"
            lineStyle={{
              stroke: "#3a3a3a",
              strokeDasharray: "3 3",
              strokeWidth: 1,
            }}
            labelStyle={{ fontFamily: MONO, fontSize: 11, fill: "#1c1c1c" }}
          />
        );
      })}
    </BarChart>
  );
}

function PercentilesCard({ summary }: { summary: Summary }) {
  const rows: [string, Percentiles][] = [
    ["Succeeded", summary.percentiles.succeeded],
    ["Failed", summary.percentiles.failed],
    ["Aborted", summary.percentiles.aborted],
    ["Running", summary.percentiles.running],
  ];
  return (
    <Card>
      <Typography variant="h2">Duration percentiles</Typography>
      <Typography variant="caption" color="text.secondary">
        Start → end, by outcome. Running = age so far.
      </Typography>

      <TableContainer sx={{ mt: 1.5 }}>
        <Table
          size="small"
          sx={{ "& td, & th": { border: 0, px: 1, py: 0.9 } }}
        >
          <TableHead>
            <TableRow sx={{ "& th": { bgcolor: "transparent" } }}>
              <TableCell>Outcome</TableCell>
              <TableCell align="right">P50</TableCell>
              <TableCell
                align="right"
                sx={{ fontWeight: 700, color: "text.primary" }}
              >
                P90
              </TableCell>
              <TableCell align="right">P99</TableCell>
              <TableCell align="right">Max</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(([label, p]) => (
              <TableRow key={label}>
                <TableCell>{label}</TableCell>
                <TableCell align="right">
                  <Mono>{fmtDuration(p.p50)}</Mono>
                </TableCell>
                <TableCell align="right">
                  <Mono sx={{ fontWeight: 700 }}>{fmtDuration(p.p90)}</Mono>
                </TableCell>
                <TableCell align="right">
                  <Mono>{fmtDuration(p.p99)}</Mono>
                </TableCell>
                <TableCell align="right">
                  <Mono>{fmtDuration(p.max)}</Mono>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Stack direction="row" justifyContent="space-between" mt={2}>
        <Typography fontWeight={600}>Successful completion times</Typography>
        <Typography variant="caption" color="text.secondary">
          Hover a bar for its range
        </Typography>
      </Stack>
      <DurationHistogram
        sorted={summary.durations.succeeded}
        p={summary.percentiles.succeeded}
      />
      <Typography variant="caption" color="text.secondary">
        Log-scaled duration axis
      </Typography>
    </Card>
  );
}

/* ============================================================ APIs table */

function TimeCell({
  ts,
  emptyLabel = "—",
}: {
  ts: number | null;
  emptyLabel?: string;
}) {
  return (
    <TableCell>
      <Typography fontSize={13} lineHeight={1.2}>
        {ts == null ? emptyLabel : fmtAgo(ts)}
      </Typography>
      <Mono sx={{ fontSize: 11.5, color: "text.secondary" }}>
        {fmtClock(ts)}
      </Mono>
    </TableCell>
  );
}

interface ApisCardProps {
  rows: ApiRow[];
  selectedApiId: string | null;
  onSelectApi: (apiId: string | null) => void;
}

function ApisCard({ rows, selectedApiId, onSelectApi }: ApisCardProps) {
  return (
    <Card sx={{ p: 0 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        spacing={1}
        sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}
      >
        <Typography variant="h2">APIs</Typography>
        <Typography variant="caption" color="text.secondary">
          Select an API to focus the funnel, percentiles and request log.
        </Typography>
      </Stack>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ pl: 2.5 }}>API</TableCell>
              <TableCell>Health</TableCell>
              <TableCell align="right">Invoked</TableCell>
              <TableCell align="right">Success</TableCell>
              <TableCell align="right">Failed</TableCell>
              <TableCell align="right">Aborted</TableCell>
              <TableCell align="right">Running</TableCell>
              <TableCell align="right">P50</TableCell>
              <TableCell align="right">P90</TableCell>
              <TableCell align="right">P99</TableCell>
              <TableCell>Last invoked</TableCell>
              <TableCell>Last success</TableCell>
              <TableCell sx={{ pr: 2.5 }}>Last failure</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map(({ api, summary: s, successRate, health }) => {
              const selected = api.id === selectedApiId;
              const toggle = () => onSelectApi(selected ? null : api.id);
              return (
                <TableRow
                  key={api.id}
                  hover
                  selected={selected}
                  tabIndex={0}
                  onClick={toggle}
                  onKeyDown={onEnter(toggle)}
                  sx={{
                    cursor: "pointer",
                    "&.Mui-selected": { bgcolor: "#eef3fc" },
                  }}
                >
                  <TableCell sx={{ pl: 2.5 }}>
                    <Mono sx={{ color: "primary.main" }}>{apiLabel(api)}</Mono>
                  </TableCell>
                  <TableCell>
                    <SeverityChip severity={health} />
                  </TableCell>
                  <TableCell align="right">{fmtInt(s.counts.total)}</TableCell>
                  <TableCell align="right">{fmtPct(successRate)}</TableCell>
                  <TableCell align="right">{fmtInt(s.counts.failed)}</TableCell>
                  <TableCell align="right">
                    {fmtInt(s.counts.aborted)}
                  </TableCell>
                  <TableCell align="right">
                    {fmtInt(s.counts.running)}
                  </TableCell>
                  <TableCell align="right">
                    <Mono>{fmtDuration(s.percentiles.succeeded.p50)}</Mono>
                  </TableCell>
                  <TableCell align="right">
                    <Mono sx={{ fontWeight: 700 }}>
                      {fmtDuration(s.percentiles.succeeded.p90)}
                    </Mono>
                  </TableCell>
                  <TableCell align="right">
                    <Mono>{fmtDuration(s.percentiles.succeeded.p99)}</Mono>
                  </TableCell>
                  <TimeCell ts={s.last.invoked} />
                  <TimeCell ts={s.last.success} />
                  <TimeCell ts={s.last.failure} emptyLabel="None in range" />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

/* =========================================================== request log */

interface RequestLogCardProps {
  requests: RequestRecord[];
  counts: StatusCounts;
  filter: LogFilter;
  onFilter: (filter: LogFilter) => void;
  scopeLabel: string;
}

function RequestLogCard({
  requests,
  counts,
  filter,
  onFilter,
  scopeLabel,
}: RequestLogCardProps) {
  const visible = useMemo(
    () =>
      (filter === "all"
        ? requests
        : requests.filter((r) => r.status === filter)
      ).slice(0, 30),
    [requests, filter],
  );
  const options: PillOption<LogFilter>[] = [
    { value: "all", label: `All · ${fmtInt(counts.total)}` },
    { value: "failed", label: `Failed · ${fmtInt(counts.failed)}` },
    { value: "aborted", label: `Aborted · ${fmtInt(counts.aborted)}` },
    { value: "running", label: `In progress · ${fmtInt(counts.running)}` },
    { value: "succeeded", label: `Succeeded · ${fmtInt(counts.succeeded)}` },
  ];
  return (
    <Card sx={{ p: 0 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
        spacing={1.5}
        sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}
      >
        <Box>
          <Typography variant="h2">Request log</Typography>
          <Typography variant="caption" color="text.secondary">
            Most recent 30 requests in scope · {scopeLabel}
          </Typography>
        </Box>
        <PillGroup
          value={filter}
          onChange={onFilter}
          options={options}
          ariaLabel="Filter requests by status"
        />
      </Stack>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ pl: 2.5 }}>Request</TableCell>
              <TableCell>API</TableCell>
              <TableCell>Calling app</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Start time</TableCell>
              <TableCell>End time</TableCell>
              <TableCell align="right" sx={{ pr: 2.5 }}>
                Duration
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  sx={{ py: 4, textAlign: "center", color: "text.secondary" }}
                >
                  No requests with this status in scope. Widen the time range or
                  pick another status.
                </TableCell>
              </TableRow>
            )}
            {visible.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell sx={{ pl: 2.5 }}>
                  <Mono>{r.id}</Mono>
                </TableCell>
                <TableCell>
                  <Mono>{apiLabel(API_BY_ID[r.apiId])}</Mono>
                </TableCell>
                <TableCell>{r.app}</TableCell>
                <TableCell>
                  <StatusChip status={r.status} />
                </TableCell>
                <TableCell>
                  <Mono>{fmtClock(r.start)}</Mono>
                </TableCell>
                <TableCell>
                  <Mono>{fmtClock(r.end)}</Mono>
                </TableCell>
                <TableCell align="right" sx={{ pr: 2.5 }}>
                  <Mono>
                    {r.status === "running"
                      ? `running ${fmtDuration(NOW - r.start)}`
                      : fmtDuration(r.duration)}
                  </Mono>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );
}

/* ============================================================== page */

const ALL_APPS = "all";

export default function ApiHealthDashboard() {
  const [range, setRange] = useState<TimeRangeKey>("24h");
  const [app, setApp] = useState<string>(ALL_APPS);
  const [apiId, setApiId] = useState<string | null>(null);
  const [logFilter, setLogFilter] = useState<LogFilter>("all");

  const rangeMs = TIME_RANGES[range].ms;

  // Everything for the selected app (all APIs) drives the issues list and APIs table.
  const appScoped = useMemo(
    () => filterRequests(ALL_REQUESTS, { rangeMs, app }),
    [rangeMs, app],
  );
  // Narrowed further by the selected API for the KPIs, funnel, percentiles and log.
  const scoped = useMemo(
    () => (apiId ? appScoped.filter((r) => r.apiId === apiId) : appScoped),
    [appScoped, apiId],
  );

  const summary = useMemo(() => summarize(scoped), [scoped]);
  const apiRows = useMemo(() => buildApiRows(appScoped), [appScoped]);
  const issues = useMemo(() => buildIssues(apiRows), [apiRows]);

  const scopeLabel = [
    apiId ? apiLabel(API_BY_ID[apiId]) : "All APIs",
    app === ALL_APPS ? "all apps" : app,
    TIME_RANGES[range].scopeLabel,
  ].join(" · ");

  const selectApi = (id: string | null) => {
    setApiId(id);
    setLogFilter("all");
  };

  const rangeOptions = (Object.keys(TIME_RANGES) as TimeRangeKey[]).map(
    (value) => ({
      value,
      label: TIME_RANGES[value].label,
    }),
  );
  const appOptions: PillOption<string>[] = [
    { value: ALL_APPS, label: "All apps" },
    ...APPS.map((a) => ({ value: a, label: a })),
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          bgcolor: "background.default",
          minHeight: "100vh",
          py: 4,
          px: { xs: 2, md: 4 },
        }}
      >
        <Stack spacing={2.5} sx={{ maxWidth: 1280, mx: "auto" }}>
          {/* Header */}
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="space-between"
            spacing={2}
          >
            <Box>
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Typography variant="h1">API Health</Typography>
                <Chip
                  size="small"
                  label="Sample data"
                  sx={{
                    bgcolor: "#fcf0c8",
                    color: "#7a5600",
                    height: 22,
                    fontSize: 11.5,
                  }}
                />
              </Stack>
              <Typography variant="body2" color="text.secondary" mt={0.5}>
                Invocations, outcomes, drop-off and latency across every API and
                calling app. Data as of {fmtClock(NOW)}.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Time range
              </Typography>
              <PillGroup
                value={range}
                onChange={setRange}
                ariaLabel="Time range"
                options={rangeOptions}
              />
            </Stack>
          </Stack>

          <Stack
            direction="row"
            spacing={1.5}
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
          >
            <Typography variant="caption" color="text.secondary">
              Calling app
            </Typography>
            <PillGroup
              value={app}
              onChange={setApp}
              ariaLabel="Calling app"
              options={appOptions}
            />
            {apiId && (
              <Chip
                label={
                  <>
                    API: <Mono>{apiLabel(API_BY_ID[apiId])}</Mono>
                  </>
                }
                onDelete={() => selectApi(null)}
                deleteIcon={<CloseRoundedIcon />}
                sx={{
                  ml: { md: "auto" },
                  bgcolor: "#e6eefb",
                  color: "#1f5fbf",
                  "& .MuiChip-deleteIcon": { color: "#1f5fbf" },
                }}
              />
            )}
          </Stack>

          <IssuesCard issues={issues} onSelectApi={selectApi} />

          <KpiRow
            summary={summary}
            rangeLabel={TIME_RANGES[range].scopeLabel}
          />

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", lg: "1.15fr 1fr" },
            }}
          >
            <FunnelCard summary={summary} scopeLabel={scopeLabel} />
            <PercentilesCard summary={summary} />
          </Box>

          <ApisCard
            rows={apiRows}
            selectedApiId={apiId}
            onSelectApi={selectApi}
          />

          <RequestLogCard
            requests={scoped}
            counts={summary.counts}
            filter={logFilter}
            onFilter={setLogFilter}
            scopeLabel={scopeLabel}
          />
        </Stack>
      </Box>
    </ThemeProvider>
  );
}
