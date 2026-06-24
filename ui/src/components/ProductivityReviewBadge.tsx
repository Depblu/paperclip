import { Eye } from "lucide-react";
import { t as translate, useTranslation } from "@/i18n";
import type { IssueProductivityReview } from "@paperclipai/shared";
import { Link } from "../lib/router";
import { cn } from "../lib/utils";
import { createIssueDetailPath } from "../lib/issueDetailBreadcrumb";
import { Tooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";

type TranslateFn = typeof translate;

const TRIGGER_LABELS: Record<string, { key: string; defaultValue: string }> = {
  no_comment_streak: {
    key: "components.productivityreviewbadge.trigger_no_comment_streak",
    defaultValue: "No-comment streak",
  },
  long_active_duration: {
    key: "components.productivityreviewbadge.trigger_long_active_duration",
    defaultValue: "Long active duration",
  },
  high_churn: {
    key: "components.productivityreviewbadge.trigger_high_churn",
    defaultValue: "High churn",
  },
};

const REVIEW_STATUS_LABELS: Record<string, { key: string; defaultValue: string }> = {
  todo: { key: "components.productivityreviewbadge.status_open", defaultValue: "Open" },
  in_progress: { key: "components.productivityreviewbadge.status_in_progress", defaultValue: "In progress" },
  in_review: { key: "components.productivityreviewbadge.status_in_review", defaultValue: "In review" },
  blocked: { key: "components.productivityreviewbadge.status_blocked", defaultValue: "Blocked" },
  backlog: { key: "components.productivityreviewbadge.status_open", defaultValue: "Open" },
};

export function productivityReviewTriggerLabel(
  trigger: IssueProductivityReview["trigger"],
  t: TranslateFn = translate,
): string {
  if (!trigger) return t("components.productivityreviewbadge.productivity_review", { defaultValue: "Productivity review" });
  const label = TRIGGER_LABELS[trigger];
  return label
    ? t(label.key, { defaultValue: label.defaultValue })
    : t("components.productivityreviewbadge.productivity_review", { defaultValue: "Productivity review" });
}

export function ProductivityReviewBadge({
  review,
  className,
  hideLabel = false,
}: {
  review: IssueProductivityReview;
  className?: string;
  hideLabel?: boolean;
}) {
const { t } = useTranslation();

  const label = productivityReviewTriggerLabel(review.trigger, t);
  const reviewIdentifier = review.reviewIdentifier ?? review.reviewIssueId.slice(0, 8);
  const reviewPath = createIssueDetailPath(review.reviewIdentifier ?? review.reviewIssueId);
  const status = REVIEW_STATUS_LABELS[review.status];
  const statusLabel = status ? t(status.key, { defaultValue: status.defaultValue }) : review.status.replace(/_/g, " ");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to={reviewPath}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300 shrink-0 hover:bg-amber-500/20 transition-colors",
            className,
          )}
          aria-label={t("components.productivityreviewbadge.under_review_productivity_review.attr_aria-label", {
            identifier: reviewIdentifier,
            label,
            defaultValue: "Under review · productivity review {{identifier}} ({{label}})",
          })}
        >
          <Eye className="h-3 w-3" aria-hidden />
          {hideLabel ? null : <span>{t("components.productivityreviewbadge.under_review.jsx-text", { defaultValue: "Under review" })}</span>}
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1 text-xs">
          <div className="font-semibold">{t("components.productivityreviewbadge.productivity_review_open.jsx-text", { defaultValue: "Productivity review open" })}</div>
          <div>
            <span className="text-muted-foreground">{t("components.productivityreviewbadge.trigger.jsx-text", { defaultValue: "Trigger:" })}</span> {label}
          </div>
          {typeof review.noCommentStreak === "number" && review.noCommentStreak > 0 ? (
            <div>
              <span className="text-muted-foreground">{t("components.productivityreviewbadge.no_comment_streak.jsx-text", { defaultValue: "No-comment streak:" })}</span>{" "}
              {review.noCommentStreak} {t("components.productivityreviewbadge.runs.jsx-text", { defaultValue: " runs\n            " })}</div>
          ) : null}
          <div>
            <span className="text-muted-foreground">{t("components.productivityreviewbadge.review.jsx-text", { defaultValue: "Review:" })}</span> {reviewIdentifier} ({statusLabel})
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
