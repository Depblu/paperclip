export type {
  AskUserQuestionsAnswer,
  AskUserQuestionsInteraction,
  AskUserQuestionsPayload,
  AskUserQuestionsQuestion,
  AskUserQuestionsQuestionOption,
  AskUserQuestionsResult,
  IssueThreadInteraction,
  IssueThreadInteractionActorFields,
  IssueThreadInteractionBase,
  IssueThreadInteractionContinuationPolicy,
  IssueThreadInteractionStatus,
  RequestCheckboxConfirmationInteraction,
  RequestCheckboxConfirmationOption,
  RequestCheckboxConfirmationPayload,
  RequestCheckboxConfirmationResult,
  RequestConfirmationInteraction,
  RequestConfirmationIssueDocumentTarget,
  RequestConfirmationPayload,
  RequestConfirmationResult,
  RequestConfirmationTarget,
  SuggestedTaskDraft,
  SuggestTasksInteraction,
  SuggestTasksPayload,
  SuggestTasksResult,
  SuggestTasksResultCreatedTask,
} from "@paperclipai/shared";
import type {
  AskUserQuestionsAnswer,
  AskUserQuestionsInteraction,
  AskUserQuestionsQuestion,
  IssueThreadInteraction,
  RequestCheckboxConfirmationPayload,
  RequestCheckboxConfirmationResult,
  RequestConfirmationInteraction,
  RequestConfirmationTarget,
  SuggestedTaskDraft,
  SuggestTasksInteraction,
  SuggestTasksResultCreatedTask,
} from "@paperclipai/shared";
import { t as translate } from "@/i18n";

type TranslateFn = typeof translate;

export interface SuggestedTaskTreeNode {
  task: SuggestedTaskDraft;
  children: SuggestedTaskTreeNode[];
}

export function isIssueThreadInteraction(
  value: unknown,
): value is IssueThreadInteraction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<IssueThreadInteraction>;
  return typeof candidate.id === "string"
    && typeof candidate.companyId === "string"
    && typeof candidate.issueId === "string"
    && (
      candidate.kind === "suggest_tasks"
      || candidate.kind === "ask_user_questions"
      || candidate.kind === "request_confirmation"
      || candidate.kind === "request_checkbox_confirmation"
    );
}

export function getCheckboxConfirmationSelectedLabels(args: {
  payload: RequestCheckboxConfirmationPayload;
  result?: RequestCheckboxConfirmationResult | null;
}): string[] {
  const { payload, result } = args;
  const selectedIds = result?.selectedOptionIds ?? [];
  const optionLabelById = new Map(
    payload.options.map((option) => [option.id, option.label] as const),
  );
  return selectedIds
    .map((optionId) => optionLabelById.get(optionId))
    .filter((label): label is string => typeof label === "string");
}

export function normalizeRequestConfirmationTargetHref(href: string) {
  const value = href.trim();
  if (value.startsWith("#")) return value;
  if (value.startsWith("/")) return value.startsWith("//") ? null : value;
  return /^https?:\/\//i.test(value) ? value : null;
}

export function getRequestConfirmationTargetHref({
  issueId,
  target,
}: {
  issueId: string;
  target: RequestConfirmationTarget;
}) {
  if (target.href) {
    const safeHref = normalizeRequestConfirmationTargetHref(target.href);
    if (safeHref) return safeHref;
  }
  if (target.type === "issue_document") {
    const targetIssueId = target.issueId ?? issueId;
    return `/issues/${targetIssueId}#document-${encodeURIComponent(target.key)}`;
  }
  return null;
}

