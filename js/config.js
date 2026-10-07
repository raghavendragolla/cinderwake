"use strict";
/**
 * Cinderwake Configuration
 * Production Domain: https://cinderwake.raghavendragolla.com
 * Cloudflare Worker API: https://cinderwake-save.raghavendayadavgolla.workers.dev
 */
window.CINDERWAKE_CONFIG = {
  apiBaseUrl: (typeof window !== "undefined" && window.localStorage && window.localStorage.getItem("cinderwake.api.url")) || "https://cinderwake-save.raghavendayadavgolla.workers.dev",
};
