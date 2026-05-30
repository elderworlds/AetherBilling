import { useState } from "react";
import {
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";

type Props = {
  amountLabel: string;
  cardOnly?: boolean;
  onSuccess: (paymentIntentId: string) => Promise<void>;
  onCancel: () => void;
};

export function PaymentForm({ amountLabel, cardOnly = false, onSuccess, onCancel }: Props) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!stripe || !elements) return;
    setBusy(true);
    setError("");
    try {
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });
      if (submitError) {
        setError(submitError.message || "Payment failed");
        return;
      }
      const id = paymentIntent?.id;
      if (!id) {
        setError("Payment did not complete");
        return;
      }
      await onSuccess(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="payment-panel">
      <p className="subtitle">
        {cardOnly ? "Card entry" : "Payment method"} · {amountLabel}
      </p>
      <p className="notice">
        {cardOnly
          ? "Aether Pay in 4 requires a card to save for future installments. Klarna and Afterpay are not available for this option."
          : "Choose card, Klarna, or Afterpay. BNPL may require a minimum amount ($35 for Klarna, up to $2,000 for Afterpay)."}
      </p>
      <PaymentElement options={{ layout: "tabs" }} />
      <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={submit} disabled={busy || !stripe}>
        {busy ? "Processing…" : "Pay"}
      </button>
      <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
