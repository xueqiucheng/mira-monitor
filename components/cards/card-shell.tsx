import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SourceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CardShellProps {
  title: string;
  source?: { name: string; status?: SourceStatus };
  className?: string;
  children: React.ReactNode;
}

export const CardShell = ({ title, source, className, children }: CardShellProps) => {
  const status = source?.status;
  const isMock = status?.message === "mock";
  const isUnconfigured = status?.configured === false;
  const variant: "secondary" | "outline" | "destructive" = isMock || isUnconfigured
    ? "outline"
    : status?.ok
      ? "secondary"
      : "destructive";
  const label = source
    ? isMock
      ? `${source.name} · mock`
      : isUnconfigured
        ? `${source.name} · 未配置`
        : status?.ok
          ? source.name
          : `${source.name} · err`
    : "";
  return (
    <Card className={cn("h-full overflow-hidden", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        {source ? (
          <Badge variant={variant} className="font-mono text-[10px] uppercase tracking-wide">
            {label}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );
};
