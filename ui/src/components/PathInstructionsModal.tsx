import { useState } from "react";
import { useTranslation } from "@/i18n";
import { Apple, Monitor, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Platform = "mac" | "windows" | "linux";

const platforms: { id: Platform; label: string; icon: typeof Apple }[] = [
  { id: "mac", label: "macOS", icon: Apple },
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "linux", label: "Linux", icon: Terminal },
];

const instructions: Record<Platform, { steps: { key: string; defaultValue: string }[]; tip?: { key: string; defaultValue: string } }> = {
  mac: {
    steps: [
      { key: "components.pathinstructionsmodal.mac_open_finder.step", defaultValue: "Open Finder and navigate to the folder." },
      { key: "components.pathinstructionsmodal.mac_right_click.step", defaultValue: "Right-click (or Control-click) the folder." },
      { key: "components.pathinstructionsmodal.mac_hold_option.step", defaultValue: "Hold the Option (⌥) key — \"Copy\" changes to \"Copy as Pathname\"." },
      { key: "components.pathinstructionsmodal.mac_copy_pathname.step", defaultValue: "Click \"Copy as Pathname\", then paste here." },
    ],
    tip: {
      key: "components.pathinstructionsmodal.mac_terminal_tip.tip",
      defaultValue: "You can also open Terminal, type cd, drag the folder into the terminal window, and press Enter. Then type pwd to see the full path.",
    },
  },
  windows: {
    steps: [
      { key: "components.pathinstructionsmodal.windows_open_explorer.step", defaultValue: "Open File Explorer and navigate to the folder." },
      { key: "components.pathinstructionsmodal.windows_address_bar.step", defaultValue: "Click in the address bar at the top — the full path will appear." },
      { key: "components.pathinstructionsmodal.windows_copy_path.step", defaultValue: "Copy the path, then paste here." },
    ],
    tip: {
      key: "components.pathinstructionsmodal.windows_shift_tip.tip",
      defaultValue: "Alternatively, hold Shift and right-click the folder, then select \"Copy as path\".",
    },
  },
  linux: {
    steps: [
      { key: "components.pathinstructionsmodal.linux_open_terminal.step", defaultValue: "Open a terminal and navigate to the directory with cd." },
      { key: "components.pathinstructionsmodal.linux_run_pwd.step", defaultValue: "Run pwd to print the full path." },
      { key: "components.pathinstructionsmodal.linux_copy_output.step", defaultValue: "Copy the output and paste here." },
    ],
    tip: {
      key: "components.pathinstructionsmodal.linux_file_manager_tip.tip",
      defaultValue: "In most file managers, Ctrl+L reveals the full path in the address bar.",
    },
  },
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
}

interface PathInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PathInstructionsModal({
  open,
  onOpenChange,
}: PathInstructionsModalProps) {
const { t } = useTranslation();

  const [platform, setPlatform] = useState<Platform>(detectPlatform);

  const current = instructions[platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("components.pathinstructionsmodal.how_to_get_a_full_path.jsx-text", { defaultValue: "How to get a full path" })}</DialogTitle>
          <DialogDescription>
            {t("components.pathinstructionsmodal.paste_the_absolute_path_e_g.jsx-text", { defaultValue: "\n            Paste the absolute path (e.g." })}{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/Users/you/project</code>
            {t("components.pathinstructionsmodal.into_the_input_field.jsx-text", { defaultValue: "\n            ) into the input field.\n          " })}</DialogDescription>
        </DialogHeader>

        {/* Platform tabs */}
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
                platform === p.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
              onClick={() => setPlatform(p.id)}
            >
              <p.icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          ))}
        </div>

        {/* Steps */}
        <ol className="space-y-2 text-sm">
          {current.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">
                {i + 1}.
              </span>
              <span>{t(step.key, { defaultValue: step.defaultValue })}</span>
            </li>
          ))}
        </ol>

        {current.tip && (
          <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
            {t(current.tip.key, { defaultValue: current.tip.defaultValue })}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Small "Choose" button that opens the PathInstructionsModal.
 * Drop-in replacement for the old showDirectoryPicker buttons.
 */
export function ChoosePathButton({ className }: { className?: string }) {
const { t } = useTranslation();

  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {t("components.pathinstructionsmodal.choose.jsx-text", { defaultValue: "\n        Choose\n      " })}</button>
      <PathInstructionsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
