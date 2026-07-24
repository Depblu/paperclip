import type { PaperclipInteraction, InteractionTarget, TunnelStatus } from "../types.js";
import type { PreviewTokenService } from "./preview-token.js";
import { validateInteractionIdentity } from "../approvals/interaction-identity.js";

const TRYCLOUDFLARE_URL_RE = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

/** Minimal tunnel manager surface needed to build preview links. */
export interface TunnelStatusProvider {
  getStatus(): TunnelStatus;
}

export interface DocumentPreviewLinkServiceDeps {
  tunnelManager: TunnelStatusProvider;
  tokenService: PreviewTokenService;
}

export class DocumentPreviewLinkService {
  private tunnelManager: TunnelStatusProvider;
  private tokenService: PreviewTokenService;

  constructor(deps: DocumentPreviewLinkServiceDeps) {
    this.tunnelManager = deps.tunnelManager;
    this.tokenService = deps.tokenService;
  }

  /**
   * Builds a signed document preview link for a request_confirmation
   * interaction whose target is an issue_document. Returns null when the
   * interaction is not eligible, identity does not match, or the tunnel is
   * not running with a valid https trycloudflare URL.
   */
  buildLink(
    interaction: PaperclipInteraction,
    expected: { companyId: string; issueId: string },
  ): string | null {
    if (interaction.kind !== "request_confirmation") return null;

    const identityError = validateInteractionIdentity(interaction, {
      companyId: expected.companyId,
      issueId: expected.issueId,
      interactionId: interaction.id,
    });
    if (identityError) return null;

    const payload = interaction.payload as Record<string, unknown>;
    const target = payload.target;
    if (!target || typeof target !== "object" || Array.isArray(target)) return null;
    const t = target as InteractionTarget;
    if (t.type !== "issue_document") return null;
    if (typeof t.key !== "string" || typeof t.revisionId !== "string") return null;
    const key = t.key.trim();
    const revisionId = t.revisionId.trim();
    if (key.length === 0 || revisionId.length === 0) return null;

    const status = this.tunnelManager.getStatus();
    if (status.state !== "running" || !status.url) return null;
    if (!TRYCLOUDFLARE_URL_RE.test(status.url)) return null;

    const token = this.tokenService.generate({
      companyId: expected.companyId,
      issueId: expected.issueId,
      key,
      revisionId,
    });
    return `${status.url}/preview/document?token=${encodeURIComponent(token)}`;
  }
}