export function buildIssueThreadInteractionSummary(
  interaction: IssueThreadInteraction,
  t: TranslateFn = translate,
) {
  if (interaction.kind === "suggest_tasks") {
    const count = interaction.payload.tasks.length;
    if (interaction.status === "accepted") {
      const createdCount = interaction.result?.createdTasks?.length ?? 0;
      const skippedCount = interaction.result?.skippedClientKeys?.length ?? 0;
      if (skippedCount > 0) {
        return t("lib.issuethreadinteractions.accepted_created_of_tasks", {
          createdCount,
          count,
          defaultValue: "Accepted {{createdCount}} of {{count}} tasks",
        });
      }
      return t("lib.issuethreadinteractions.accepted_tasks", {
        count: createdCount,
        defaultValue: "Accepted {{count}} task",
        defaultValue_plural: "Accepted {{count}} tasks",
      });
    }
    if (interaction.status === "rejected") {
      return t("lib.issuethreadinteractions.rejected_tasks", {
        count,
        defaultValue: "Rejected {{count}} task",
        defaultValue_plural: "Rejected {{count}} tasks",
      });
    }
    return t("lib.issuethreadinteractions.suggested_tasks", {
      count,
      defaultValue: "Suggested {{count}} task",
      defaultValue_plural: "Suggested {{count}} tasks",
    });
  }

  if (interaction.kind === "request_confirmation") {
    if (interaction.status === "accepted") return t("lib.issuethreadinteractions.confirmed_request", { defaultValue: "Confirmed request" });
    if (interaction.status === "rejected") return t("lib.issuethreadinteractions.declined_request", { defaultValue: "Declined request" });
    if (interaction.status === "expired") {
      const outcome = interaction.result?.outcome;
      if (outcome === "superseded_by_comment") return t("lib.issuethreadinteractions.confirmation_expired_after_comment", { defaultValue: "Confirmation expired after comment" });
      if (outcome === "stale_target") return t("lib.issuethreadinteractions.confirmation_expired_after_target_changed", { defaultValue: "Confirmation expired after target changed" });
      return t("lib.issuethreadinteractions.confirmation_expired", { defaultValue: "Confirmation expired" });
    }
    return t("lib.issuethreadinteractions.requested_confirmation", { defaultValue: "Requested confirmation" });
  }

  if (interaction.kind === "request_checkbox_confirmation") {
    const optionCount = interaction.payload.options.length;
    if (interaction.status === "accepted") {
      const selectedCount = interaction.result?.selectedOptionIds?.length ?? 0;
      if (selectedCount === 0) return t("lib.issuethreadinteractions.confirmed_no_options", { defaultValue: "Confirmed with no options selected" });
      return t("lib.issuethreadinteractions.confirmed_selected_of_options", {
        selectedCount,
        optionCount,
        defaultValue: "Confirmed {{selectedCount}} of {{optionCount}} options",
      });
    }
    if (interaction.status === "rejected") return t("lib.issuethreadinteractions.declined_selection", { defaultValue: "Declined selection" });
    if (interaction.status === "expired") {
      const outcome = interaction.result?.outcome;
      if (outcome === "superseded_by_comment") return t("lib.issuethreadinteractions.selection_expired_after_comment", { defaultValue: "Selection expired after comment" });
      if (outcome === "stale_target") return t("lib.issuethreadinteractions.selection_expired_after_target_changed", { defaultValue: "Selection expired after target changed" });
      return t("lib.issuethreadinteractions.selection_expired", { defaultValue: "Selection expired" });
    }
    return t("lib.issuethreadinteractions.requested_selection_from_options", {
      count: optionCount,
      defaultValue: "Requested a selection from {{count}} option",
      defaultValue_plural: "Requested a selection from {{count}} options",
    });
  }

  const count = interaction.payload.questions.length;
  if (interaction.status === "answered") {
    return t("lib.issuethreadinteractions.answered_questions", {
      count,
      defaultValue: "Answered {{count}} question",
      defaultValue_plural: "Answered {{count}} questions",
    });
  }
  if (interaction.status === "cancelled") {
    return t("lib.issuethreadinteractions.cancelled_questions", {
      count,
      defaultValue: "Cancelled {{count}} question",
      defaultValue_plural: "Cancelled {{count}} questions",
    });
  }
  return t("lib.issuethreadinteractions.asked_questions", {
    count,
    defaultValue: "Asked {{count}} question",
    defaultValue_plural: "Asked {{count}} questions",
  });
}

export function buildSuggestedTaskTree(
  tasks: readonly SuggestedTaskDraft[],
): SuggestedTaskTreeNode[] {
  const nodes = new Map<string, SuggestedTaskTreeNode>();
  for (const task of tasks) {
    nodes.set(task.clientKey, { task, children: [] });
  }

  const roots: SuggestedTaskTreeNode[] = [];
  for (const task of tasks) {
    const node = nodes.get(task.clientKey);
    if (!node) continue;
    const parentNode = task.parentClientKey ? nodes.get(task.parentClientKey) : null;
    if (parentNode) {
      parentNode.children.push(node);
      continue;
    }
    roots.push(node);
  }

  return roots;
}

export function countSuggestedTaskNodes(node: SuggestedTaskTreeNode): number {
  return 1 + node.children.reduce((sum, child) => sum + countSuggestedTaskNodes(child), 0);
}

export function collectSuggestedTaskClientKeys(node: SuggestedTaskTreeNode): string[] {
  return [
    node.task.clientKey,
    ...node.children.flatMap((child) => collectSuggestedTaskClientKeys(child)),
  ];
}

export function getQuestionAnswerLabels(args: {
  question: AskUserQuestionsQuestion;
  answers: readonly AskUserQuestionsAnswer[];
}) {
  const { question, answers } = args;
  const answer = answers.find((candidate) => candidate.questionId === question.id);
  const selectedIds = answer?.optionIds ?? [];
  const optionLabelById = new Map(
    question.options.map((option) => [option.id, option.label] as const),
  );
  const labels = selectedIds
    .map((optionId) => optionLabelById.get(optionId))
    .filter((label): label is string => typeof label === "string");
  const otherText = answer?.otherText?.trim();
  if (otherText) labels.push(`Other: ${otherText}`);
  return labels;
}
