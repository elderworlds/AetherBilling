import { DEFAULT_API_URL, oauthReturnUrl } from "./config";

let apiBase = DEFAULT_API_URL;

export function setApiBase(url: string) {
  apiBase = url.replace(/\/$/, "");
}

async function readJson(res: Response) {
  const body = await res.text();
  let data: Record<string, unknown> = {};
  if (body.trim()) {
    try {
      const parsed = JSON.parse(body);
      if (typeof parsed === "object" && parsed) data = parsed as Record<string, unknown>;
    } catch {
      /* non-json */
    }
  }
  if (!res.ok) {
    const message =
      typeof data.error === "string"
        ? data.error
        : res.statusText || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return readJson(res) as Promise<T>;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${apiBase}${path}`);
  return readJson(res) as Promise<T>;
}

export type CatalogProduct = {
  id: number;
  name: string;
  priceCents: number;
  currency?: string;
};

export type CartLine = {
  productId: number;
  name: string;
  quantity: number;
  priceCents: number;
};

export type InstallmentPlan = {
  planId: string;
  merchantConnectId: string;
  wcOrderId: number | null;
  currency: string;
  totalCents: number;
  paidCount: number;
  installmentCount: number;
  nextDueAt: string | null;
  intervalDays?: number;
  nextAmountCents: number | null;
  status: string;
  paymentLinkUrl: string | null;
  lastChargeError: string | null;
};

export async function fetchTerminalConfig() {
  return get<{
    success: boolean;
    mode: string;
    currency: string;
    publishableKey: string;
  }>("/api/v1/terminal/config");
}

export async function fetchConnectOnboardingUrl() {
  const returnUrl = encodeURIComponent(oauthReturnUrl());
  const cfg = await get<{ success: boolean; connectUrl: string }>(
    `/api/v1/terminal/onboarding-url?return_url=${returnUrl}`
  );
  if (!cfg.connectUrl) throw new Error("Account setup URL missing from billing server.");
  return cfg.connectUrl;
}

export async function fetchStoreInfo(merchantConnectId: string) {
  const q = new URLSearchParams({ merchantConnectId });
  return get<{
    linked: boolean;
    siteName: string | null;
  }>(`/api/v1/terminal/store?${q}`);
}

export async function fetchCatalog(merchantConnectId: string) {
  const q = new URLSearchParams({ merchantConnectId });
  return get<{ linked: boolean; products: CatalogProduct[] }>(
    `/api/v1/terminal/catalog?${q}`
  );
}

export async function createWebPaymentIntent(params: {
  amount: number;
  merchantConnectId: string;
  currency?: string;
  metadata?: Record<string, string>;
  saveForFutureUsage?: boolean;
  planId?: string;
}) {
  return post<{
    clientSecret: string;
    paymentIntentId?: string;
    currency: string;
  }>("/api/v1/terminal/web/payment-intent", params);
}

export async function createPosOrder(params: {
  merchantConnectId: string;
  paymentIntentId: string;
  currency: string;
  lineItems: { productId: number; quantity: number }[];
  customAmountCents?: number;
  payIn4?: {
    totalCents: number;
    intervalDays?: number;
    schedulePreset?: string;
  };
  customerEmail?: string;
}) {
  return post<{
    orderNumber: string;
    planId?: string | null;
  }>("/api/v1/terminal/pos-order", params);
}

export async function fetchInstallmentPlans(merchantConnectId: string) {
  const q = new URLSearchParams({ merchantConnectId, status: "active" });
  return get<{ plans: InstallmentPlan[] }>(`/api/v1/installment-plans?${q}`);
}

export async function collectInstallment(params: {
  planId: string;
  merchantConnectId: string;
  paymentIntentId: string;
}) {
  return post<{ plan?: InstallmentPlan }>(
    `/api/v1/installment-plans/${encodeURIComponent(params.planId)}/collect`,
    params
  );
}

export function formatMoney(cents: number, currency: string) {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}
