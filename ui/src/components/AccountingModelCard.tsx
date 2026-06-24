import { Database, Gauge, ReceiptText } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const SURFACES = [
  {
    key: "inference",
    icon: Database,
    pointKeys: ["tokens", "provider", "subscription"],
    tone: "from-sky-500/12 via-sky-500/6 to-transparent",
  },
  {
    key: "finance",
    icon: ReceiptText,
    pointKeys: ["topups", "bedrock", "credit"],
    tone: "from-amber-500/14 via-amber-500/6 to-transparent",
  },
  {
    key: "quotas",
    icon: Gauge,
    pointKeys: ["provider", "biller", "errors"],
    tone: "from-emerald-500/14 via-emerald-500/6 to-transparent",
  },
] as const;

export function AccountingModelCard() {
const { t } = useTranslation();

  return (
    <Card className="relative overflow-hidden border-border/70">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(244,114,182,0.08),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(56,189,248,0.1),transparent_32%)]" />
      <CardHeader className="relative px-5 pt-5 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {t("components.accountingmodelcard.accounting_model.jsx-text", { defaultValue: "\n          Accounting model\n        " })}</CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6">
          {t("components.accountingmodelcard.paperclip_now_separates_request_.jsx-text", { defaultValue: "\n          Paperclip now separates request-level inference usage from account-level finance events. That keeps provider reporting honest when the biller is OpenRouter, Cloudflare, Bedrock, or another intermediary.\n        " })}</CardDescription>
      </CardHeader>
      <CardContent className="relative grid gap-3 px-5 pb-5 md:grid-cols-3">
        {SURFACES.map((surface) => {
          const Icon = surface.icon;
          return (
            <div
              key={surface.key}
              className={`rounded-2xl border border-border/70 bg-gradient-to-br ${surface.tone} p-4 shadow-sm`}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t(`components.accountingmodelcard.${surface.key}.title`, {
                    defaultValue: surface.key === "inference" ? "Inference ledger" : surface.key === "finance" ? "Finance ledger" : "Live quotas",
                  })}</div>
                  <div className="text-xs text-muted-foreground">{t(`components.accountingmodelcard.${surface.key}.description`, {
                    defaultValue: surface.key === "inference"
                      ? "Request-scoped usage and billed runs from cost_events."
                      : surface.key === "finance"
                        ? "Account-level charges that are not one prompt-response pair."
                        : "Provider or biller windows that can stop traffic in real time.",
                  })}</div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {surface.pointKeys.map((point) => (
                  <div key={point}>{t(`components.accountingmodelcard.${surface.key}.${point}.point`, {
                    defaultValue:
                      surface.key === "inference" && point === "tokens" ? "tokens + billed dollars"
                        : surface.key === "inference" && point === "provider" ? "provider, biller, model"
                          : surface.key === "inference" ? "subscription and overage aware"
                            : surface.key === "finance" && point === "topups" ? "top-ups, refunds, fees"
                              : surface.key === "finance" && point === "bedrock" ? "Bedrock provisioned or training charges"
                                : surface.key === "finance" ? "credit expiries and adjustments"
                                  : surface.key === "quotas" && point === "provider" ? "provider quota windows"
                                    : surface.key === "quotas" && point === "biller" ? "biller credit systems"
                                      : "errors surfaced directly",
                  })}</div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
