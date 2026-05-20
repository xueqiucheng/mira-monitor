// 北京时间日窗口工具
// Cost ingest 按"北京日"切片(对齐运营/财务统计口径),provider API 接受 UTC ISO 时间,
// 这里负责把"北京日 YYYY-MM-DD"转成 UTC 起止时间戳

const BEIJING_OFFSET_MS = 8 * 3600_000;

export interface BeijingDayWindow {
  beijingDate: string;
  utcStartMs: number;
  utcEndMs: number;
}

const toYmdUtc = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const toYmdBeijing = (ms: number): string => toYmdUtc(ms + BEIJING_OFFSET_MS);

export const getBeijingDayWindow = (now: Date = new Date()): BeijingDayWindow => {
  const nowMs = now.getTime();
  const beijingNowMs = nowMs + BEIJING_OFFSET_MS;
  const beijingDayStartUtcMs = Math.floor(beijingNowMs / 86_400_000) * 86_400_000 - BEIJING_OFFSET_MS;
  return {
    beijingDate: toYmdBeijing(nowMs),
    utcStartMs: beijingDayStartUtcMs,
    utcEndMs: nowMs,
  };
};

export const beijingDateFromIso = (iso: string): BeijingDayWindow => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`invalid beijing date: ${iso} (expected YYYY-MM-DD)`);
  }
  const [y, m, d] = iso.split("-").map(Number);
  const startUtcMs = Date.UTC(y, m - 1, d) - BEIJING_OFFSET_MS;
  return {
    beijingDate: iso,
    utcStartMs: startUtcMs,
    utcEndMs: startUtcMs + 86_400_000,
  };
};
