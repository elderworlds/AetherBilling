import { useCallback, useEffect, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import {
  InstallmentPlan,
  collectInstallment,
  createWebPaymentIntent,
  fetchInstallmentPlans,
  formatMoney,
} from "../api";
import { PaymentForm } from "../components/PaymentForm";
import { INSTALLMENT_COUNT, formatScheduleFromDays } from "../lib/installments";

type Props = {
  merchantConnectId: string;
  currency: string;
  stripePromise: Promise<Stripe | null>;
  publishableKey: string;
  onBack: () => void;
};

function formatDueDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function InstallmentPlansScreen({
  merchantConnectId,
  currency,
  stripePromise,
  publishableKey,
  onBack,
}: Props) {
  const [plans, setPlans] = useState<InstallmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [activePlan, setActivePlan] = useState<InstallmentPlan | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchInstallmentPlans(merchantConnectId);
      const sorted = [...(data.plans || [])].sort((a, b) => {
        const aDue = a.nextDueAt ? new Date(a.nextDueAt).getTime() : Infinity;
        const bDue = b.nextDueAt ? new Date(b.nextDueAt).getTime() : Infinity;
        return aDue - bDue;
      });
      setPlans(sorted);
      setStatus(sorted.length ? "" : "No active Pay in 4 plans");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not load plans");
    } finally {
      setLoading(false);
    }
  }, [merchantConnectId]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  const startCollect = async (plan: InstallmentPlan) => {
    const amount = plan.nextAmountCents;
    if (!amount || amount <= 0) {
      setStatus("No amount due on this plan");
      return;
    }
    try {
      setStatus("Preparing installment payment…");
      const installmentNumber = plan.paidCount + 1;
      const intent = await createWebPaymentIntent({
        amount,
        merchantConnectId,
        currency: plan.currency || currency,
        planId: plan.planId,
        saveForFutureUsage: true,
        metadata: {
          aether_plan_id: plan.planId,
          aether_installment: String(installmentNumber),
          aether_pay_in_4: "yes",
        },
      });
      setActivePlan(plan);
      setClientSecret(intent.clientSecret);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not start collection");
    }
  };

  const onPaymentSuccess = async (paymentIntentId: string) => {
    if (!activePlan) return;
    setStatus("Recording installment…");
    const installmentNumber = activePlan.paidCount + 1;
    const result = await collectInstallment({
      planId: activePlan.planId,
      merchantConnectId,
      paymentIntentId,
    });
    setClientSecret(null);
    setActivePlan(null);
    if (result.plan?.status === "completed") {
      setStatus(`Complete · ${installmentNumber}/${INSTALLMENT_COUNT} paid`);
    } else {
      setStatus(`Paid ${installmentNumber}/${INSTALLMENT_COUNT}`);
    }
    await loadPlans();
  };

  const shareLink = async (url: string) => {
    if (navigator.share) {
      await navigator.share({ url, title: "Aether payment link" });
    } else {
      await navigator.clipboard.writeText(url);
      setStatus("Payment link copied");
    }
  };

  return (
    <div className="screen">
      <button type="button" className="back-link" onClick={onBack}>
        ← Checkout
      </button>
      <h1 className="title">Pay in 4 plans</h1>
      <p className="subtitle">Collect due installments via card entry</p>

      {loading ? <p className="status">Loading…</p> : null}

      {!loading &&
        plans.map((item) => {
          const overdue = item.nextDueAt
            ? new Date(item.nextDueAt).getTime() <= Date.now()
            : false;
          return (
            <div key={item.planId} className={`plan-card ${overdue ? "overdue" : ""}`}>
              <strong>
                {item.paidCount}/{item.installmentCount} paid
              </strong>
              {item.wcOrderId ? (
                <span style={{ float: "right", color: "var(--text-muted)" }}>
                  WC #{item.wcOrderId}
                </span>
              ) : null}
              <p className="subtitle" style={{ marginBottom: 0 }}>
                Total · {formatMoney(item.totalCents, item.currency || currency)}
              </p>
              {item.intervalDays ? (
                <p className="subtitle" style={{ marginBottom: 0 }}>
                  Schedule · {formatScheduleFromDays(item.intervalDays)}
                </p>
              ) : null}
              <p className="subtitle">
                Next · {formatMoney(item.nextAmountCents ?? 0, item.currency || currency)}
                {item.nextDueAt ? ` · due ${formatDueDate(item.nextDueAt)}` : ""}
              </p>
              {item.paymentLinkUrl ? (
                <div className="link-row">
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => window.open(item.paymentLinkUrl!, "_blank")}
                  >
                    Open payment link
                  </button>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => shareLink(item.paymentLinkUrl!)}
                  >
                    Share link
                  </button>
                </div>
              ) : null}
              <button
                className="btn btn-primary"
                type="button"
                style={{ marginTop: "0.75rem" }}
                onClick={() => startCollect(item)}
              >
                Collect installment {item.paidCount + 1}
              </button>
            </div>
          );
        })}

      {clientSecret && activePlan && publishableKey ? (
        <Elements
          stripe={stripePromise}
          options={{
            clientSecret,
            appearance: { theme: "night", variables: { colorPrimary: "#2f7cf6" } },
          }}
        >
          <PaymentForm
            amountLabel={formatMoney(activePlan.nextAmountCents ?? 0, activePlan.currency || currency)}
            onSuccess={onPaymentSuccess}
            onCancel={() => {
              setClientSecret(null);
              setActivePlan(null);
            }}
          />
        </Elements>
      ) : null}

      {status ? <p className="status">{status}</p> : null}
    </div>
  );
}
