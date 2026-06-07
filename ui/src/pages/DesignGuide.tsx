import { useState } from "react";
import { useTranslation } from "@/i18n";
import {
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  Command as CommandIcon,
  DollarSign,
  Hexagon,
  History,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Mail,
  Plus,
  Search,
  Settings,
  Target,
  Trash2,
  Upload,
  User,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandInput,
  CommandList,
  CommandGroup,
  CommandItem,
  CommandEmpty,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import { StatusBadge, AgentStatusBadge, AgentStatusCapsule } from "@/components/StatusBadge";
import { StatusIcon } from "@/components/StatusIcon";
import { PriorityIcon } from "@/components/PriorityIcon";
import { EntityRow } from "@/components/EntityRow";
import { EmptyState } from "@/components/EmptyState";
import { MetricCard } from "@/components/MetricCard";
import { FilterBar, type FilterValue } from "@/components/FilterBar";
import { InlineEditor } from "@/components/InlineEditor";
import { PageSkeleton } from "@/components/PageSkeleton";
import { Identity } from "@/components/Identity";
import { IssueReferencePill } from "@/components/IssueReferencePill";
import { MembershipAction } from "@/components/MembershipAction";
import { IssueOutputSection } from "@/components/issue-output/IssueOutputSection";
import {
  EnvInputsList,
  ExternalSourcesList,
  RequiredSkillsList,
  StepSkillPlan,
  StepSourcePolicy,
  TeamCard,
  TeamHierarchyPreview,
  TeamRow,
} from "@/pages/TeamCatalog";
import {
  currentInstalledState,
  onboardingTeams,
  optionalTeam,
  outOfDateInstalledState,
  sampleSkillPreparations,
  sampleTeam,
  warnTeam,
} from "@/pages/TeamCatalog.fixtures";
import type { IssueWorkProduct } from "@paperclipai/shared";

/* ------------------------------------------------------------------ */
/*  Sample data for the Issue Output surface showcase                  */
/* ------------------------------------------------------------------ */

function sampleOutput(
  id: string,
  attachmentId: string,
  contentType: string,
  filename: string,
  opts: { byteSize: number; isPrimary?: boolean; createdAt: string },
): IssueWorkProduct {
  const contentPath = `/api/attachments/${attachmentId}/content`;
  return {
    id,
    companyId: "demo-company",
    projectId: null,
    issueId: "demo-issue",
    executionWorkspaceId: null,
    runtimeServiceId: null,
    type: "artifact",
    provider: "paperclip",
    externalId: null,
    title: filename,
    url: null,
    status: "active",
    reviewState: "none",
    isPrimary: Boolean(opts.isPrimary),
    healthStatus: "unknown",
    summary: null,
    createdByRunId: null,
    createdAt: new Date(opts.createdAt),
    updatedAt: new Date(opts.createdAt),
    metadata: {
      attachmentId,
      contentType,
      byteSize: opts.byteSize,
      contentPath,
      openPath: contentPath,
      downloadPath: `${contentPath}?download=1`,
      originalFilename: filename,
    },
  } as IssueWorkProduct;
}

const DESIGN_GUIDE_OUTPUTS: IssueWorkProduct[] = [
  sampleOutput("wp-vid", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "video/mp4", "q3-summary.mp4", {
    byteSize: 19_293_798,
    isPrimary: true,
    createdAt: "2026-05-30T12:00:00Z",
  }),
  sampleOutput("wp-pdf", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "application/pdf", "talking-points.pdf", {
    byteSize: 421_888,
    createdAt: "2026-05-30T11:52:00Z",
  }),
];

const DESIGN_GUIDE_DEGRADED_OUTPUTS: IssueWorkProduct[] = [
  {
    ...sampleOutput("wp-broken", "cccccccc-cccc-4ccc-8ccc-cccccccccccc", "video/mp4", "corrupt-output.mp4", {
      byteSize: 0,
      isPrimary: true,
      createdAt: "2026-05-30T12:01:00Z",
    }),
    // Strip the path metadata so it fails the shared artifact schema.
    metadata: { attachmentId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", contentType: "video/mp4" },
  } as IssueWorkProduct,
];

/* ------------------------------------------------------------------ */
/*  Section wrapper                                                    */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
const { t } = useTranslation();

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {title}
      </h3>
      <Separator />
      {children}
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
const { t } = useTranslation();

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{title}</h4>
      {children}
    </div>
  );
}

