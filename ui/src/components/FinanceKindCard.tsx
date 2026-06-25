import type { FinanceByKind } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { financeEventKindDisplayName, formatCents } from "@/lib/utils";

interface FinanceKindCardProps {
  rows: FinanceByKind[];
}

export function FinanceKindCard({ rows }: FinanceKindCardProps) {
const { t } = useTranslation();

  return (
    <Card>
      <CardHeader className="px-4 pt-4 pb-1">
        <CardTitle className="text-base">{t("components.financekindcard.financial_event_mix.jsx-text", { defaultValue: "Financial event mix" })}</CardTitle>
        <CardDescription>{t("components.financekindcard.account_level_charges_grouped_by.jsx-text", { defaultValue: "Account-level charges grouped by event kind." })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4 pt-3">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("components.financekindcard.no_finance_events_in_this_period.jsx-text", { defaultValue: "No finance events in this period." })}</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.eventKind}
              className="flex items-center justify-between gap-3 border border-border px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{financeEventKindDisplayName(row.eventKind, t)}</div>
                <div className="text-xs text-muted-foreground">
                  {t("components.financekindcard.event_biller_count.jsx-text", {
                    eventCount: row.eventCount,
                    billerCount: row.billerCount,
                    defaultValue: "Events: {{eventCount}} · Billers: {{billerCount}}",
                  })}
                </div>
              </div>
              <div className="text-right tabular-nums">
                <div className="text-sm font-medium">{formatCents(row.netCents)}</div>
                <div className="text-xs text-muted-foreground">
                  {formatCents(row.debitCents)} {t("components.financekindcard.debits.jsx-text", { defaultValue: " debits\n                " })}</div>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
