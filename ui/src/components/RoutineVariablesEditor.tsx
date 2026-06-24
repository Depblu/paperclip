import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/i18n";
import type { TFunction } from "i18next";
import { ChevronDown, ChevronRight, HelpCircle } from "lucide-react";
import { syncRoutineVariablesWithTemplate, type RoutineVariable } from "@paperclipai/shared";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const variableTypes: RoutineVariable["type"][] = ["text", "textarea", "number", "boolean", "select"];

function serializeVariables(value: RoutineVariable[]) {
  return JSON.stringify(value);
}

function parseSelectOptions(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function updateVariableList(
  variables: RoutineVariable[],
  name: string,
  mutate: (variable: RoutineVariable) => RoutineVariable,
) {
  return variables.map((variable) => (variable.name === name ? mutate(variable) : variable));
}

export function RoutineVariablesEditor({
  title,
  description,
  value,
  onChange,
}: {
  title: string;
  description: string;
  value: RoutineVariable[];
  onChange: (value: RoutineVariable[]) => void;
}) {
  const { t } = useTranslation();

  const [open, setOpen] = useState(true);
  const syncedVariables = useMemo(
    () => syncRoutineVariablesWithTemplate([title, description], value),
    [description, title, value],
  );
  const syncedSignature = serializeVariables(syncedVariables);
  const currentSignature = serializeVariables(value);

  useEffect(() => {
    if (syncedSignature !== currentSignature) {
      onChange(syncedVariables);
    }
  }, [currentSignature, onChange, syncedSignature, syncedVariables]);

  if (syncedVariables.length === 0) {
    return null;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="overflow-hidden rounded-lg border border-border/70">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left">
        <div>
          <p className="text-sm font-medium">{t("components.routinevariableseditor.variables.jsx-text", { defaultValue: "Variables" })}</p>
          <p className="text-xs text-muted-foreground">
            {t("components.routinevariableseditor.detected_from.jsx-text", { defaultValue: "\n            Detected from `" })}{"{{name}}"}{t("components.routinevariableseditor.placeholders_in_the_routine_titl.jsx-text", { defaultValue: "` placeholders in the routine title and instructions.\n          " })}</p>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </CollapsibleTrigger>
      <CollapsibleContent className="divide-y divide-border/70 border-t border-border/70">
        {syncedVariables.map((variable) => (
          <div key={variable.name} className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {`{{${variable.name}}}`}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {t("components.routinevariableseditor.prompt_the_user_for_this_value_b.jsx-text", { defaultValue: "\n                Prompt the user for this value before each manual run.\n              " })}</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("components.routinevariableseditor.label.jsx-text", { defaultValue: "Label" })}</Label>
                <Input
                  value={variable.label ?? ""}
                  onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                    ...current,
                    label: event.target.value || null,
                  })))}
                  placeholder={variable.name.replaceAll("_", " ")}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("components.routinevariableseditor.type.jsx-text", { defaultValue: "Type" })}</Label>
                <Select
                  value={variable.type}
                  onValueChange={(type) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                    ...current,
                    type: type as RoutineVariable["type"],
                    defaultValue: type === "boolean" ? null : current.defaultValue,
                    options: type === "select" ? current.options : [],
                  })))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variableTypes.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-xs">{t("components.routinevariableseditor.default_value.jsx-text", { defaultValue: "Default value" })}</Label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={variable.required}
                      onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                        ...current,
                        required: event.target.checked,
                      })))}
                    />
                    {t("components.routinevariableseditor.required.jsx-text", { defaultValue: "\n                    Required\n                  " })}</label>
                </div>

                {variable.type === "textarea" ? (
                  <Textarea
                    rows={3}
                    value={variable.defaultValue == null ? "" : String(variable.defaultValue)}
                    onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: event.target.value || null,
                    })))}
                  />
                ) : variable.type === "boolean" ? (
                  <Select
                    value={variable.defaultValue === true ? "true" : variable.defaultValue === false ? "false" : "__unset__"}
                    onValueChange={(next) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: next === "__unset__" ? null : next === "true",
                    })))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__unset__">{t("components.routinevariableseditor.no_default.jsx-text", { defaultValue: "No default" })}</SelectItem>
                      <SelectItem value="true">{t("components.routinevariableseditor.true.jsx-text", { defaultValue: "True" })}</SelectItem>
                      <SelectItem value="false">{t("components.routinevariableseditor.false.jsx-text", { defaultValue: "False" })}</SelectItem>
                    </SelectContent>
                  </Select>
                ) : variable.type === "select" ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("components.routinevariableseditor.options.jsx-text", { defaultValue: "Options" })}</Label>
                      <Input
                        value={variable.options.join(", ")}
                        onChange={(event) => {
                          const options = parseSelectOptions(event.target.value);
                          onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                            ...current,
                            options,
                            defaultValue:
                              typeof current.defaultValue === "string" && options.includes(current.defaultValue)
                                ? current.defaultValue
                                : null,
                          })));
                        }}
                        placeholder={t("components.routinevariableseditor.high_medium_low.attr_placeholder", { defaultValue: "high, medium, low" })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t("components.routinevariableseditor.default_option.jsx-text", { defaultValue: "Default option" })}</Label>
                      <Select
                        value={typeof variable.defaultValue === "string" ? variable.defaultValue : "__unset__"}
                        onValueChange={(next) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                          ...current,
                          defaultValue: next === "__unset__" ? null : next,
                        })))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t("components.routinevariableseditor.no_default.attr_placeholder", { defaultValue: "No default" })} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__unset__">{t("components.routinevariableseditor.no_default.jsx-text", { defaultValue: "No default" })}</SelectItem>
                          {variable.options.map((option) => (
                            <SelectItem key={option} value={option}>{option}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <Input
                    type={variable.type === "number" ? "number" : "text"}
                    value={variable.defaultValue == null ? "" : String(variable.defaultValue)}
                    onChange={(event) => onChange(updateVariableList(syncedVariables, variable.name, (current) => ({
                      ...current,
                      defaultValue: event.target.value || null,
                    })))}
                    placeholder={variable.type === "number" ? "42" : t("components.routinevariableseditor.default_value.jsx-text", { defaultValue: "Default value" })}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

type BuiltinVariableDoc = {
  name: string;
  example: string;
};

const BUILTIN_VARIABLE_DOCS: BuiltinVariableDoc[] = [
  {
    name: "date",
    example: "2026-04-28",
  },
  {
    name: "timestamp",
    example: "April 28, 2026 at 12:17 PM UTC",
  },
];

function builtinVariableDescription(name: string, t: TFunction) {
  switch (name) {
    case "date":
      return t("components.routinevariableseditor.current_date.description", { defaultValue: "Current date in YYYY-MM-DD format (UTC) at the time the routine runs." });
    case "timestamp":
      return t("components.routinevariableseditor.human_readable_date.description", { defaultValue: "Human-readable date and time (UTC) at the time the routine runs." });
    default:
      return name;
  }
}

export function RoutineVariablesHint() {
  const { t } = useTranslation();

  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border/70 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {t("components.routinevariableseditor.use.jsx-text", { defaultValue: "\n          Use `" })}{"{{variable_name}}"}{t("components.routinevariableseditor.placeholders_in_the_instructions.jsx-text", { defaultValue: "` placeholders in the instructions to prompt for inputs when the routine runs.\n        " })}</span>
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t("components.routinevariableseditor.show_variable_help.attr_aria-label", { defaultValue: "Show variable help" })}
        >
          <HelpCircle className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t("components.routinevariableseditor.routine_variables.jsx-text", { defaultValue: "Routine variables" })}</DialogTitle>
            <DialogDescription>
              {t("components.routinevariableseditor.how_to_prompt_for_inputs_and_whi.jsx-text", { defaultValue: "\n              How to prompt for inputs and which variables Paperclip fills in automatically.\n            " })}</DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("components.routinevariableseditor.custom_variables.jsx-text", { defaultValue: "\n                Custom variables\n              " })}</h3>
              <p className="text-muted-foreground">
                Type{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">
                  {"{{variable_name}}"}
                </code>{" "}
                {t("components.routinevariableseditor.anywhere_in_the_title_or_instruc.jsx-text", { defaultValue: "\n                anywhere in the title or instructions. Paperclip detects each placeholder, lists it under " })}<span className="font-medium text-foreground">{t("components.routinevariableseditor.variables.jsx-text", { defaultValue: "Variables" })}</span>{t("components.routinevariableseditor.and_prompts_for_a_value_before_e.jsx-text", { defaultValue: ", and prompts for a value before each run.\n              " })}</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                <li>{t("components.routinevariableseditor.names_must_start_with_a_letter_a.jsx-text", { defaultValue: "Names must start with a letter and may use letters, numbers, and underscores." })}</li>
                <li>{t("components.routinevariableseditor.pick_a_type_text_textarea_number.jsx-text", { defaultValue: "Pick a type (text, textarea, number, boolean, select), default value, and whether it is required." })}</li>
                <li>{t("components.routinevariableseditor.the_same_name_reused_across_the_.jsx-text", { defaultValue: "The same name reused across the title and instructions is treated as one variable." })}</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {t("components.routinevariableseditor.built_in_variables.jsx-text", { defaultValue: "\n                Built-in variables\n              " })}</h3>
              <p className="text-muted-foreground">
                {t("components.routinevariableseditor.these_are_filled_in_automaticall.jsx-text", { defaultValue: "\n                These are filled in automatically — no setup needed and they will not appear in the Variables list.\n              " })}</p>
              <div className="overflow-hidden rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("components.routinevariableseditor.placeholder.jsx-text", { defaultValue: "Placeholder" })}</th>
                      <th className="px-3 py-2 font-medium">{t("components.routinevariableseditor.example.jsx-text", { defaultValue: "Example" })}</th>
                      <th className="px-3 py-2 font-medium">{t("components.routinevariableseditor.description.jsx-text", { defaultValue: "Description" })}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {BUILTIN_VARIABLE_DOCS.map((entry) => (
                      <tr key={entry.name} className="align-top">
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="font-mono text-xs">{`{{${entry.name}}}`}</Badge>
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{entry.example}</td>
                        <td className="px-3 py-2 text-muted-foreground">{builtinVariableDescription(entry.name, t)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
