import type { RetentionRow, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { formatPercent } from "@/lib/format";

export const RetentionCard = ({ data, source }: { data: RetentionRow[]; source: SourceStatus }) => {
  if (data.length === 0) {
    return (
      <CardShell title="留存 (D1 / D7 / D30)" source={{ name: "PostHog", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="留存 (D1 / D7 / D30)" source={{ name: "PostHog", status: source }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground">
            <th className="pb-2 text-left font-normal">Cohort</th>
            <th className="pb-2 text-right font-normal">D1</th>
            <th className="pb-2 text-right font-normal">D7</th>
            <th className="pb-2 text-right font-normal">D30</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.cohort}>
              <td className="py-1 font-mono">{row.cohort}</td>
              <td className="py-1 text-right tabular-nums">{row.d1 !== null ? formatPercent(row.d1, 0) : "—"}</td>
              <td className="py-1 text-right tabular-nums">{row.d7 !== null ? formatPercent(row.d7, 0) : "—"}</td>
              <td className="py-1 text-right tabular-nums">{row.d30 !== null ? formatPercent(row.d30, 0) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardShell>
  );
};
