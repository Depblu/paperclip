export const type = "clawith_bridge";
export const label = "Clawith Bridge";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# clawith_bridge agent configuration

Adapter: clawith_bridge

Use when:
- You want Paperclip to wake a Clawith digital employee through the Bridge API.
- The Clawith runtime owns persona, memory, workspace, focus, reflection, and execution.
- You need Paperclip to keep company, issue, run, audit, and budget control.

Don't use when:
- You want Paperclip to run a local CLI agent directly.
- You do not have a reachable Clawith Bridge service.
- You need Plaza, IM channels, or deep Clawith A2A orchestration in the first PoC.

Core fields:
- baseUrl (string, required): Clawith Bridge base URL, for example http://localhost:8008
- bridgeSecret (string, required): shared HS256 signing secret for Bridge JWTs
- timeoutSec (number, optional): wake request timeout in seconds, default 120
- mode (string, optional): sync, default sync
- writeBack (string, optional): issue_comment or run_log, default issue_comment
- enabled (boolean, optional): per-agent feature switch, default true

Environment fallback:
- CLAWITH_BRIDGE_BASE_URL
- CLAWITH_BRIDGE_SECRET
- CLAWITH_BRIDGE_TIMEOUT_SEC
- CLAWITH_BRIDGE_ENABLED
`;
