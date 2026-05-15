export const formatNumber = (
  n: number,
  opts: { compact?: boolean } = {},
): string => {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: opts.compact ? "compact" : "standard",
    maximumFractionDigits: opts.compact ? 1 : 0,
  }).format(n);
};

export const formatPercent = (rate: number, digits = 2): string => {
  if (!Number.isFinite(rate)) return "—";
  return `${(rate * 100).toFixed(digits)}%`;
};

export const formatMs = (ms: number | null): string => {
  if (ms === null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export const formatCostUsd = (n: number, digits = 2): string => {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${formatNumber(n, { compact: true })}`;
  return `$${n.toFixed(digits)}`;
};

export const formatRelativeTime = (iso: string | null): string => {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
};

export const shortSha = (sha: string | null): string => {
  if (!sha) return "—";
  return sha.slice(0, 7);
};
