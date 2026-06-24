import { useCallback } from "react";
import { useMutation, useQueryClient, type UseMutationResult } from "@tanstack/react-query";
import type { IssueRetryNowOutcome, IssueRetryNowResponse } from "@paperclipai/shared";
import { t as translate } from "@/i18n";
import { ApiError } from "../api/client";
import { issuesApi } from "../api/issues";
import { useToastActions } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";

export type RetryNowError = {
  message: string;
  outcomeMessage: string | null;
  status: number | null;
};

function readErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (typeof error.message === "string" && error.message.trim().length > 0) return error.message;
    return translate("hooks.useretrynowmutation.request_failed_with_status", {
      status: error.status,
      defaultValue: "Request failed ({{status}})",
    });
  }
  if (error instanceof Error && error.message) return error.message;
  return translate("hooks.useretrynowmutation.request_failed_retry", {
    defaultValue: "The request failed. Try again in a moment.",
  });
}

export const RETRY_NOW_OUTCOME_HEADLINE: Record<IssueRetryNowOutcome, string> = {
  promoted: "Retry promoted",
  already_promoted: "Retry already running",
  no_scheduled_retry: "No scheduled retry",
  gate_suppressed: "Couldn't retry now",
};

function retryNowOutcomeHeadline(outcome: IssueRetryNowOutcome): string {
  return translate(`hooks.useretrynowmutation.outcome_${outcome}`, {
    defaultValue: RETRY_NOW_OUTCOME_HEADLINE[outcome],
  });
}

export function useRetryNowMutation(
  issueId: string | null | undefined,
): UseMutationResult<IssueRetryNowResponse, unknown, void, unknown> & {
  lastError: RetryNowError | null;
} {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();

  const mutation = useMutation({
    mutationFn: () => {
      if (!issueId) throw new Error(translate("hooks.useretrynowmutation.missing_issue_id.error", { defaultValue: "Missing issue id" }));
      return issuesApi.retryScheduledRetryNow(issueId);
    },
    onSuccess: (response) => {
      if (issueId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(issueId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.activity(issueId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.runs(issueId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.liveRuns(issueId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.activeRun(issueId) });
      }
      if (response.outcome === "promoted") {
        pushToast({
          title: retryNowOutcomeHeadline("promoted"),
          body: response.message,
          tone: "success",
        });
      } else if (response.outcome === "gate_suppressed") {
        pushToast({
          title: retryNowOutcomeHeadline("gate_suppressed"),
          body: response.message,
          tone: "error",
        });
      }
    },
    onError: (error) => {
      pushToast({
        title: retryNowOutcomeHeadline("gate_suppressed"),
        body: readErrorMessage(error),
        tone: "error",
      });
    },
  });

  const reset = mutation.reset;
  const wrappedReset = useCallback(() => reset(), [reset]);

  const lastError: RetryNowError | null = (() => {
    if (mutation.error) {
      const apiError = mutation.error instanceof ApiError ? mutation.error : null;
      return {
        message: readErrorMessage(mutation.error),
        outcomeMessage: null,
        status: apiError?.status ?? null,
      };
    }
    if (mutation.data && mutation.data.outcome === "gate_suppressed") {
      return {
        message: mutation.data.message,
        outcomeMessage: mutation.data.message,
        status: null,
      };
    }
    return null;
  })();

  return {
    ...mutation,
    reset: wrappedReset,
    lastError,
  } as UseMutationResult<IssueRetryNowResponse, unknown, void, unknown> & {
    lastError: RetryNowError | null;
  };
}
