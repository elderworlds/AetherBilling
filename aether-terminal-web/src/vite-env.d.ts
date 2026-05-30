/// <reference types="vite/client" />

interface AetherRuntimeConfig {
  billingApiUrl?: string;
  stripePublishableKey?: string;
}

interface Window {
  __AETHER_CONFIG__?: AetherRuntimeConfig;
}

interface ImportMetaEnv {
  readonly VITE_BILLING_API_URL?: string;
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
