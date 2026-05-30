function runtimeBillingUrl(): string | undefined {
  if (typeof window !== "undefined") {
    const url = window.__AETHER_CONFIG__?.billingApiUrl;
    if (url) return url.replace(/\/$/, "");
  }
  return undefined;
}

function runtimeStripeKey(): string | undefined {
  if (typeof window !== "undefined") {
    const key = window.__AETHER_CONFIG__?.stripePublishableKey?.trim();
    if (key) return key;
  }
  return undefined;
}

export const DEFAULT_API_URL =
  runtimeBillingUrl() ||
  import.meta.env.VITE_BILLING_API_URL?.replace(/\/$/, "") ||
  "https://billing.aetherframeworks.dev";

export const FALLBACK_STRIPE_PUBLISHABLE_KEY =
  runtimeStripeKey() ||
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ||
  "";

export const STORAGE_KEYS = {
  merchantId: "aether.merchantConnectId",
} as const;

export function pwaOrigin() {
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return "https://terminal.aetherframeworks.dev";
}

export function oauthReturnUrl() {
  return `${pwaOrigin()}/oauth-return`;
}
