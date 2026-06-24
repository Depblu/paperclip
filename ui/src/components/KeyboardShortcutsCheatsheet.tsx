import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "@/i18n";

interface ShortcutEntry {
  keys: string[];
  label: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

function KeyCap({ children }: { children: string }) {
const { t } = useTranslation();

  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-[0_1px_0_1px_hsl(var(--border))]">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsCheatsheetContent() {
const { t } = useTranslation();
  const sections: ShortcutSection[] = [
    {
      title: t("components.keyboardshortcutscheatsheet.inbox.section", { defaultValue: "Inbox" }),
      shortcuts: [
        { keys: ["j"], label: t("components.keyboardshortcutscheatsheet.move_down.shortcut", { defaultValue: "Move down" }) },
        { keys: ["↓"], label: t("components.keyboardshortcutscheatsheet.move_down.shortcut", { defaultValue: "Move down" }) },
        { keys: ["k"], label: t("components.keyboardshortcutscheatsheet.move_up.shortcut", { defaultValue: "Move up" }) },
        { keys: ["↑"], label: t("components.keyboardshortcutscheatsheet.move_up.shortcut", { defaultValue: "Move up" }) },
        { keys: ["←"], label: t("components.keyboardshortcutscheatsheet.collapse_selected_group.shortcut", { defaultValue: "Collapse selected group" }) },
        { keys: ["→"], label: t("components.keyboardshortcutscheatsheet.expand_selected_group.shortcut", { defaultValue: "Expand selected group" }) },
        { keys: ["Enter"], label: t("components.keyboardshortcutscheatsheet.open_selected_item.shortcut", { defaultValue: "Open selected item" }) },
        { keys: ["a"], label: t("components.keyboardshortcutscheatsheet.archive_item.shortcut", { defaultValue: "Archive item" }) },
        { keys: ["y"], label: t("components.keyboardshortcutscheatsheet.archive_item.shortcut", { defaultValue: "Archive item" }) },
        { keys: ["r"], label: t("components.keyboardshortcutscheatsheet.mark_as_read.shortcut", { defaultValue: "Mark as read" }) },
        { keys: ["U"], label: t("components.keyboardshortcutscheatsheet.mark_as_unread.shortcut", { defaultValue: "Mark as unread" }) },
      ],
    },
    {
      title: t("components.keyboardshortcutscheatsheet.task_detail.section", { defaultValue: "Task detail" }),
      shortcuts: [
        { keys: ["y"], label: t("components.keyboardshortcutscheatsheet.quick_archive_back_to_inbox.shortcut", { defaultValue: "Quick-archive back to inbox" }) },
        { keys: ["g", "i"], label: t("components.keyboardshortcutscheatsheet.go_to_inbox.shortcut", { defaultValue: "Go to inbox" }) },
        { keys: ["g", "c"], label: t("components.keyboardshortcutscheatsheet.focus_comment_composer.shortcut", { defaultValue: "Focus comment composer" }) },
      ],
    },
    {
      title: t("components.keyboardshortcutscheatsheet.global.section", { defaultValue: "Global" }),
      shortcuts: [
        { keys: ["/"], label: t("components.keyboardshortcutscheatsheet.search_current_page.shortcut", { defaultValue: "Search current page or quick search" }) },
        { keys: ["c"], label: t("components.keyboardshortcutscheatsheet.new_task.shortcut", { defaultValue: "New task" }) },
        { keys: ["["], label: t("components.keyboardshortcutscheatsheet.toggle_sidebar.shortcut", { defaultValue: "Toggle sidebar" }) },
        { keys: ["]"], label: t("components.keyboardshortcutscheatsheet.toggle_panel.shortcut", { defaultValue: "Toggle panel" }) },
        { keys: ["?"], label: t("components.keyboardshortcutscheatsheet.show_keyboard_shortcuts.shortcut", { defaultValue: "Show keyboard shortcuts" }) },
      ],
    },
  ];

  return (
    <>
      <div className="divide-y divide-border border-t border-border">
        {sections.map((section) => (
          <div key={section.title} className="px-5 py-3">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.title}
            </h3>
            <div className="space-y-1.5">
              {section.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label + shortcut.keys.join()}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm text-foreground/90">{shortcut.label}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={key} className="flex items-center gap-1">
                        {i > 0 && <span className="text-xs text-muted-foreground">{t("components.keyboardshortcutscheatsheet.then.jsx-text", { defaultValue: "then" })}</span>}
                        <KeyCap>{key}</KeyCap>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {t("components.keyboardshortcutscheatsheet.press.jsx-text", { defaultValue: "\n          Press " })}<KeyCap>{t("components.keyboardshortcutscheatsheet.esc.jsx-text", { defaultValue: "Esc" })}</KeyCap> {t("components.keyboardshortcutscheatsheet.to_close_middot_shortcuts_are_di.jsx-text", { defaultValue: " to close &middot; Shortcuts are disabled in text fields\n        " })}</p>
      </div>
    </>
  );
}

export function KeyboardShortcutsCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{t("components.keyboardshortcutscheatsheet.keyboard_shortcuts.jsx-text", { defaultValue: "Keyboard shortcuts" })}</DialogTitle>
        </DialogHeader>
        <KeyboardShortcutsCheatsheetContent />
      </DialogContent>
    </Dialog>
  );
}
