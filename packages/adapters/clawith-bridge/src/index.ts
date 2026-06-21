export const type = "clawith_bridge";
export const label = "Clawith Bridge";

export const models: { id: string; label: string }[] = [];

export const agentConfigurationDoc = `# clawith_bridge agent configuration

Adapter: clawith_bridge

Use when:
- You want Paperclip to invoke an existing Clawith digital employee.
- You want Paperclip runs to appear in Clawith's native chat sessions by using connectionMode=native_chat.
- You need the legacy Clawith Bridge API path by using connectionMode=bridge_wake.
- The Clawith runtime owns persona, memory, workspace, focus, reflection, and execution.
- You need Paperclip to keep company, issue, run, audit, and budget control.

Don't use when:
- You want Paperclip to run a local CLI agent directly.
- You do not have a reachable Clawith service.
- You need Plaza, IM channels, or deep Clawith A2A orchestration in the first PoC.

Core fields:
- connectionMode (string, optional): bridge_wake or native_chat, default bridge_wake
- baseUrl (string, required): Clawith base URL, for example http://localhost:8008
- bridgeSecret (string, required for bridge_wake): shared HS256 signing secret for Bridge JWTs
- clawithConnectionId (string, required for native_chat): Paperclip-managed Clawith connection id
- clawithAgentId (string, required for native_chat): selected existing Clawith agent id
- timeoutSec (number, optional): wake request timeout in seconds, default 120
- mode (string, optional): sync, default sync
- writeBack (string, optional): issue_comment or run_log, default issue_comment
- enabled (boolean, optional): per-agent feature switch, default true

Environment fallback:
- CLAWITH_BRIDGE_BASE_URL
- CLAWITH_BRIDGE_SECRET
- CLAWITH_AUTH_TOKEN (advanced/debug fallback only; normal UI uses Clawith connections)
- CLAWITH_BRIDGE_TIMEOUT_SEC
- CLAWITH_BRIDGE_ENABLED
`;
