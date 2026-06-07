import { afterAll, beforeAll } from "vitest";

const storageEntries = new Map<string, string>();

function installStorageMock(target: Record<string, unknown>) {
  Object.defineProperty(target, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storageEntries.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageEntries.set(key, String(value));
      },
      removeItem: (key: string) => {
        storageEntries.delete(key);
      },
      clear: () => {
        storageEntries.clear();
      },
    },
  });
}

if (
  typeof globalThis.localStorage?.getItem !== "function"
  || typeof globalThis.localStorage?.setItem !== "function"
  || typeof globalThis.localStorage?.removeItem !== "function"
  || typeof globalThis.localStorage?.clear !== "function"
) {
  installStorageMock(globalThis);
}

if (typeof window !== "undefined" && window.localStorage !== globalThis.localStorage) {
  installStorageMock(window as unknown as Record<string, unknown>);
}

// Wait for i18next initialization before any test in this file runs.
// The i18n module uses top-level await on its init promise so the
// import itself blocks, but the runtime also exposes the promise on
// globalThis so test files that bypass module-level awaits (via dynamic
// imports) can still gate on it.
beforeAll(async () => {
  const initPromise = (globalThis as { __paperclipI18nInit?: Promise<unknown> })
    .__paperclipI18nInit;
  if (initPromise) {
    await initPromise;
  }
});

afterAll(() => {
  // No global teardown needed; per-test cleanup lives in each file.
});