// Onboarding seam (design §6 + §12.5): the TeamCard tile in its "Pick a starter
// team" 3-col grid, with the first defaultInstall tile selected.
function TeamCardShowcase() {
const { t } = useTranslation();

  const [selectedId, setSelectedId] = useState(onboardingTeams[0]?.id ?? null);
  return (
    <div className="grid max-w-2xl gap-4 md:grid-cols-2 lg:grid-cols-3">
      {onboardingTeams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          selected={team.id === selectedId}
          onSelect={() => setSelectedId(team.id)}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Color swatch                                                       */
/* ------------------------------------------------------------------ */

function Swatch({ name, cssVar }: { name: string; cssVar: string }) {
const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <div
        className="h-8 w-8 rounded-md border border-border shrink-0"
        style={{ backgroundColor: `var(${cssVar})` }}
      />
      <div>
        <p className="text-xs font-mono">{cssVar}</p>
        <p className="text-xs text-muted-foreground">{name}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export function DesignGuide() {
const { t } = useTranslation();

  const [status, setStatus] = useState("todo");
  const [priority, setPriority] = useState("medium");
  const [selectValue, setSelectValue] = useState("in_progress");
  const [menuChecked, setMenuChecked] = useState(true);
  const [collapsibleOpen, setCollapsibleOpen] = useState(false);
  const [inlineText, setInlineText] = useState("Click to edit this text");
  const [inlineTitle, setInlineTitle] = useState("Editable Title");
  const [inlineDesc, setInlineDesc] = useState(
    "This is an editable description. Click to edit it — the textarea auto-sizes to fit the content without layout shift."
  );
  const [filters, setFilters] = useState<FilterValue[]>([
    { key: "status", label: "Status", value: "Active" },
    { key: "priority", label: "Priority", value: "High" },
  ]);
  const [allowExternal, setAllowExternal] = useState(false);
  const [allowUnpinned, setAllowUnpinned] = useState(false);
  const [allowLocalPath, setAllowLocalPath] = useState(false);

  return (
    <div className="space-y-10 max-w-4xl">
      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold">{t("pages.designguide.design_guide.jsx-text", { defaultValue: "Design Guide" })}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("pages.designguide.every_component_style_and_patter.jsx-text", { defaultValue: "\n          Every component, style, and pattern used across Paperclip.\n        " })}</p>
      </div>

      {/* ============================================================ */}
      {/*  COVERAGE                                                     */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.component_coverage.attr_title", { defaultValue: "Component Coverage" })}>
        <p className="text-sm text-muted-foreground">
          {t("pages.designguide.this_page_should_be_updated_when.jsx-text", { defaultValue: "\n          This page should be updated when new UI primitives or app-level patterns ship.\n        " })}</p>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("pages.designguide.ui_primitives.attr_title", { defaultValue: "UI primitives" })}>
            <div className="flex flex-wrap gap-2">
              {[
                "avatar", "badge", "breadcrumb", "button", "card", "checkbox", "collapsible",
                "command", "dialog", "dropdown-menu", "input", "label", "popover", "scroll-area",
                "select", "separator", "sheet", "skeleton", "tabs", "textarea", "tooltip",
              ].map((name) => (
                <Badge key={name} variant="outline" className="font-mono text-[10px]">
                  {name}
                </Badge>
              ))}
            </div>
          </SubSection>
          <SubSection title={t("pages.designguide.app_components.attr_title", { defaultValue: "App components" })}>
            <div className="flex flex-wrap gap-2">
              {[
                "StatusBadge", "StatusIcon", "PriorityIcon", "EntityRow", "EmptyState", "MetricCard",
                "FilterBar", "InlineEditor", "PageSkeleton", "Identity", "CommentThread", "MarkdownEditor",
                "PropertiesPanel", "Sidebar", "CommandPalette",
              ].map((name) => (
                <Badge key={name} variant="ghost" className="font-mono text-[10px]">
                  {name}
                </Badge>
              ))}
            </div>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COLORS                                                       */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.colors.attr_title", { defaultValue: "Colors" })}>
        <SubSection title={t("pages.designguide.core.attr_title", { defaultValue: "Core" })}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name="Background" cssVar="--background" />
            <Swatch name="Foreground" cssVar="--foreground" />
            <Swatch name="Card" cssVar="--card" />
            <Swatch name="Primary" cssVar="--primary" />
            <Swatch name="Primary foreground" cssVar="--primary-foreground" />
            <Swatch name="Secondary" cssVar="--secondary" />
            <Swatch name="Muted" cssVar="--muted" />
            <Swatch name="Muted foreground" cssVar="--muted-foreground" />
            <Swatch name="Accent" cssVar="--accent" />
            <Swatch name="Destructive" cssVar="--destructive" />
            <Swatch name="Border" cssVar="--border" />
            <Swatch name="Ring" cssVar="--ring" />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.sidebar.attr_title", { defaultValue: "Sidebar" })}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name="Sidebar" cssVar="--sidebar" />
            <Swatch name="Sidebar border" cssVar="--sidebar-border" />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.chart.attr_title", { defaultValue: "Chart" })}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Swatch name="Chart 1" cssVar="--chart-1" />
            <Swatch name="Chart 2" cssVar="--chart-2" />
            <Swatch name="Chart 3" cssVar="--chart-3" />
            <Swatch name="Chart 4" cssVar="--chart-4" />
            <Swatch name="Chart 5" cssVar="--chart-5" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TYPOGRAPHY                                                   */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.typography.attr_title", { defaultValue: "Typography" })}>
        <div className="space-y-3">
          <h2 className="text-xl font-bold">{t("pages.designguide.page_title_text_xl_font_bold.jsx-text", { defaultValue: "Page Title — text-xl font-bold" })}</h2>
          <h2 className="text-lg font-semibold">{t("pages.designguide.section_title_text_lg_font_semib.jsx-text", { defaultValue: "Section Title — text-lg font-semibold" })}</h2>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t("pages.designguide.section_heading_text_sm_font_sem.jsx-text", { defaultValue: "\n            Section Heading — text-sm font-semibold uppercase tracking-wide\n          " })}</h3>
          <p className="text-sm font-medium">{t("pages.designguide.card_title_text_sm_font_medium.jsx-text", { defaultValue: "Card Title — text-sm font-medium" })}</p>
          <p className="text-sm font-semibold">{t("pages.designguide.card_title_alt_text_sm_font_semi.jsx-text", { defaultValue: "Card Title Alt — text-sm font-semibold" })}</p>
          <p className="text-sm">{t("pages.designguide.body_text_text_sm.jsx-text", { defaultValue: "Body text — text-sm" })}</p>
          <p className="text-sm text-muted-foreground">
            {t("pages.designguide.muted_description_text_sm_text_m.jsx-text", { defaultValue: "\n            Muted description — text-sm text-muted-foreground\n          " })}</p>
          <p className="text-xs text-muted-foreground">
            {t("pages.designguide.tiny_label_text_xs_text_muted_fo.jsx-text", { defaultValue: "\n            Tiny label — text-xs text-muted-foreground\n          " })}</p>
          <p className="text-sm font-mono text-muted-foreground">
            {t("pages.designguide.mono_identifier_text_sm_font_mon.jsx-text", { defaultValue: "\n            Mono identifier — text-sm font-mono text-muted-foreground\n          " })}</p>
          <p className="text-2xl font-bold">{t("pages.designguide.large_stat_text_2xl_font_bold.jsx-text", { defaultValue: "Large stat — text-2xl font-bold" })}</p>
          <p className="font-mono text-xs">{t("pages.designguide.log_code_text_font_mono_text_xs.jsx-text", { defaultValue: "Log/code text — font-mono text-xs" })}</p>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SPACING & RADIUS                                             */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.radius.attr_title", { defaultValue: "Radius" })}>
        <div className="flex items-end gap-4 flex-wrap">
          {[
            ["sm", "var(--radius-sm)"],
            ["md", "var(--radius-md)"],
            ["lg", "var(--radius-lg)"],
            ["xl", "var(--radius-xl)"],
            ["full", "9999px"],
          ].map(([label, radius]) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className="h-12 w-12 bg-primary"
                style={{ borderRadius: radius }}
              />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  BUTTONS                                                      */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.buttons.attr_title", { defaultValue: "Buttons" })}>
        <SubSection title={t("pages.designguide.variants.attr_title", { defaultValue: "Variants" })}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="default">{t("pages.designguide.default.jsx-text", { defaultValue: "Default" })}</Button>
            <Button variant="secondary">{t("pages.designguide.secondary.jsx-text", { defaultValue: "Secondary" })}</Button>
            <Button variant="outline">{t("pages.designguide.outline.jsx-text", { defaultValue: "Outline" })}</Button>
            <Button variant="ghost">{t("pages.designguide.ghost.jsx-text", { defaultValue: "Ghost" })}</Button>
            <Button variant="destructive">{t("pages.designguide.destructive.jsx-text", { defaultValue: "Destructive" })}</Button>
            <Button variant="link">{t("pages.designguide.link.jsx-text", { defaultValue: "Link" })}</Button>
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.sizes.attr_title", { defaultValue: "Sizes" })}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="xs">{t("pages.designguide.extra_small.jsx-text", { defaultValue: "Extra Small" })}</Button>
            <Button size="sm">{t("pages.designguide.small.jsx-text", { defaultValue: "Small" })}</Button>
            <Button size="default">{t("pages.designguide.default.jsx-text", { defaultValue: "Default" })}</Button>
            <Button size="lg">{t("pages.designguide.large.jsx-text", { defaultValue: "Large" })}</Button>
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.icon_buttons.attr_title", { defaultValue: "Icon buttons" })}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="icon-xs"><Search /></Button>
            <Button variant="ghost" size="icon-sm"><Search /></Button>
            <Button variant="outline" size="icon"><Search /></Button>
            <Button variant="outline" size="icon-lg"><Search /></Button>
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.with_icons.attr_title", { defaultValue: "With icons" })}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button><Plus /> {t("pages.designguide.new_task.jsx-text", { defaultValue: " New Task" })}</Button>
            <Button variant="outline"><Upload /> {t("pages.designguide.upload.jsx-text", { defaultValue: " Upload" })}</Button>
            <Button variant="destructive"><Trash2 /> {t("pages.designguide.delete.jsx-text", { defaultValue: " Delete" })}</Button>
            <Button size="sm"><Plus /> {t("pages.designguide.add.jsx-text", { defaultValue: " Add" })}</Button>
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.states.attr_title", { defaultValue: "States" })}>
          <div className="flex items-center gap-2 flex-wrap">
            <Button disabled>{t("pages.designguide.disabled.jsx-text", { defaultValue: "Disabled" })}</Button>
            <Button variant="outline" disabled>{t("pages.designguide.disabled_outline.jsx-text", { defaultValue: "Disabled Outline" })}</Button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  BADGES                                                       */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.badges.attr_title", { defaultValue: "Badges" })}>
        <SubSection title={t("pages.designguide.variants.attr_title", { defaultValue: "Variants" })}>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="default">{t("pages.designguide.default.jsx-text", { defaultValue: "Default" })}</Badge>
            <Badge variant="secondary">{t("pages.designguide.secondary.jsx-text", { defaultValue: "Secondary" })}</Badge>
            <Badge variant="outline">{t("pages.designguide.outline.jsx-text", { defaultValue: "Outline" })}</Badge>
            <Badge variant="destructive">{t("pages.designguide.destructive.jsx-text", { defaultValue: "Destructive" })}</Badge>
            <Badge variant="ghost">{t("pages.designguide.ghost.jsx-text", { defaultValue: "Ghost" })}</Badge>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  STATUS BADGES & ICONS                                        */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.status_system.attr_title", { defaultValue: "Status System" })}>
        <SubSection title={t("pages.designguide.statusbadge_all_statuses.attr_title", { defaultValue: "StatusBadge (all statuses)" })}>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              "active", "running", "paused", "idle", "archived", "planned",
              "achieved", "completed", "failed", "timed_out", "succeeded", "error",
              "pending_approval", "backlog", "todo", "in_progress", "in_review", "blocked",
              "done", "terminated", "cancelled", "pending", "revision_requested",
              "approved", "rejected",
            ].map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.statusicon_interactive.attr_title", { defaultValue: "StatusIcon (interactive)" })}>
          <div className="flex items-center gap-3 flex-wrap">
            {["backlog", "todo", "in_progress", "in_review", "done", "cancelled", "blocked"].map(
              (s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <StatusIcon status={s} />
                  <span className="text-xs text-muted-foreground">{s}</span>
                </div>
              )
            )}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <StatusIcon status={status} onChange={setStatus} />
            <span className="text-sm">{t("pages.designguide.click_the_icon_to_change_status_.jsx-text", { defaultValue: "Click the icon to change status (current: " })}{status})</span>
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.priorityicon_interactive.attr_title", { defaultValue: "PriorityIcon (interactive)" })}>
          <div className="flex items-center gap-3 flex-wrap">
            {["critical", "high", "medium", "low"].map((p) => (
              <div key={p} className="flex items-center gap-1.5">
                <PriorityIcon priority={p} />
                <span className="text-xs text-muted-foreground">{p}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <PriorityIcon priority={priority} onChange={setPriority} />
            <span className="text-sm">{t("pages.designguide.click_the_icon_to_change_current.jsx-text", { defaultValue: "Click the icon to change (current: " })}{priority})</span>
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.agent_status_capsule_chip.attr_title", { defaultValue: "Agent status (capsule + chip)" })}>
          <p className="text-xs text-muted-foreground mb-3 max-w-prose">
            {t("pages.designguide.the_agents_section_uses_a_brand_.jsx-text", { defaultValue: "\n            The agents section uses a brand heartbeat capsule (8×16) plus a brand\n            " })}<code className="mx-1">{t("pages.designguide.task_chip.jsx-text", { defaultValue: ".task-chip" })}</code>{t("pages.designguide.four_states_only_idle_gray_runni.jsx-text", { defaultValue: ". Four states only: idle (gray), running (blue, pulses), paused (amber), error (red, blinks). Motion honors " })}<code>{t("pages.designguide.prefers_reduced_motion.jsx-text", { defaultValue: "prefers-reduced-motion" })}</code>.
          </p>
          <div className="flex items-center gap-6 flex-wrap">
            {(["idle", "running", "paused", "error"] as const).map((label) => (
              <div key={label} className="flex items-center gap-2">
                <AgentStatusCapsule status={label} />
                <AgentStatusBadge status={label} />
              </div>
            ))}
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.run_invocation_badges.attr_title", { defaultValue: "Run invocation badges" })}>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              ["timer", "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"],
              ["assignment", "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300"],
              ["on_demand", "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300"],
              ["automation", "bg-muted text-muted-foreground"],
            ].map(([label, cls]) => (
              <span key={label} className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
                {label}
              </span>
            ))}
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.issuereferencepill.attr_title", { defaultValue: "IssueReferencePill" })}>
          <p className="text-xs text-muted-foreground">
            {t("pages.designguide.used_wherever_a_task_is_referenc.jsx-text", { defaultValue: "\n            Used wherever a task is referenced — in markdown, the Related Work tab, and activity summaries. Pass " })}<code className="font-mono">{t("pages.designguide.status.jsx-text", { defaultValue: "status" })}</code> {t("pages.designguide.to_show_the_target_issue_apos_s_.jsx-text", { defaultValue: " to show the target issue&apos;s state at a glance. Use " })}<code className="font-mono">{t("pages.designguide.strikethrough.jsx-text", { defaultValue: "strikethrough" })}</code> {t("pages.designguide.for_quot_removed_quot_contexts.jsx-text", { defaultValue: " for &quot;removed&quot; contexts.\n          " })}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <IssueReferencePill issue={{ id: "demo-1", identifier: "PAP-123", title: "Identifier only — no status yet" }} />
            <IssueReferencePill issue={{ id: "demo-2", identifier: "PAP-456", title: "With in_progress status", status: "in_progress" }} />
            <IssueReferencePill issue={{ id: "demo-3", identifier: "PAP-789", title: "Done status", status: "done" }} />
            <IssueReferencePill issue={{ id: "demo-4", identifier: "PAP-101", title: "Blocked status", status: "blocked" }} />
            <IssueReferencePill strikethrough issue={{ id: "demo-5", identifier: "PAP-202", title: "Removed (strikethrough)", status: "todo" }} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  FORM ELEMENTS                                                */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.form_elements.attr_title", { defaultValue: "Form Elements" })}>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("pages.designguide.input.attr_title", { defaultValue: "Input" })}>
            <Input placeholder={t("pages.designguide.default_input.attr_placeholder", { defaultValue: "Default input" })} />
            <Input placeholder={t("pages.designguide.disabled_input.attr_placeholder", { defaultValue: "Disabled input" })} disabled className="mt-2" />
          </SubSection>

          <SubSection title={t("pages.designguide.textarea.attr_title", { defaultValue: "Textarea" })}>
            <Textarea placeholder={t("pages.designguide.write_something.attr_placeholder", { defaultValue: "Write something..." })} />
          </SubSection>

          <SubSection title={t("pages.designguide.checkbox_label.attr_title", { defaultValue: "Checkbox & Label" })}>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox id="check1" defaultChecked />
                <Label htmlFor="check1">{t("pages.designguide.checked_item.jsx-text", { defaultValue: "Checked item" })}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="check2" />
                <Label htmlFor="check2">{t("pages.designguide.unchecked_item.jsx-text", { defaultValue: "Unchecked item" })}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="check3" disabled />
                <Label htmlFor="check3">{t("pages.designguide.disabled_item.jsx-text", { defaultValue: "Disabled item" })}</Label>
              </div>
            </div>
          </SubSection>

          <SubSection title={t("pages.designguide.inline_editor.attr_title", { defaultValue: "Inline Editor" })}>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("pages.designguide.title_single_line.jsx-text", { defaultValue: "Title (single-line)" })}</p>
                <InlineEditor
                  value={inlineTitle}
                  onSave={setInlineTitle}
                  as="h2"
                  className="text-xl font-bold"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("pages.designguide.body_text_single_line.jsx-text", { defaultValue: "Body text (single-line)" })}</p>
                <InlineEditor
                  value={inlineText}
                  onSave={setInlineText}
                  as="p"
                  className="text-sm"
                />
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("pages.designguide.description_multiline_auto_sizin.jsx-text", { defaultValue: "Description (multiline, auto-sizing)" })}</p>
                <InlineEditor
                  value={inlineDesc}
                  onSave={setInlineDesc}
                  as="p"
                  className="text-sm text-muted-foreground"
                  placeholder={t("pages.designguide.add_a_description.attr_placeholder", { defaultValue: "Add a description..." })}
                  multiline
                />
              </div>
            </div>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SELECT                                                       */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.select.attr_title", { defaultValue: "Select" })}>
        <div className="grid gap-6 md:grid-cols-2">
          <SubSection title={t("pages.designguide.default_size.attr_title", { defaultValue: "Default size" })}>
            <Select value={selectValue} onValueChange={setSelectValue}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("pages.designguide.select_status.attr_placeholder", { defaultValue: "Select status" })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="backlog">{t("pages.designguide.backlog.jsx-text", { defaultValue: "Backlog" })}</SelectItem>
                <SelectItem value="todo">{t("pages.designguide.todo.jsx-text", { defaultValue: "Todo" })}</SelectItem>
                <SelectItem value="in_progress">{t("pages.designguide.in_progress.jsx-text", { defaultValue: "In Progress" })}</SelectItem>
                <SelectItem value="in_review">{t("pages.designguide.in_review.jsx-text", { defaultValue: "In Review" })}</SelectItem>
                <SelectItem value="done">{t("pages.designguide.done.jsx-text", { defaultValue: "Done" })}</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t("pages.designguide.current_value.jsx-text", { defaultValue: "Current value: " })}{selectValue}</p>
          </SubSection>
          <SubSection title={t("pages.designguide.small_trigger.attr_title", { defaultValue: "Small trigger" })}>
            <Select defaultValue="high">
              <SelectTrigger size="sm" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="critical">{t("pages.designguide.critical.jsx-text", { defaultValue: "Critical" })}</SelectItem>
                <SelectItem value="high">{t("pages.designguide.high.jsx-text", { defaultValue: "High" })}</SelectItem>
                <SelectItem value="medium">{t("pages.designguide.medium.jsx-text", { defaultValue: "Medium" })}</SelectItem>
                <SelectItem value="low">{t("pages.designguide.low.jsx-text", { defaultValue: "Low" })}</SelectItem>
              </SelectContent>
            </Select>
          </SubSection>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DROPDOWN MENU                                                */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.dropdown_menu.attr_title", { defaultValue: "Dropdown Menu" })}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {t("pages.designguide.quick_actions.jsx-text", { defaultValue: "\n              Quick Actions\n              " })}<ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem>
              <Check className="h-4 w-4" />
              {t("pages.designguide.mark_as_done.jsx-text", { defaultValue: "\n              Mark as done\n              " })}<DropdownMenuShortcut>{t("pages.designguide.d.jsx-text", { defaultValue: "⌘D" })}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <BookOpen className="h-4 w-4" />
              {t("pages.designguide.open_docs.jsx-text", { defaultValue: "\n              Open docs\n            " })}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={menuChecked}
              onCheckedChange={(value) => setMenuChecked(value === true)}
            >
              {t("pages.designguide.watch_task.jsx-text", { defaultValue: "\n              Watch task\n            " })}</DropdownMenuCheckboxItem>
            <DropdownMenuItem variant="destructive">
              <Trash2 className="h-4 w-4" />
              {t("pages.designguide.delete_task.jsx-text", { defaultValue: "\n              Delete task\n            " })}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </Section>

      {/* ============================================================ */}
      {/*  POPOVER                                                      */}
      {/* ============================================================ */}
      <Section title="Popover">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">{t("pages.designguide.open_popover.jsx-text", { defaultValue: "Open Popover" })}</Button>
          </PopoverTrigger>
          <PopoverContent className="space-y-2">
            <p className="text-sm font-medium">{t("pages.designguide.agent_heartbeat.jsx-text", { defaultValue: "Agent heartbeat" })}</p>
            <p className="text-xs text-muted-foreground">
              {t("pages.designguide.last_run_succeeded_24s_ago_next_.jsx-text", { defaultValue: "\n              Last run succeeded 24s ago. Next timer run in 9m.\n            " })}</p>
            <Button size="xs">{t("pages.designguide.wake_now.jsx-text", { defaultValue: "Wake now" })}</Button>
          </PopoverContent>
        </Popover>
      </Section>

      {/* ============================================================ */}
      {/*  COLLAPSIBLE                                                  */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.collapsible.attr_title", { defaultValue: "Collapsible" })}>
        <Collapsible open={collapsibleOpen} onOpenChange={setCollapsibleOpen} className="space-y-2">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm">
              {collapsibleOpen ? "Hide" : "Show"} {t("pages.designguide.advanced_filters.jsx-text", { defaultValue: " advanced filters\n            " })}</Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="rounded-md border border-border p-3">
            <div className="space-y-2">
              <Label htmlFor="owner-filter">{t("pages.designguide.owner.jsx-text", { defaultValue: "Owner" })}</Label>
              <Input id="owner-filter" placeholder={t("pages.designguide.filter_by_agent_name.attr_placeholder", { defaultValue: "Filter by agent name" })} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </Section>

      {/* ============================================================ */}
      {/*  SHEET                                                        */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.sheet.attr_title", { defaultValue: "Sheet" })}>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">{t("pages.designguide.open_side_panel.jsx-text", { defaultValue: "Open Side Panel" })}</Button>
          </SheetTrigger>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>{t("pages.designguide.task_properties.jsx-text", { defaultValue: "Task Properties" })}</SheetTitle>
              <SheetDescription>{t("pages.designguide.edit_metadata_without_leaving_th.jsx-text", { defaultValue: "Edit metadata without leaving the current page." })}</SheetDescription>
            </SheetHeader>
            <div className="space-y-4 px-4">
              <div className="space-y-1">
                <Label htmlFor="sheet-title">{t("pages.designguide.title.jsx-text", { defaultValue: "Title" })}</Label>
                <Input id="sheet-title" defaultValue="Improve onboarding docs" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sheet-description">{t("pages.designguide.description.jsx-text", { defaultValue: "Description" })}</Label>
                <Textarea id="sheet-description" defaultValue="Capture setup pitfalls and screenshots." />
              </div>
            </div>
            <SheetFooter>
              <Button variant="outline">{t("pages.designguide.cancel.jsx-text", { defaultValue: "Cancel" })}</Button>
              <Button>{t("pages.designguide.save.jsx-text", { defaultValue: "Save" })}</Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </Section>

      {/* ============================================================ */}
      {/*  SCROLL AREA                                                  */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.scroll_area.attr_title", { defaultValue: "Scroll Area" })}>
        <ScrollArea className="h-36 rounded-md border border-border">
          <div className="space-y-2 p-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-md border border-border p-2 text-sm">
                {t("pages.designguide.heartbeat_run.jsx-text", { defaultValue: "\n                Heartbeat run #" })}{i + 1}{t("pages.designguide.completed_successfully.jsx-text", { defaultValue: ": completed successfully\n              " })}</div>
            ))}
          </div>
        </ScrollArea>
      </Section>

      {/* ============================================================ */}
      {/*  COMMAND                                                      */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.command_cmdk.attr_title", { defaultValue: "Command (CMDK)" })}>
        <div className="rounded-md border border-border">
          <Command>
            <CommandInput placeholder={t("pages.designguide.type_a_command_or_search.attr_placeholder", { defaultValue: "Type a command or search..." })} />
            <CommandList>
              <CommandEmpty>{t("pages.designguide.no_results_found.jsx-text", { defaultValue: "No results found." })}</CommandEmpty>
              <CommandGroup heading="Pages">
                <CommandItem>
                  <LayoutDashboard className="h-4 w-4" />
                  {t("pages.designguide.dashboard.jsx-text", { defaultValue: "\n                  Dashboard\n                " })}</CommandItem>
                <CommandItem>
                  <CircleDot className="h-4 w-4" />
                  {t("pages.designguide.tasks.jsx-text", { defaultValue: "\n                  Tasks\n                " })}</CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Actions">
                <CommandItem>
                  <CommandIcon className="h-4 w-4" />
                  {t("pages.designguide.open_command_palette.jsx-text", { defaultValue: "\n                  Open command palette\n                " })}</CommandItem>
                <CommandItem>
                  <Plus className="h-4 w-4" />
                  {t("pages.designguide.create_new_task.jsx-text", { defaultValue: "\n                  Create new task\n                " })}</CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  BREADCRUMB                                                   */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.breadcrumb.attr_title", { defaultValue: "Breadcrumb" })}>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="#">{t("pages.designguide.projects.jsx-text", { defaultValue: "Projects" })}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="#">{t("pages.designguide.paperclip_app.jsx-text", { defaultValue: "Paperclip App" })}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{t("pages.designguide.task_list.jsx-text", { defaultValue: "Task List" })}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </Section>

      {/* ============================================================ */}
      {/*  CARDS                                                        */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.cards.attr_title", { defaultValue: "Cards" })}>
        <SubSection title={t("pages.designguide.standard_card.attr_title", { defaultValue: "Standard Card" })}>
          <Card>
            <CardHeader>
              <CardTitle>{t("pages.designguide.card_title.jsx-text", { defaultValue: "Card Title" })}</CardTitle>
              <CardDescription>{t("pages.designguide.card_description_with_supporting.jsx-text", { defaultValue: "Card description with supporting text." })}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{t("pages.designguide.card_content_goes_here_this_is_t.jsx-text", { defaultValue: "Card content goes here. This is the main body area." })}</p>
            </CardContent>
            <CardFooter className="gap-2">
              <Button size="sm">Action</Button>
              <Button variant="outline" size="sm">{t("pages.designguide.cancel.jsx-text", { defaultValue: "Cancel" })}</Button>
            </CardFooter>
          </Card>
        </SubSection>

        <SubSection title={t("pages.designguide.metric_cards.attr_title", { defaultValue: "Metric Cards" })}>
          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard icon={Bot} value={12} label={t("pages.designguide.active_agents.attr_label", { defaultValue: "Active Agents" })} description="+3 this week" />
            <MetricCard icon={CircleDot} value={48} label={t("pages.designguide.open_tasks.attr_label", { defaultValue: "Open Tasks" })} />
            <MetricCard icon={DollarSign} value="$1,234" label={t("pages.designguide.monthly_cost.attr_label", { defaultValue: "Monthly Cost" })} description="Under budget" />
            <MetricCard icon={Zap} value="99.9%" label={t("pages.designguide.uptime.attr_label", { defaultValue: "Uptime" })} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TABS                                                         */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.tabs.attr_title", { defaultValue: "Tabs" })}>
        <SubSection title={t("pages.designguide.default_pill_variant.attr_title", { defaultValue: "Default (pill) variant" })}>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">{t("pages.designguide.overview.jsx-text", { defaultValue: "Overview" })}</TabsTrigger>
              <TabsTrigger value="runs">{t("pages.designguide.runs.jsx-text", { defaultValue: "Runs" })}</TabsTrigger>
              <TabsTrigger value="config">{t("pages.designguide.config.jsx-text", { defaultValue: "Config" })}</TabsTrigger>
              <TabsTrigger value="costs">{t("pages.designguide.costs.jsx-text", { defaultValue: "Costs" })}</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="text-sm text-muted-foreground py-4">{t("pages.designguide.overview_tab_content.jsx-text", { defaultValue: "Overview tab content." })}</p>
            </TabsContent>
            <TabsContent value="runs">
              <p className="text-sm text-muted-foreground py-4">{t("pages.designguide.runs_tab_content.jsx-text", { defaultValue: "Runs tab content." })}</p>
            </TabsContent>
            <TabsContent value="config">
              <p className="text-sm text-muted-foreground py-4">{t("pages.designguide.config_tab_content.jsx-text", { defaultValue: "Config tab content." })}</p>
            </TabsContent>
            <TabsContent value="costs">
              <p className="text-sm text-muted-foreground py-4">{t("pages.designguide.costs_tab_content.jsx-text", { defaultValue: "Costs tab content." })}</p>
            </TabsContent>
          </Tabs>
        </SubSection>

        <SubSection title={t("pages.designguide.line_variant.attr_title", { defaultValue: "Line variant" })}>
          <Tabs defaultValue="summary">
            <TabsList variant="line">
              <TabsTrigger value="summary">{t("pages.designguide.summary.jsx-text", { defaultValue: "Summary" })}</TabsTrigger>
              <TabsTrigger value="details">{t("pages.designguide.details.jsx-text", { defaultValue: "Details" })}</TabsTrigger>
              <TabsTrigger value="comments">{t("pages.designguide.comments.jsx-text", { defaultValue: "Comments" })}</TabsTrigger>
            </TabsList>
            <TabsContent value="summary">
              <p className="text-sm text-muted-foreground py-4">{t("pages.designguide.summary_content_with_underline_t.jsx-text", { defaultValue: "Summary content with underline tabs." })}</p>
            </TabsContent>
            <TabsContent value="details">
              <p className="text-sm text-muted-foreground py-4">{t("pages.designguide.details_content.jsx-text", { defaultValue: "Details content." })}</p>
            </TabsContent>
            <TabsContent value="comments">
              <p className="text-sm text-muted-foreground py-4">{t("pages.designguide.comments_content.jsx-text", { defaultValue: "Comments content." })}</p>
            </TabsContent>
          </Tabs>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  ENTITY ROWS                                                  */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.entity_rows.attr_title", { defaultValue: "Entity Rows" })}>
        <div className="border border-border rounded-md">
          <EntityRow
            leading={
              <>
                <StatusIcon status="in_progress" />
                <PriorityIcon priority="high" />
              </>
            }
            identifier="PAP-001"
            title={t("pages.designguide.implement_authentication_flow.attr_title", { defaultValue: "Implement authentication flow" })}
            subtitle="Assigned to Agent Alpha"
            trailing={<StatusBadge status="in_progress" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="done" />
                <PriorityIcon priority="medium" />
              </>
            }
            identifier="PAP-002"
            title={t("pages.designguide.set_up_ci_cd_pipeline.attr_title", { defaultValue: "Set up CI/CD pipeline" })}
            subtitle="Completed 2 days ago"
            trailing={<StatusBadge status="done" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="todo" />
                <PriorityIcon priority="low" />
              </>
            }
            identifier="PAP-003"
            title={t("pages.designguide.write_api_documentation.attr_title", { defaultValue: "Write API documentation" })}
            trailing={<StatusBadge status="todo" />}
            onClick={() => {}}
          />
          <EntityRow
            leading={
              <>
                <StatusIcon status="blocked" />
                <PriorityIcon priority="critical" />
              </>
            }
            identifier="PAP-004"
            title={t("pages.designguide.deploy_to_production.attr_title", { defaultValue: "Deploy to production" })}
            subtitle="Blocked by PAP-001"
            trailing={<StatusBadge status="blocked" />}
            selected
          />
        </div>
        <SubSection title={t("pages.designguide.membership_action.attr_title", { defaultValue: "Membership action" })}>
          <div className="border border-border rounded-md">
            <EntityRow
              title={t("pages.designguide.joined_resource.attr_title", { defaultValue: "Joined resource" })}
              subtitle="Hover or focus the row to reveal the reserved action slot."
              className="group"
              trailing={
                <MembershipAction
                  state="joined"
                  resourceName="Joined resource"
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("pages.designguide.left_resource.attr_title", { defaultValue: "Left resource" })}
              subtitle="Persistent action with dimmed row content."
              className="group text-foreground/55"
              trailing={
                <MembershipAction
                  state="left"
                  resourceName="Left resource"
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("pages.designguide.leaving_resource.attr_title", { defaultValue: "Leaving resource" })}
              subtitle="Disabled while the optimistic mutation is pending."
              className="group text-foreground/55"
              trailing={
                <MembershipAction
                  state="left"
                  pending
                  pendingState="left"
                  resourceName="Leaving resource"
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
            <EntityRow
              title={t("pages.designguide.joining_resource.attr_title", { defaultValue: "Joining resource" })}
              subtitle="The target state is visible immediately while the server confirms."
              className="group"
              trailing={
                <MembershipAction
                  state="joined"
                  pending
                  pendingState="joined"
                  resourceName="Joining resource"
                  onJoin={() => {}}
                  onLeave={() => {}}
                />
              }
            />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  FILTER BAR                                                   */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.filter_bar.attr_title", { defaultValue: "Filter Bar" })}>
        <FilterBar
          filters={filters}
          onRemove={(key) => setFilters((f) => f.filter((x) => x.key !== key))}
          onClear={() => setFilters([])}
        />
        {filters.length === 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setFilters([
                { key: "status", label: "Status", value: "Active" },
                { key: "priority", label: "Priority", value: "High" },
              ])
            }
          >
            {t("pages.designguide.reset_filters.jsx-text", { defaultValue: "\n            Reset filters\n          " })}</Button>
        )}
      </Section>

      {/* ============================================================ */}
      {/*  AVATARS                                                      */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.avatars.attr_title", { defaultValue: "Avatars" })}>
        <SubSection title={t("pages.designguide.sizes.attr_title", { defaultValue: "Sizes" })}>
          <div className="flex items-center gap-3">
            <Avatar size="sm"><AvatarFallback>SM</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>DF</AvatarFallback></Avatar>
            <Avatar size="lg"><AvatarFallback>LG</AvatarFallback></Avatar>
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.group.attr_title", { defaultValue: "Group" })}>
          <AvatarGroup>
            <Avatar><AvatarFallback>A1</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>A2</AvatarFallback></Avatar>
            <Avatar><AvatarFallback>A3</AvatarFallback></Avatar>
            <AvatarGroupCount>{t("pages.designguide.5.jsx-text", { defaultValue: "+5" })}</AvatarGroupCount>
          </AvatarGroup>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  IDENTITY                                                     */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.identity.attr_title", { defaultValue: "Identity" })}>
        <SubSection title={t("pages.designguide.sizes.attr_title", { defaultValue: "Sizes" })}>
          <div className="flex items-center gap-6">
            <Identity name="Agent Alpha" size="sm" />
            <Identity name="Agent Alpha" />
            <Identity name="Agent Alpha" size="lg" />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.initials_derivation.attr_title", { defaultValue: "Initials derivation" })}>
          <div className="flex flex-col gap-2">
            <Identity name="CEO Agent" size="sm" />
            <Identity name="Alpha" size="sm" />
            <Identity name="Quality Assurance Lead" size="sm" />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.custom_initials.attr_title", { defaultValue: "Custom initials" })}>
          <Identity name="Backend Service" initials="BS" size="sm" />
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  TOOLTIPS                                                     */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.tooltips.attr_title", { defaultValue: "Tooltips" })}>
        <div className="flex items-center gap-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm">{t("pages.designguide.hover_me.jsx-text", { defaultValue: "Hover me" })}</Button>
            </TooltipTrigger>
            <TooltipContent>{t("pages.designguide.this_is_a_tooltip.jsx-text", { defaultValue: "This is a tooltip" })}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm"><Settings /></Button>
            </TooltipTrigger>
            <TooltipContent>{t("pages.designguide.settings.jsx-text", { defaultValue: "Settings" })}</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  DIALOG                                                       */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.dialog.attr_title", { defaultValue: "Dialog" })}>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">{t("pages.designguide.open_dialog.jsx-text", { defaultValue: "Open Dialog" })}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("pages.designguide.dialog_title.jsx-text", { defaultValue: "Dialog Title" })}</DialogTitle>
              <DialogDescription>
                {t("pages.designguide.this_is_a_sample_dialog_showing_.jsx-text", { defaultValue: "\n                This is a sample dialog showing the standard layout with header, content, and footer.\n              " })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input placeholder={t("pages.designguide.enter_a_name.attr_placeholder", { defaultValue: "Enter a name" })} className="mt-1.5" />
              </div>
              <div>
                <Label>{t("pages.designguide.description.jsx-text", { defaultValue: "Description" })}</Label>
                <Textarea placeholder={t("pages.designguide.describe.attr_placeholder", { defaultValue: "Describe..." })} className="mt-1.5" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline">{t("pages.designguide.cancel.jsx-text", { defaultValue: "Cancel" })}</Button>
              <Button>{t("pages.designguide.save.jsx-text", { defaultValue: "Save" })}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Section>

      {/* ============================================================ */}
      {/*  EMPTY STATE                                                  */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.empty_state.attr_title", { defaultValue: "Empty State" })}>
        <div className="border border-border rounded-md">
          <EmptyState
            icon={Inbox}
            message="No items to show. Create your first one to get started."
            action="Create Item"
            onAction={() => {}}
          />
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PROGRESS BARS                                                */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.progress_bars_budget.attr_title", { defaultValue: "Progress Bars (Budget)" })}>
        <div className="space-y-3">
          {[
            { label: "Under budget (40%)", pct: 40, color: "bg-green-400" },
            { label: "Warning (75%)", pct: 75, color: "bg-yellow-400" },
            { label: "Over budget (95%)", pct: 95, color: "bg-red-400" },
          ].map(({ label, pct, color }) => (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-mono">{pct}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width,background-color] duration-150 ${color}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  LOG VIEWER                                                   */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.log_viewer.attr_title", { defaultValue: "Log Viewer" })}>
        <div className="bg-neutral-950 rounded-lg p-3 font-mono text-xs max-h-80 overflow-y-auto">
          <div className="text-foreground">{t("pages.designguide.12_00_01_info_agent_started_succ.jsx-text", { defaultValue: "[12:00:01] INFO Agent started successfully" })}</div>
          <div className="text-foreground">{t("pages.designguide.12_00_02_info_processing_task_pa.jsx-text", { defaultValue: "[12:00:02] INFO Processing task PAP-001" })}</div>
          <div className="text-yellow-400">{t("pages.designguide.12_00_05_warn_rate_limit_approac.jsx-text", { defaultValue: "[12:00:05] WARN Rate limit approaching (80%)" })}</div>
          <div className="text-foreground">{t("pages.designguide.12_00_08_info_task_pap_001_compl.jsx-text", { defaultValue: "[12:00:08] INFO Task PAP-001 completed" })}</div>
          <div className="text-red-400">{t("pages.designguide.12_00_12_error_connection_timeou.jsx-text", { defaultValue: "[12:00:12] ERROR Connection timeout to upstream service" })}</div>
          <div className="text-blue-300">{t("pages.designguide.12_00_12_sys_retrying_connection.jsx-text", { defaultValue: "[12:00:12] SYS Retrying connection in 5s..." })}</div>
          <div className="text-foreground">{t("pages.designguide.12_00_17_info_reconnected_succes.jsx-text", { defaultValue: "[12:00:17] INFO Reconnected successfully" })}</div>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-cyan-400 animate-pulse" />
              <span className="inline-flex h-full w-full rounded-full bg-cyan-400" />
            </span>
            <span className="text-cyan-400">{t("pages.designguide.live.jsx-text", { defaultValue: "Live" })}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  PROPERTY ROW PATTERN                                         */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.property_row_pattern.attr_title", { defaultValue: "Property Row Pattern" })}>
        <div className="border border-border rounded-md p-4 space-y-1 max-w-sm">
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("pages.designguide.status.jsx-text", { defaultValue: "Status" })}</span>
            <StatusBadge status="active" />
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("pages.designguide.priority.jsx-text", { defaultValue: "Priority" })}</span>
            <PriorityIcon priority="high" />
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("pages.designguide.assignee.jsx-text", { defaultValue: "Assignee" })}</span>
            <div className="flex items-center gap-1.5">
              <Avatar size="sm"><AvatarFallback>A</AvatarFallback></Avatar>
              <span className="text-xs">{t("pages.designguide.agent_alpha.jsx-text", { defaultValue: "Agent Alpha" })}</span>
            </div>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-xs text-muted-foreground">{t("pages.designguide.created.jsx-text", { defaultValue: "Created" })}</span>
            <span className="text-xs">{t("pages.designguide.jan_15_2025.jsx-text", { defaultValue: "Jan 15, 2025" })}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  NAVIGATION PATTERNS                                          */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.navigation_patterns.attr_title", { defaultValue: "Navigation Patterns" })}>
        <SubSection title={t("pages.designguide.sidebar_nav_items.attr_title", { defaultValue: "Sidebar nav items" })}>
          <div className="w-60 border border-border rounded-md p-3 space-y-0.5 bg-card">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium bg-accent text-accent-foreground">
              <LayoutDashboard className="h-4 w-4" />
              {t("pages.designguide.dashboard.jsx-text", { defaultValue: "\n              Dashboard\n            " })}</div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <CircleDot className="h-4 w-4" />
              {t("pages.designguide.tasks.jsx-text", { defaultValue: "\n              Tasks\n              " })}<span className="ml-auto text-xs bg-primary text-primary-foreground rounded-full px-1.5 py-0.5">
                12
              </span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <Bot className="h-4 w-4" />
              {t("pages.designguide.agents.jsx-text", { defaultValue: "\n              Agents\n            " })}</div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground cursor-pointer">
              <Hexagon className="h-4 w-4" />
              {t("pages.designguide.projects.jsx-text", { defaultValue: "\n              Projects\n            " })}</div>
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.view_toggle.attr_title", { defaultValue: "View toggle" })}>
          <div className="flex items-center border border-border rounded-md w-fit">
            <button className="px-3 py-1.5 text-xs font-medium bg-accent text-foreground rounded-l-md">
              <ListTodo className="h-3.5 w-3.5 inline mr-1" />
              {t("pages.designguide.list.jsx-text", { defaultValue: "\n              List\n            " })}</button>
            <button className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent/50 rounded-r-md">
              <Target className="h-3.5 w-3.5 inline mr-1" />
              {t("pages.designguide.org.jsx-text", { defaultValue: "\n              Org\n            " })}</button>
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  GROUPED LIST (Issues pattern)                                */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.grouped_list_tasks_pattern.attr_title", { defaultValue: "Grouped List (Tasks pattern)" })}>
        <div>
          <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-t-md">
            <StatusIcon status="in_progress" />
            <span className="text-sm font-medium">{t("pages.designguide.in_progress.jsx-text", { defaultValue: "In Progress" })}</span>
            <span className="text-xs text-muted-foreground ml-1">2</span>
          </div>
          <div className="border border-border rounded-b-md">
            <EntityRow
              leading={<PriorityIcon priority="high" />}
              identifier="PAP-101"
              title={t("pages.designguide.build_agent_heartbeat_system.attr_title", { defaultValue: "Build agent heartbeat system" })}
              onClick={() => {}}
            />
            <EntityRow
              leading={<PriorityIcon priority="medium" />}
              identifier="PAP-102"
              title={t("pages.designguide.add_cost_tracking_dashboard.attr_title", { defaultValue: "Add cost tracking dashboard" })}
              onClick={() => {}}
            />
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COMMENT THREAD PATTERN                                       */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.comment_thread_pattern.attr_title", { defaultValue: "Comment Thread Pattern" })}>
        <div className="space-y-3 max-w-2xl">
          <h3 className="text-sm font-semibold">{t("pages.designguide.comments_2.jsx-text", { defaultValue: "Comments (2)" })}</h3>
          <div className="space-y-3">
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{t("pages.designguide.agent.jsx-text", { defaultValue: "Agent" })}</span>
                <span className="text-xs text-muted-foreground">{t("pages.designguide.jan_15_2025.jsx-text", { defaultValue: "Jan 15, 2025" })}</span>
              </div>
              <p className="text-sm">{t("pages.designguide.started_working_on_the_authentic.jsx-text", { defaultValue: "Started working on the authentication module. Will need API keys configured." })}</p>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground">{t("pages.designguide.human.jsx-text", { defaultValue: "Human" })}</span>
                <span className="text-xs text-muted-foreground">{t("pages.designguide.jan_16_2025.jsx-text", { defaultValue: "Jan 16, 2025" })}</span>
              </div>
              <p className="text-sm">{t("pages.designguide.api_keys_have_been_added_to_the_.jsx-text", { defaultValue: "API keys have been added to the vault. Please proceed." })}</p>
            </div>
          </div>
          <div className="space-y-2">
            <Textarea placeholder={t("pages.designguide.leave_a_comment.attr_placeholder", { defaultValue: "Leave a comment..." })} rows={3} />
            <Button size="sm">{t("pages.designguide.comment.jsx-text", { defaultValue: "Comment" })}</Button>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  COST TABLE PATTERN                                           */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.cost_table_pattern.attr_title", { defaultValue: "Cost Table Pattern" })}>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="border-b border-border bg-accent/20">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.designguide.model.jsx-text", { defaultValue: "Model" })}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.designguide.tokens.jsx-text", { defaultValue: "Tokens" })}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("pages.designguide.cost.jsx-text", { defaultValue: "Cost" })}</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-border">
                <td className="px-3 py-2">{t("pages.designguide.claude_sonnet_4_20250514.jsx-text", { defaultValue: "claude-sonnet-4-20250514" })}</td>
                <td className="px-3 py-2 font-mono">{t("pages.designguide.1_2m.jsx-text", { defaultValue: "1.2M" })}</td>
                <td className="px-3 py-2 font-mono">$18.00</td>
              </tr>
              <tr className="border-b border-border">
                <td className="px-3 py-2">{t("pages.designguide.claude_haiku_4_20250506.jsx-text", { defaultValue: "claude-haiku-4-20250506" })}</td>
                <td className="px-3 py-2 font-mono">{t("pages.designguide.500k.jsx-text", { defaultValue: "500k" })}</td>
                <td className="px-3 py-2 font-mono">$1.25</td>
              </tr>
              <tr>
                <td className="px-3 py-2 font-medium">{t("pages.designguide.total.jsx-text", { defaultValue: "Total" })}</td>
                <td className="px-3 py-2 font-mono">{t("pages.designguide.1_7m.jsx-text", { defaultValue: "1.7M" })}</td>
                <td className="px-3 py-2 font-mono font-medium">$19.25</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  SKELETONS                                                    */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.skeletons.attr_title", { defaultValue: "Skeletons" })}>
        <SubSection title={t("pages.designguide.individual.attr_title", { defaultValue: "Individual" })}>
          <div className="space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-8 w-full max-w-sm" />
            <Skeleton className="h-20 w-full" />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.page_skeleton_list.attr_title", { defaultValue: "Page Skeleton (list)" })}>
          <div className="border border-border rounded-md p-4">
            <PageSkeleton variant="list" />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.page_skeleton_detail.attr_title", { defaultValue: "Page Skeleton (detail)" })}>
          <div className="border border-border rounded-md p-4">
            <PageSkeleton variant="detail" />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      {/*  SEPARATOR                                                    */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.separator.attr_title", { defaultValue: "Separator" })}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("pages.designguide.horizontal.jsx-text", { defaultValue: "Horizontal" })}</p>
          <Separator />
          <div className="flex items-center gap-4 h-8">
            <span className="text-sm">{t("pages.designguide.left.jsx-text", { defaultValue: "Left" })}</span>
            <Separator orientation="vertical" />
            <span className="text-sm">{t("pages.designguide.right.jsx-text", { defaultValue: "Right" })}</span>
          </div>
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  ICON REFERENCE                                               */}
      {/* ============================================================ */}
      {/*  TEAM CATALOG                                                 */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.team_catalog.attr_title", { defaultValue: "Team Catalog" })}>
        <p className="text-sm text-muted-foreground">
          {t("pages.designguide.components_from_the_team_catalog.jsx-text", { defaultValue: "\n          Components from the Team Catalog browse/install surface (" })}<code className="font-mono text-xs">/teams-catalog</code>{t("pages.designguide.fixtures_are_shared_with_the_sto.jsx-text", { defaultValue: "). Fixtures are shared with the Storybook stories.\n        " })}</p>

        <SubSection title={t("pages.designguide.teamrow_browse_list.attr_title", { defaultValue: "TeamRow (browse list)" })}>
          <div className="w-[28rem] rounded-md border border-border">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("pages.designguide.bundled_1.jsx-text", { defaultValue: "\n              Bundled · 1\n            " })}</div>
            <TeamRow team={sampleTeam} selected onSelect={() => {}} />
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("pages.designguide.optional_2.jsx-text", { defaultValue: "\n              Optional · 2\n            " })}</div>
            <TeamRow team={optionalTeam} selected={false} onSelect={() => {}} />
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("pages.designguide.installed_2.jsx-text", { defaultValue: "\n              Installed · 2\n            " })}</div>
            <TeamRow team={sampleTeam} selected={false} onSelect={() => {}} installed={outOfDateInstalledState} />
            <TeamRow team={warnTeam} selected={false} onSelect={() => {}} installed={currentInstalledState} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("pages.designguide.installed_teams_collapse_under.jsx-text", { defaultValue: "\n            Installed teams collapse under " })}<code className="font-mono">{t("pages.designguide.installed_n.jsx-text", { defaultValue: "INSTALLED · N" })}</code>{t("pages.designguide.an_out_of_date_install_server.jsx-text", { defaultValue: "; an out-of-date install (server " })}<code className="font-mono">{t("pages.designguide.originhash.jsx-text", { defaultValue: "originHash" })}</code> {t("pages.designguide.catalog.jsx-text", { defaultValue: " ≠ catalog " })}<code className="font-mono">{t("pages.designguide.contenthash.jsx-text", { defaultValue: "contentHash" })}</code>{t("pages.designguide.shows_the_amber.jsx-text", { defaultValue: ") shows the amber " })}<code className="font-mono">↑</code> {t("pages.designguide.badge_pap_10256.jsx-text", { defaultValue: " badge (PAP-10256).\n          " })}</p>
        </SubSection>

        <SubSection title={t("pages.designguide.teamcard_onboarding_grid.attr_title", { defaultValue: "TeamCard (onboarding grid)" })}>
          <p className="text-xs text-muted-foreground">
            {t("pages.designguide.square_tile_for_the_onboarding_l.jsx-text", { defaultValue: "\n            Square tile for the onboarding &ldquo;Pick a starter team&rdquo; grid. Selected tile gets" })}{" "}
            <code className="font-mono">{t("pages.designguide.ring_2_ring_ring.jsx-text", { defaultValue: "ring-2 ring-ring" })}</code>{t("pages.designguide.drives_the.jsx-text", { defaultValue: ". Drives the" })}{" "}
            <code className="font-mono">{t("pages.designguide.useinstallteamcatalogentry.jsx-text", { defaultValue: "useInstallTeamCatalogEntry" })}</code> {t("pages.designguide.simplified_flow.jsx-text", { defaultValue: " simplified flow.\n          " })}</p>
          <TeamCardShowcase />
        </SubSection>

        <SubSection title={t("pages.designguide.teamhierarchypreview.attr_title", { defaultValue: "TeamHierarchyPreview" })}>
          <div className="max-w-md">
            <TeamHierarchyPreview team={sampleTeam} />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.requiredskillslist.attr_title", { defaultValue: "RequiredSkillsList" })}>
          <div className="max-w-xl">
            <RequiredSkillsList skills={sampleTeam.requiredSkills} />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.envinputslist.attr_title", { defaultValue: "EnvInputsList" })}>
          <div className="max-w-xl">
            <EnvInputsList inputs={sampleTeam.envInputs} />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.externalsourceslist.attr_title", { defaultValue: "ExternalSourcesList" })}>
          <div className="max-w-xl">
            <ExternalSourcesList sources={sampleTeam.sourceRefs} />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.source_policy_step_stepsourcepol.attr_title", { defaultValue: "Source policy step (StepSourcePolicy)" })}>
          <div className="max-w-xl rounded-md border border-border p-4">
            <StepSourcePolicy
              team={warnTeam}
              allowExternalSources={allowExternal}
              allowUnpinnedOptionalSources={allowUnpinned}
              allowLocalPathSources={allowLocalPath}
              onChange={(key, value) => {
                if (key === "external") setAllowExternal(value);
                if (key === "unpinned") setAllowUnpinned(value);
                if (key === "localPath") setAllowLocalPath(value);
              }}
            />
          </div>
        </SubSection>

        <SubSection title={t("pages.designguide.skill_plan_step_stepskillplan.attr_title", { defaultValue: "Skill plan step (StepSkillPlan)" })}>
          <div className="max-w-xl rounded-md border border-border p-4">
            <StepSkillPlan team={sampleTeam} preparations={sampleSkillPreparations} />
          </div>
        </SubSection>
      </Section>

      {/* ============================================================ */}
      <Section title={t("pages.designguide.common_icons_lucide.attr_title", { defaultValue: "Common Icons (Lucide)" })}>
        <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
          {[
            ["Inbox", Inbox],
            ["ListTodo", ListTodo],
            ["CircleDot", CircleDot],
            ["Hexagon", Hexagon],
            ["Target", Target],
            ["LayoutDashboard", LayoutDashboard],
            ["Bot", Bot],
            ["DollarSign", DollarSign],
            ["History", History],
            ["Search", Search],
            ["Plus", Plus],
            ["Trash2", Trash2],
            ["Settings", Settings],
            ["User", User],
            ["Mail", Mail],
            ["Upload", Upload],
            ["Zap", Zap],
          ].map(([name, Icon]) => {
            const LucideIcon = Icon as React.FC<{ className?: string }>;
            return (
              <div key={name as string} className="flex flex-col items-center gap-1.5 p-2">
                <LucideIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground font-mono">{name as string}</span>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ============================================================ */}
      {/*  KEYBOARD SHORTCUTS                                           */}
      {/* ============================================================ */}
      <Section title={t("pages.designguide.keyboard_shortcuts.attr_title", { defaultValue: "Keyboard Shortcuts" })}>
        <div className="border border-border rounded-md divide-y divide-border text-sm">
          {[
            ["Cmd+K / Ctrl+K", "Open Command Palette"],
            ["C", "New Task (outside inputs)"],
            ["[", "Toggle Sidebar"],
            ["]", "Toggle Properties Panel"],

            ["Cmd+Enter / Ctrl+Enter", "Submit markdown comment"],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between px-4 py-2">
              <span className="text-muted-foreground">{desc}</span>
              <kbd className="px-2 py-0.5 text-xs font-mono bg-muted rounded border border-border">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t("pages.designguide.task_output_surface.attr_title", { defaultValue: "Task Output Surface" })}>
        <SubSection title={t("pages.designguide.multiple_outputs_primary_video_a.attr_title", { defaultValue: "Multiple outputs (primary video + 'Also produced')" })}>
          <IssueOutputSection workProducts={DESIGN_GUIDE_OUTPUTS} />
        </SubSection>
        <SubSection title={t("pages.designguide.degraded_output_invalid_failed_a.attr_title", { defaultValue: "Degraded output (invalid / failed attachment metadata)" })}>
          <IssueOutputSection workProducts={DESIGN_GUIDE_DEGRADED_OUTPUTS} />
        </SubSection>
        <SubSection title={t("pages.designguide.empty_state.attr_title", { defaultValue: "Empty state" })}>
          <p className="text-xs text-muted-foreground">
            {t("pages.designguide.when_a_task_has_produced_no_arti.jsx-text", { defaultValue: "\n            When a task has produced no artifact work products, the Output section renders nothing at all (no placeholder card).\n          " })}</p>
        </SubSection>
      </Section>
    </div>
  );
}
