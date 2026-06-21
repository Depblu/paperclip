import { useEffect, useMemo, useState } from "react";
import type { ConfigFieldSchema } from "@paperclipai/adapter-utils";
import type { AdapterConfigFieldsProps } from "../types";
import { SchemaConfigFields } from "../schema-config-fields";
import { agentsApi, type ClawithConnection, type ClawithTenantChoice } from "../../api/agents";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";

function field(key: string): ConfigFieldSchema {
  return { key, label: key, type: "text" };
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function ConnectClawithDialog({
  open,
  baseUrl,
  tenantChoices,
  onOpenChange,
  onConnected,
  companyId,
}: {
  open: boolean;
  baseUrl: string;
  tenantChoices: ClawithTenantChoice[];
  onOpenChange: (open: boolean) => void;
  onConnected: (connection: ClawithConnection) => void;
  companyId: string;
}) {
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [choices, setChoices] = useState<ClawithTenantChoice[]>(tenantChoices);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
      return;
    }
    setChoices(tenantChoices);
    setTenantId(tenantChoices[0]?.tenantId ?? "");
  }, [open, tenantChoices]);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const result = await agentsApi.connectClawith(companyId, {
        baseUrl,
        loginIdentifier,
        password,
        tenantId: tenantId || undefined,
      });
      if (result.requiresTenantSelection) {
        setChoices(result.tenants);
        setTenantId(result.tenants[0]?.tenantId ?? "");
        return;
      }
      setPassword("");
      onConnected(result.connection);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Clawith</DialogTitle>
          <DialogDescription className="sr-only">
            Sign in to Clawith so Paperclip can list and run your Clawith agents.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Clawith URL</label>
            <Input value={baseUrl} disabled />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Login</label>
            <Input
              value={loginIdentifier}
              onChange={(event) => setLoginIdentifier(event.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Password</label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
          {choices.length > 0 && (
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Organization</label>
              <select
                className="h-9 w-full rounded-md border border-border bg-transparent px-3 text-sm"
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
              >
                {choices.map((tenant) => (
                  <option key={tenant.tenantId ?? "_none"} value={tenant.tenantId ?? ""}>
                    {tenant.tenantName}
                  </option>
                ))}
              </select>
            </div>
          )}
          {error && <div className="rounded-md border border-destructive/50 p-2 text-sm text-destructive">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !baseUrl || !loginIdentifier || !password}>
            {choices.length > 0 ? "Connect organization" : "Connect"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClawithConnectionPanel({
  companyId,
  currentConfig,
  writeValue,
}: {
  companyId: string;
  currentConfig: Record<string, unknown>;
  writeValue: (field: ConfigFieldSchema, value: unknown) => void;
}) {
  const [connections, setConnections] = useState<ClawithConnection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const baseUrl = readString(currentConfig.baseUrl);
  const connectionId = readString(currentConfig.clawithConnectionId);
  const selected = useMemo(
    () => connections.find((connection) => connection.id === connectionId) ?? null,
    [connections, connectionId],
  );

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const result = await agentsApi.listClawithConnections(companyId);
      setConnections(result.connections);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [companyId]);

  function selectConnection(connection: ClawithConnection) {
    writeValue(field("clawithConnectionId"), connection.id);
    writeValue(field("baseUrl"), connection.baseUrl);
    writeValue(field("clawithAgentId"), undefined);
    writeValue(field("nativeClawithAgentLink"), undefined);
  }

  async function disconnect() {
    if (!connectionId) return;
    setLoading(true);
    setError(null);
    try {
      await agentsApi.disconnectClawith(companyId, connectionId);
      writeValue(field("clawithConnectionId"), undefined);
      writeValue(field("clawithAgentId"), undefined);
      writeValue(field("nativeClawithAgentLink"), undefined);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {selected ? selected.label : "No Clawith connection selected"}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {selected ? `${selected.status} · ${selected.username ?? selected.baseUrl}` : "Connect Clawith to select an agent."}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            {selected ? "Reconnect" : "Connect"}
          </Button>
          {selected && (
            <Button size="sm" variant="ghost" onClick={disconnect} disabled={loading}>
              Disconnect
            </Button>
          )}
        </div>
      </div>
      {connections.length > 0 && (
        <div className="mt-3 grid gap-2">
          {connections.map((connection) => (
            <button
              key={connection.id}
              type="button"
              className={`rounded-md border px-3 py-2 text-left text-sm hover:bg-accent/50 ${
                connection.id === connectionId ? "border-primary bg-accent" : "border-border"
              }`}
              onClick={() => selectConnection(connection)}
            >
              <div className="font-medium">{connection.label}</div>
              <div className="text-xs text-muted-foreground">{connection.tenantName ?? connection.baseUrl}</div>
            </button>
          ))}
        </div>
      )}
      {!baseUrl && (
        <div className="mt-3 rounded-md border border-border p-2 text-sm text-muted-foreground">
          Enter a Clawith URL before connecting.
        </div>
      )}
      {error && <div className="mt-3 rounded-md border border-destructive/50 p-2 text-sm text-destructive">{error}</div>}
      <ConnectClawithDialog
        open={dialogOpen}
        baseUrl={baseUrl}
        tenantChoices={[]}
        onOpenChange={(nextOpen) => {
          setDialogOpen(nextOpen);
        }}
        companyId={companyId}
        onConnected={(connection) => {
          setConnections((current) => [connection, ...current.filter((item) => item.id !== connection.id)]);
          selectConnection(connection);
        }}
      />
    </div>
  );
}

export function ClawithBridgeConfigFields(props: AdapterConfigFieldsProps) {
  return (
    <SchemaConfigFields
      {...props}
      hideField={(field) => field.key === "clawithConnectionId"}
      beforeField={({ field, readValue, writeValue, buildCurrentConfig }) => {
        if (field.key !== "nativeClawithAgentLink" || !props.companyId) return null;
        if (readValue({ key: "connectionMode", label: "Connection mode", type: "select" }) !== "native_chat") return null;
        return (
          <ClawithConnectionPanel
            companyId={props.companyId}
            currentConfig={buildCurrentConfig()}
            writeValue={writeValue}
          />
        );
      }}
    />
  );
}
