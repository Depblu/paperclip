import type { DeploymentExposure, DeploymentMode } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Badge } from "@/components/ui/badge";

export function ModeBadge({
  deploymentMode,
  deploymentExposure,
}: {
  deploymentMode?: DeploymentMode;
  deploymentExposure?: DeploymentExposure;
}) {
  const { t } = useTranslation();

  if (!deploymentMode) return null;

  const label =
    deploymentMode === "local_trusted"
      ? t("components.modebadge.local_trusted.jsx-text", { defaultValue: "Local trusted" })
      : deploymentExposure === "public"
        ? t("components.modebadge.authenticated_public.jsx-text", { defaultValue: "Authenticated public" })
        : t("components.modebadge.authenticated_private.jsx-text", { defaultValue: "Authenticated private" });

  return <Badge variant="outline">{label}</Badge>;
}
