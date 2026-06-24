import type { IssueRelatedWorkItem, IssueRelatedWorkSummary } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { IssueReferencePill } from "./IssueReferencePill";

type GroupedSource = {
  label: string;
  count: number;
  sampleMatchedText: string | null;
};

function groupSourcesByLabel(sources: IssueRelatedWorkItem["sources"]): GroupedSource[] {
  const groups = new Map<string, GroupedSource>();
  for (const source of sources) {
    const existing = groups.get(source.label);
    if (existing) {
      existing.count += 1;
    } else {
      groups.set(source.label, {
        label: source.label,
        count: 1,
        sampleMatchedText: source.matchedText ?? null,
      });
    }
  }
  return Array.from(groups.values());
}

function Section({
  title,
  description,
  items,
  emptyLabel,
}: {
  title: string;
  description: string;
  items: IssueRelatedWorkItem[];
  emptyLabel: string;
}) {
const { t } = useTranslation();

  return (
    <section className="space-y-3 rounded-lg border border-border p-3">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="-mx-1 flex flex-col">
          {items.map((item) => {
            const groupedSources = groupSourcesByLabel(item.sources);
            const showTitle = item.issue.identifier !== item.issue.title;
            return (
              <li
                key={item.issue.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md px-1 py-1.5 hover:bg-accent/40"
              >
                <IssueReferencePill issue={item.issue} />
                {showTitle ? (
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    {item.issue.title}
                  </span>
                ) : null}
                <div className="flex flex-wrap items-center gap-1.5">
                  {groupedSources.map((group) => (
                    <span
                      key={`${item.issue.id}:${group.label}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground"
                      title={group.sampleMatchedText ?? undefined}
                    >
                      <span>{group.label}</span>
                      {group.count > 1 ? (
                        <span className="tabular-nums text-[10px] font-medium opacity-80">×{group.count}</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function IssueRelatedWorkPanel({
  relatedWork,
}: {
  relatedWork?: IssueRelatedWorkSummary | null;
}) {
const { t } = useTranslation();

  const outbound = relatedWork?.outbound ?? [];
  const inbound = relatedWork?.inbound ?? [];

  return (
    <div className="space-y-3">
      <Section
        title={t("components.issuerelatedworkpanel.references.attr_title", { defaultValue: "References" })}
        description={t("components.issuerelatedworkpanel.other_tasks_this_task_current.attr_description", { defaultValue: "Other tasks this task currently points at in its title, description, comments, or documents." })}
        items={outbound}
        emptyLabel={t("components.issuerelatedworkpanel.this_task_does_not_reference.jsx-text", { defaultValue: "This task does not reference any other tasks yet." })}
      />
      <Section
        title={t("components.issuerelatedworkpanel.referenced_by.attr_title", { defaultValue: "Referenced by" })}
        description={t("components.issuerelatedworkpanel.other_tasks_that_currently_po.attr_description", { defaultValue: "Other tasks that currently point at this task." })}
        items={inbound}
        emptyLabel={t("components.issuerelatedworkpanel.no_other_tasks_reference_thi.jsx-text", { defaultValue: "No other tasks reference this task yet." })}
      />
    </div>
  );
}
