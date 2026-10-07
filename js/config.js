"use strict";
/**
 * Cinderwake Configuration
 * Production Domain: https://cinderwake.raghavendragolla.com
 * Cloudflare Worker API: https://cinderwake-save.raghavendrayadavgolla.workers.dev
 */
// Clear any obsolete/typo stored API URL
if (typeof window !== "undefined" && window.localStorage) {
  const stored = window.localStorage.getItem("cinderwake.api.url");
  if (stored && stored.includes("raghavendayadavgolla")) {
    window.localStorage.removeItem("cinderwake.api.url");
  }
}

window.CINDERWAKE_CONFIG = {
  apiBaseUrl: (typeof window !== "undefined" && window.localStorage && window.localStorage.getItem("cinderwake.api.url")) || "https://cinderwake-save.raghavendrayadavgolla.workers.dev",
};
