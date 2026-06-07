import { Link } from "@/lib/router";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";

interface MissingPluginTabPlaceholderProps {
  defaultTabHref: string;
  defaultTabLabel: string;
}

export function MissingPluginTabPlaceholder({
  defaultTabHref,
  defaultTabLabel,
}: MissingPluginTabPlaceholderProps) {
const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-dashed border-border bg-background px-4 py-8 text-sm text-muted-foreground">
      <div className="flex flex-col items-start gap-3">
        <p>{t("components.missingplugintabplaceholder.workspace_plugin_tab_is_not_avai.jsx-text", { defaultValue: "Workspace plugin tab is not available." })}</p>
        <Button variant="outline" size="sm" asChild>
          <Link to={defaultTabHref}>{defaultTabLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
