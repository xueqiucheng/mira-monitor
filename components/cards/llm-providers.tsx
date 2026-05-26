import type { ProviderError, SourceStatus } from "@/lib/types";
import { CardShell } from "./card-shell";
import { cn } from "@/lib/utils";

export const LlmProvidersCard = ({ data, source }: { data: ProviderError[]; source: SourceStatus }) => {
  if (data.length === 0) {
    return (
      <CardShell title="LLM Provider 错误 (24h)" source={{ name: "Langfuse", status: source }}>
        <p className="text-sm text-muted-foreground">—</p>
      </CardShell>
    );
  }
  return (
    <CardShell title="LLM Provider 错误 (24h)" source={{ name: "Langfuse", status: source }}>
      <ul className="space-y-2">
        {data.map((p) => {
          const dot = p.errorCount === 0 ? "bg-emerald-500" : p.errorCount < 5 ? "bg-amber-500" : "bg-red-500";
          return (
            <li key={p.provider} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", dot)} />
                <span className="text-sm">{p.provider}</span>
              </div>
              <span className="font-mono text-sm tabular-nums">{p.errorCount}</span>
            </li>
          );
        })}
      </ul>
    </CardShell>
  );
};
