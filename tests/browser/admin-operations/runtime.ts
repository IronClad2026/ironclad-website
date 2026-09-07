export const usePathname = () => "/admin/operations";
export const useRouter = () => ({ refresh() { window.dispatchEvent(new Event("operations-fixture-refresh")); } });
export function blockNetwork() {
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith("/api/") || (init?.method ?? "GET") !== "GET") throw new Error("Isolated Operations fixture blocked a request.");
    return original(input, init);
  };
}
