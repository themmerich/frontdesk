/**
 * Global setup for the unit tests, wired in through the `setupFiles` option of the test builder.
 *
 * Depending on the Node version and the DOM implementation, the specs run without a working
 * localStorage — Node answers `window.localStorage` with undefined unless it was started with
 * `--localstorage-file`. Everything that persists then fails on a plain render, PrimeNG's
 * stateful table among it. An in-memory one takes its place, and the same instance is put where
 * both the global window and the document's view look, so a component and the library it uses
 * never end up writing into two different stores.
 */
function createInMemoryStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

const storage = createInMemoryStorage();
const views = new Set<object>([globalThis, document.defaultView].filter((view) => view !== null));
for (const view of views) {
  Object.defineProperty(view, 'localStorage', { value: storage, configurable: true });
}

// PrimeNG's tab list watches its own width through a ResizeObserver, which JSDOM does not
// implement. Nothing is laid out in JSDOM anyway, so an observer that never observes will do.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {
      // Nothing is laid out in JSDOM, so nothing ever resizes.
    }
    unobserve(): void {
      // See observe().
    }
    disconnect(): void {
      // See observe().
    }
  };
}
