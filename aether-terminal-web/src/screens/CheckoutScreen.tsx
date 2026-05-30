import { useCallback, useEffect, useMemo, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import {
  CatalogProduct,
  CartLine,
  createPosOrder,
  createWebPaymentIntent,
  fetchCatalog,
  fetchStoreInfo,
  formatMoney,
} from "../api";
import { PaymentForm } from "../components/PaymentForm";
import {
  INSTALLMENT_COUNT,
  PayMode,
  SchedulePreset,
  formatScheduleLabel,
  resolveIntervalDays,
  splitInstallments,
} from "../lib/installments";

type Props = {
  merchantConnectId: string;
  currency: string;
  stripePromise: Promise<Stripe | null>;
  publishableKey: string;
  onOpenInstallments: () => void;
};

function parseCustomAmountToCents(text: string) {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return 0;
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 100);
}

export function CheckoutScreen({
  merchantConnectId,
  currency,
  stripePromise,
  publishableKey,
  onOpenInstallments,
}: Props) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [cart, setCart] = useState<Record<number, CartLine>>({});
  const [customAmountText, setCustomAmountText] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("full");
  const [schedulePreset, setSchedulePreset] = useState<SchedulePreset>("biweekly");
  const [customScheduleDays, setCustomScheduleDays] = useState("21");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pendingMeta, setPendingMeta] = useState<{
    chargeCents: number;
    finalTotalCents: number;
    customAmountCents: number;
    isPayIn4: boolean;
    intervalDays: number;
    schedulePreset: SchedulePreset;
    cartLines: CartLine[];
    customerEmail: string;
  } | null>(null);

  const cartLines = useMemo(() => Object.values(cart), [cart]);
  const cartTotalCents = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0),
    [cartLines]
  );
  const customAmountCents = useMemo(
    () => parseCustomAmountToCents(customAmountText),
    [customAmountText]
  );
  const finalTotalCents = cartTotalCents + customAmountCents;
  const installmentAmounts = useMemo(
    () => splitInstallments(finalTotalCents),
    [finalTotalCents]
  );
  const intervalDays = useMemo(
    () =>
      resolveIntervalDays(
        schedulePreset,
        schedulePreset === "custom" ? Number(customScheduleDays) : undefined
      ),
    [schedulePreset, customScheduleDays]
  );
  const scheduleLabel = useMemo(
    () =>
      formatScheduleLabel(
        schedulePreset,
        schedulePreset === "custom" ? Number(customScheduleDays) : undefined
      ),
    [schedulePreset, customScheduleDays]
  );
  const chargeCents = payMode === "pay_in_4" ? installmentAmounts[0] : finalTotalCents;
  const canCharge = finalTotalCents > 0;

  const loadCatalog = useCallback(async () => {
    try {
      const [storeInfo, catalog] = await Promise.all([
        fetchStoreInfo(merchantConnectId),
        fetchCatalog(merchantConnectId),
      ]);
      setLinked(storeInfo.linked);
      setStoreName(storeInfo.siteName);
      setProducts(catalog.products || []);
      setStatus(
        storeInfo.linked
          ? "Ready — add products or enter a custom amount"
          : "Link WordPress in WooCommerce → Aether Billing for catalog sync"
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not load catalog");
    }
  }, [merchantConnectId]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const addToCart = (product: CatalogProduct) => {
    setCart((prev) => {
      const existing = prev[product.id];
      const quantity = (existing?.quantity ?? 0) + 1;
      return {
        ...prev,
        [product.id]: {
          productId: product.id,
          name: product.name,
          quantity,
          priceCents: product.priceCents,
        },
      };
    });
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => {
      const line = prev[productId];
      if (!line) return prev;
      if (line.quantity <= 1) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: { ...line, quantity: line.quantity - 1 } };
    });
  };

  const startPayment = async () => {
    if (!canCharge) {
      setStatus("Enter a custom amount or add catalog items");
      return;
    }
    setBusy(true);
    setStatus("Preparing payment…");
    try {
      const isPayIn4 = payMode === "pay_in_4";
      const lineSummary = cartLines.map((l) => `${l.productId}x${l.quantity}`).join(",");
      const metadata: Record<string, string> = {
        aether_channel: isPayIn4 ? "web_pay_in_4" : "web_checkout",
        aether_pay_in_4: isPayIn4 ? "yes" : "no",
        aether_cart_total_cents: String(finalTotalCents),
      };
      if (lineSummary) metadata.aether_line_items = lineSummary;
      if (customAmountCents > 0) {
        metadata.aether_custom_amount_cents = String(customAmountCents);
      }
      if (isPayIn4) {
        metadata.aether_installment_interval_days = String(intervalDays);
        metadata.aether_installment_schedule = schedulePreset;
      }
      const trimmedEmail = customerEmail.trim();
      if (trimmedEmail) {
        metadata.aether_customer_email = trimmedEmail;
      }

      const intent = await createWebPaymentIntent({
        amount: chargeCents,
        merchantConnectId,
        currency,
        metadata,
        saveForFutureUsage: isPayIn4,
      });

      setPendingMeta({
        chargeCents,
        finalTotalCents,
        customAmountCents,
        isPayIn4,
        intervalDays,
        schedulePreset,
        cartLines: [...cartLines],
        customerEmail: customerEmail.trim(),
      });
      setClientSecret(intent.clientSecret);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not start payment");
    } finally {
      setBusy(false);
    }
  };

  const onPaymentSuccess = async (paymentIntentId: string) => {
    if (!pendingMeta) return;
    const { isPayIn4, finalTotalCents, customAmountCents, intervalDays, schedulePreset, cartLines, customerEmail: pendingEmail } =
      pendingMeta;

    if (linked && (cartLines.length > 0 || customAmountCents > 0)) {
      setStatus("Syncing order to WordPress…");
      const order = await createPosOrder({
        merchantConnectId,
        paymentIntentId,
        currency,
        lineItems: cartLines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
        customAmountCents: customAmountCents > 0 ? customAmountCents : undefined,
        payIn4: isPayIn4
          ? { totalCents: finalTotalCents, intervalDays, schedulePreset }
          : undefined,
        customerEmail: pendingEmail || undefined,
      });
      setCart({});
      setCustomAmountText("");
      setCustomerEmail("");
      setClientSecret(null);
      setPendingMeta(null);
      await loadCatalog();
      setStatus(
        isPayIn4
          ? `Pay in 4 · 1/${INSTALLMENT_COUNT} paid · WC #${order.orderNumber}`
          : `Paid · WC #${order.orderNumber}`
      );
      return;
    }

    setCart({});
    setCustomAmountText("");
    setCustomerEmail("");
    setClientSecret(null);
    setPendingMeta(null);
    setStatus(
      isPayIn4
        ? `Pay in 4 · 1/${INSTALLMENT_COUNT} · ${formatMoney(pendingMeta.chargeCents, currency)}`
        : `Paid · ${formatMoney(finalTotalCents, currency)}`
    );
  };

  return (
    <div className="app-shell">
      <div className="screen" style={{ paddingBottom: 0 }}>
        <h1 className="title">Checkout</h1>
        {storeName ? <p className="subtitle">{storeName}</p> : null}
        <button className="link-btn" type="button" onClick={onOpenInstallments}>
          Pay in 4 plans →
        </button>

        {products.length === 0 ? (
          <p className="subtitle">
            {linked ? "No products yet." : "Connect WordPress to sync your catalog."}
          </p>
        ) : (
          products.map((item) => {
            const qty = cart[item.id]?.quantity ?? 0;
            return (
              <div key={item.id} className="product-row">
                <div className="product-info">
                  <div className="product-name">{item.name}</div>
                  <div className="product-price">
                    {formatMoney(item.priceCents, item.currency || currency)}
                  </div>
                </div>
                <div className="qty-controls">
                  {qty > 0 ? (
                    <button className="qty-btn" type="button" onClick={() => removeFromCart(item.id)}>
                      −
                    </button>
                  ) : null}
                  {qty > 0 ? <span>{qty}</span> : null}
                  <button className="qty-btn" type="button" onClick={() => addToCart(item)}>
                    +
                  </button>
                </div>
              </div>
            );
          })
        )}

        {clientSecret && pendingMeta && publishableKey ? (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: "night", variables: { colorPrimary: "#2f7cf6" } },
            }}
          >
            <PaymentForm
              amountLabel={formatMoney(pendingMeta.chargeCents, currency)}
              cardOnly={pendingMeta.isPayIn4}
              onSuccess={onPaymentSuccess}
              onCancel={() => {
                setClientSecret(null);
                setPendingMeta(null);
              }}
            />
          </Elements>
        ) : null}
      </div>

      {!clientSecret ? (
        <div className="footer">
          <div className="label">Custom amount (optional)</div>
          <input
            className="input"
            value={customAmountText}
            onChange={(e) => setCustomAmountText(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
          />
          <div className="pay-mode-row">
            <button
              type="button"
              className={`chip ${payMode === "full" ? "active" : ""}`}
              onClick={() => setPayMode("full")}
            >
              Pay in full
            </button>
            <button
              type="button"
              className={`chip ${payMode === "pay_in_4" ? "active" : ""}`}
              onClick={() => setPayMode("pay_in_4")}
            >
              Aether Pay in 4
            </button>
          </div>
          {payMode === "pay_in_4" ? (
            <>
              <div className="label">Payment schedule</div>
              <div className="schedule-row">
                {(
                  [
                    ["weekly", "Weekly"],
                    ["biweekly", "Bi-weekly"],
                    ["monthly", "Monthly"],
                    ["custom", "Custom"],
                  ] as const
                ).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    className={`chip ${schedulePreset === preset ? "active" : ""}`}
                    onClick={() => setSchedulePreset(preset)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {schedulePreset === "custom" ? (
                <input
                  className="input"
                  value={customScheduleDays}
                  onChange={(e) => setCustomScheduleDays(e.target.value)}
                  inputMode="numeric"
                  placeholder="Days between payments"
                />
              ) : null}
            </>
          ) : null}
          <div className="label">Customer email (optional)</div>
          <input
            className="input"
            type="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="receipt@example.com"
            autoComplete="email"
          />
          <div className="total">
            {payMode === "pay_in_4"
              ? `Due now · ${formatMoney(chargeCents, currency)} (4 × ${formatMoney(installmentAmounts[0], currency)}, every ${scheduleLabel})`
              : `Total · ${formatMoney(finalTotalCents, currency)}`}
          </div>
          <button
            className="btn btn-primary"
            type="button"
            onClick={startPayment}
            disabled={busy || !canCharge}
          >
            {busy ? "Processing…" : payMode === "pay_in_4" ? "Charge 1st installment" : "Charge"}
          </button>
          {status ? <p className="status">{status}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
