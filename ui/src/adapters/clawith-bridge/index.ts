import type { UIAdapterModule } from "../types";
import { ClawithBridgeConfigFields } from "./config-fields";
import { parseClawithBridgeStdoutLine, buildClawithBridgeConfig } from "@paperclipai/adapter-clawith-bridge/ui";

export const clawithBridgeUIAdapter: UIAdapterModule = {
  type: "clawith_bridge",
  label: "Clawith Bridge",
  parseStdoutLine: parseClawithBridgeStdoutLine,
  ConfigFields: ClawithBridgeConfigFields,
  buildAdapterConfig: buildClawithBridgeConfig,
};
