import { STORAGE_KEYS } from "./config";

export type MerchantSettings = {
  merchantConnectId: string;
};

export function loadSettings(): MerchantSettings {
  const merchantConnectId = localStorage.getItem(STORAGE_KEYS.merchantId) || "";
  return { merchantConnectId };
}

export function saveSettings(settings: MerchantSettings) {
  localStorage.setItem(STORAGE_KEYS.merchantId, settings.merchantConnectId);
}

export function clearMerchantAccount(): MerchantSettings {
  const cleared = { merchantConnectId: "" };
  saveSettings(cleared);
  return cleared;
}

export function parseConnectedIdFromUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get("connected_id");
    return id?.startsWith("acct_") ? id : null;
  } catch {
    return null;
  }
}
