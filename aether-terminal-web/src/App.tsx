import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { fetchConnectOnboardingUrl, fetchTerminalConfig } from "./api";
import { TestModeBanner } from "./components/TestModeBanner";
import { FALLBACK_STRIPE_PUBLISHABLE_KEY } from "./config";
import { AccountScreen } from "./screens/AccountScreen";
import { CheckoutScreen } from "./screens/CheckoutScreen";
import { InstallmentPlansScreen } from "./screens/InstallmentPlansScreen";
import {
  clearMerchantAccount,
  loadSettings,
  parseConnectedIdFromUrl,
  saveSettings,
} from "./storage";

type View = "account" | "checkout" | "installments";

export default function App() {
  const [view, setView] = useState<View>("account");
  const [merchantConnectId, setMerchantConnectId] = useState("");
  const [currency, setCurrency] = useState("usd");
  const [publishableKey, setPublishableKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const stripePromise = useMemo(() => {
    if (!publishableKey || !merchantConnectId.startsWith("acct_")) return null;
    return loadStripe(publishableKey, { stripeAccount: merchantConnectId });
  }, [publishableKey, merchantConnectId]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const settings = loadSettings();
      setMerchantConnectId(settings.merchantConnectId);
      const cfg = await fetchTerminalConfig();
      setCurrency(cfg.currency || "usd");
      setPublishableKey(cfg.publishableKey || FALLBACK_STRIPE_PUBLISHABLE_KEY);
      if (settings.merchantConnectId.startsWith("acct_")) {
        setView((current) => (current === "account" ? "checkout" : current));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach billing server");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const settings = loadSettings();
    const fromUrl = parseConnectedIdFromUrl(window.location.href);
    if (fromUrl) {
      const next = { merchantConnectId: fromUrl };
      saveSettings(next);
      setMerchantConnectId(fromUrl);
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      setMerchantConnectId(settings.merchantConnectId);
    }
    bootstrap();
  }, [bootstrap]);

  const connect = async () => {
    const url = await fetchConnectOnboardingUrl();
    window.location.href = url;
  };

  const disconnect = async () => {
    clearMerchantAccount();
    setMerchantConnectId("");
    setView("account");
    await bootstrap();
  };

  const hasAccount = merchantConnectId.startsWith("acct_");
  const testMode = publishableKey.startsWith("pk_test_");

  const shell = (content: ReactNode) => (
    <>
      <TestModeBanner visible={testMode} />
      {content}
    </>
  );

  if (view === "checkout" && hasAccount && stripePromise) {
    return shell(
      <CheckoutScreen
        merchantConnectId={merchantConnectId}
        currency={currency}
        stripePromise={stripePromise}
        publishableKey={publishableKey}
        onOpenInstallments={() => setView("installments")}
      />
    );
  }

  if (view === "installments" && hasAccount && stripePromise) {
    return shell(
      <InstallmentPlansScreen
        merchantConnectId={merchantConnectId}
        currency={currency}
        stripePromise={stripePromise}
        publishableKey={publishableKey}
        onBack={() => setView("checkout")}
      />
    );
  }

  return shell(
    <div className="app-shell">
      <AccountScreen
        accountId={merchantConnectId}
        loading={loading}
        error={error}
        onConnect={connect}
        onDisconnect={disconnect}
        onStartCheckout={() => setView("checkout")}
      />
    </div>
  );
}
