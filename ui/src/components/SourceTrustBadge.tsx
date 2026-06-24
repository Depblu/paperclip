import type { SourceTrustMetadata } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { BadgeCheck, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { sourceTrustLabel } from "../lib/trust-policy-ui";
import { cn } from "../lib/utils";

export function SourceTrustBadge({
  sourceTrust,
  artifactLabel = "content",
  className,
}: {
  sourceTrust: SourceTrustMetadata | null | undefined;
  artifactLabel?: "comment" | "document" | "work product" | "content";
  className?: string;
}) {
  const { t } = useTranslation();
  const label = sourceTrustLabel(sourceTrust, t);
  if (!label) return null;

  const promoted = sourceTrust?.disposition === "promoted";
  const tooltip = promoted
    ? sourceTrust.promotedAt
      ? t("components.sourcetrustbadge.promoted_from_low_trust_on", {
        date: new Date(sourceTrust.promotedAt).toLocaleString(),
        defaultValue: "Promoted from low-trust on {{date}}.",
      })
      : t("components.sourcetrustbadge.promoted_from_low_trust", { defaultValue: "Promoted from low-trust." })
    : t("components.sourcetrustbadge.low_trust_tooltip", {
      artifactLabel,
      defaultValue: "Authored by a low-trust review agent. Raw {{artifactLabel}} is not auto-shared with higher-trust agents.",
    });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="outline"
          aria-label={label}
          className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap px-1.5 py-0 text-[10px] font-medium tracking-normal",
            promoted
              ? "border-border text-muted-foreground"
              : "border-amber-500/40 text-amber-700 dark:text-amber-100",
            className,
          )}
        >
          {promoted ? <BadgeCheck className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
          {label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
