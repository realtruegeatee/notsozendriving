// The only place the app-shell service worker is registered.
const SW_URL = "/sw.js";

async function unregisterAppSW() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.filter((r) => (r.active ?? r.installing ?? r.waiting)?.scriptURL.endsWith(SW_URL)).map((r) => r.unregister()),
  );
}

function isRefusedContext() {
  const h = location.hostname;
  const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  return (
    !import.meta.env.PROD ||
    inIframe ||
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h === "lovableproject.com" || h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev") ||
    new URLSearchParams(location.search).get("sw") === "off"
  );
}

export function registerAppSW() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (isRefusedContext()) { void unregisterAppSW(); return; }
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {});
  });
  if (document.readyState === "complete") navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch(() => {});
}
