import "@testing-library/jest-dom/vitest";

// Recharts ResponsiveContainer needs ResizeObserver in jsdom
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
}
