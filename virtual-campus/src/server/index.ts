import { createCampusStore } from "./campus-store";
import { createCampusHttpServer, defaultStaticDir } from "./http";
import { createMockEventSequence } from "./mock-paperclip";
import { createPaperclipClient } from "./paperclip-client";

const port = Number(process.env.PORT ?? 4177);
const store = createCampusStore();
const paperclip = createPaperclipClient();
store.loadFromPaperclip(await paperclip.snapshot());

const server = createCampusHttpServer({
  store,
  events: createMockEventSequence(),
  port,
  staticDir: process.env.NODE_ENV === "production" ? defaultStaticDir() : undefined,
});

server.on("error", (error) => {
  console.error(`Virtual Campus BFF failed to start: ${(error as Error).message}`);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Virtual Campus BFF listening on http://127.0.0.1:${port}`);
});
