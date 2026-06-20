import type { CreateConfigValues } from "@paperclipai/adapter-utils";

export function buildClawithBridgeConfig(values: CreateConfigValues): Record<string, unknown> {
  return {
    ...(values.adapterSchemaValues ?? {}),
  };
}
