import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const uiModules = path.resolve(root, "../ui/node_modules");

export default {
  root,
  publicDir: false,
  build: {
    outDir: "dist/client",
    emptyOutDir: true
  },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4177"
    }
  },
  resolve: {
    alias: {
      react: path.resolve(uiModules, "react"),
      "react/jsx-runtime": path.resolve(uiModules, "react/jsx-runtime.js"),
      "react-dom/client": path.resolve(uiModules, "react-dom/client.js"),
      "lucide-react": path.resolve(uiModules, "lucide-react/dist/esm/lucide-react.js")
    }
  }
};
