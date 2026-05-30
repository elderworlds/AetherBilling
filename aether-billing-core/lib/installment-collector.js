const stripe = require('stripe')(process.env.STRIPE_PLATFORM_SECRET_KEY);
const { applicationFeeAmount } = require('./fees');
const { getSiteByStripeAccount, fetchWordPressJson } = require('./sites');
const {
    getPlanById,
    recordInstallmentPaid,
    savePaymentMethod,
    storePaymentLink,
    storeChargeError,
} = require('./installment-plans');
const {
    queueInstallmentPaidEmail,
    queuePaymentLinkEmail,
} = require('./installment-emails');

function stripeAccountOptions(merchantConnectId) {
    return { stripeAccount: merchantConnectId };
}

async function extractCustomerAndPaymentMethod(paymentIntentId, merchantConnectId) {
    const pi = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ['payment_method'] },
        stripeAccountOptions(merchantConnectId)
    );

    const customerId =
        typeof pi.customer === 'string' ? pi.customer : pi.customer?.id || null;
    const pm =
        typeof pi.payment_method === 'string'
            ? pi.payment_method
            : pi.payment_method?.id || null;

    return { customerId, paymentMethodId: pm, paymentIntent: pi };
}

async function syncInstallmentToWooCommerce(plan, updatedPlan, paymentIntentId, channel) {
    if (!plan.siteUrl || !plan.wcOrderId) {
        return null;
    }

    const site = await getSiteByStripeAccount(plan.merchantConnectId);
    if (!site) {
        console.warn(`WC sync skipped — no site for ${plan.merchantConnectId}`);
        return null;
    }

    const payload = {
        paidCount: updatedPlan.paidCount,
        installmentCount: updatedPlan.installmentCount,
        nextDueAt: updatedPlan.nextDueAt,
        paymentIntentId,
        installmentNumber: updatedPlan.installmentNumber,
        isComplete: updatedPlan.isComplete,
        channel,
        amountCents: plan.installmentAmounts[updatedPlan.installmentNumber - 1] ?? null,
        intervalDays: plan.intervalDays ?? null,
    };

    return fetchWordPressJson(site, `/wp-json/aether/v1/pos-order/${plan.wcOrderId}/installment`, {
        method: 'POST',
        body: payload,
    });
}

async function finalizeInstallmentCollection(planId, paymentIntentId, channel) {
    const plan = await getPlanById(planId);
    if (!plan) {
        throw new Error('Installment plan not found.');
    }

    const updatedPlan = await recordInstallmentPaid(planId, paymentIntentId);

    try {
        await syncInstallmentToWooCommerce(plan, updatedPlan, paymentIntentId, channel);
    } catch (err) {
        console.error(`WC installment sync failed for ${planId}:`, err.message);
    }

    queueInstallmentPaidEmail(plan, updatedPlan);

    return { plan: updatedPlan, synced: true };
}

async function createOffSessionCharge(plan) {
    const amount = plan.nextAmountCents;
    if (!amount || amount <= 0) {
        throw new Error('Invalid installment amount.');
    }
    if (!plan.stripeCustomerId || !plan.stripePaymentMethodId) {
        throw new Error('No saved payment method for auto-charge.');
    }

    const platformFee = applicationFeeAmount(amount);
    const installmentNumber = plan.paidCount + 1;

    const paymentIntent = await stripe.paymentIntents.create(
        {
            amount,
            currency: plan.currency,
            customer: plan.stripeCustomerId,
            payment_method: plan.stripePaymentMethodId,
            off_session: true,
            confirm: true,
            application_fee_amount: platformFee,
            metadata: {
                aether_plan_id: plan.planId,
                aether_installment: String(installmentNumber),
                aether_channel: 'auto_charge',
                aether_wc_order_id: plan.wcOrderId ? String(plan.wcOrderId) : '',
            },
        },
        stripeAccountOptions(plan.merchantConnectId)
    );

    if (paymentIntent.status !== 'succeeded') {
        throw new Error(`Auto-charge status: ${paymentIntent.status}`);
    }

    return paymentIntent;
}

async function createPaymentLinkFallback(plan, errorMessage) {
    const amount = plan.nextAmountCents;
    const installmentNumber = plan.paidCount + 1;

    const paymentLink = await stripe.paymentLinks.create(
        {
            line_items: [
                {
                    price_data: {
                        currency: plan.currency,
                        unit_amount: amount,
                        product_data: {
                            name: `Pay in 4 — installment ${installmentNumber}/${plan.installmentCount}`,
                            description: plan.wcOrderId
                                ? `WooCommerce order #${plan.wcOrderId}`
                                : undefined,
                        },
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                aether_plan_id: plan.planId,
                aether_installment: String(installmentNumber),
                aether_channel: 'payment_link',
            },
        },
        stripeAccountOptions(plan.merchantConnectId)
    );

    await storePaymentLink(plan.planId, paymentLink.url, errorMessage);
    queuePaymentLinkEmail(plan.planId, paymentLink.url, errorMessage);
    return paymentLink.url;
}

async function attemptAutoCollect(planId) {
    const plan = await getPlanById(planId);
    if (!plan || plan.status !== 'active') {
        return { skipped: true, reason: 'inactive_or_missing' };
    }
    if (plan.paidCount >= plan.installmentCount) {
        return { skipped: true, reason: 'already_complete' };
    }

    try {
        const paymentIntent = await createOffSessionCharge(plan);
        const result = await finalizeInstallmentCollection(
            planId,
            paymentIntent.id,
            'auto_charge'
        );
        return { success: true, ...result };
    } catch (err) {
        console.error(`Auto-charge failed for ${planId}:`, err.message);
        await storeChargeError(planId, err.message);

        try {
            const linkUrl = await createPaymentLinkFallback(plan, err.message);
            return { success: false, error: err.message, paymentLinkUrl: linkUrl };
        } catch (linkErr) {
            console.error(`Payment link fallback failed for ${planId}:`, linkErr.message);
            return { success: false, error: err.message, linkError: linkErr.message };
        }
    }
}

async function collectFromTerminal(planId, paymentIntentId, merchantConnectId) {
    const plan = await getPlanById(planId);
    if (!plan) {
        throw new Error('Installment plan not found.');
    }
    if (plan.merchantConnectId !== merchantConnectId) {
        throw new Error('Plan does not belong to this merchant.');
    }

    const pi = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        {},
        stripeAccountOptions(merchantConnectId)
    );

    if (pi.status !== 'succeeded') {
        throw new Error(`PaymentIntent not succeeded (${pi.status}).`);
    }

    const metaPlanId = pi.metadata?.aether_plan_id;
    if (metaPlanId && metaPlanId !== planId) {
        throw new Error('PaymentIntent plan mismatch.');
    }

    const expectedAmount = plan.nextAmountCents;
    if (expectedAmount && pi.amount !== expectedAmount) {
        throw new Error(
            `Amount mismatch: expected ${expectedAmount}, got ${pi.amount}.`
        );
    }

    const { customerId, paymentMethodId } = await extractCustomerAndPaymentMethod(
        paymentIntentId,
        merchantConnectId
    );
    if (customerId || paymentMethodId) {
        await savePaymentMethod(planId, {
            stripeCustomerId: customerId,
            stripePaymentMethodId: paymentMethodId,
        });
    }

    return finalizeInstallmentCollection(planId, paymentIntentId, 'terminal');
}

async function saveFirstPaymentMethodFromIntent(planId, paymentIntentId, merchantConnectId) {
    const { customerId, paymentMethodId } = await extractCustomerAndPaymentMethod(
        paymentIntentId,
        merchantConnectId
    );
    if (planId && (customerId || paymentMethodId)) {
        await savePaymentMethod(planId, {
            stripeCustomerId: customerId,
            stripePaymentMethodId: paymentMethodId,
        });
    }
    return { customerId, paymentMethodId };
}

async function processDueInstallments() {
    const { listDuePlans } = require('./installment-plans');
    const duePlans = await listDuePlans();
    const results = [];

    for (const plan of duePlans) {
        const result = await attemptAutoCollect(plan.planId);
        results.push({ planId: plan.planId, ...result });
    }

    return results;
}

async function handlePaymentIntentSucceeded(paymentIntent, stripeAccountId) {
    const planId = paymentIntent.metadata?.aether_plan_id;
    if (!planId) {
        return { handled: false };
    }

    const channel = paymentIntent.metadata?.aether_channel || 'webhook';
    if (
        channel === 'terminal_pay_in_4' ||
        channel === 'terminal_pos' ||
        channel === 'terminal_installment_collect'
    ) {
        return { handled: false };
    }

    const plan = await getPlanById(planId);
    if (!plan) {
        return { handled: false, error: 'plan_not_found' };
    }

    if (plan.paymentIntentIds.includes(paymentIntent.id)) {
        return { handled: true, duplicate: true };
    }

    const expectedAmount = plan.nextAmountCents;
    if (expectedAmount && paymentIntent.amount !== expectedAmount) {
        console.warn(
            `PI ${paymentIntent.id} amount ${paymentIntent.amount} != expected ${expectedAmount}`
        );
    }

    if (stripeAccountId) {
        const { customerId, paymentMethodId } = await extractCustomerAndPaymentMethod(
            paymentIntent.id,
            stripeAccountId
        );
        if (customerId || paymentMethodId) {
            await savePaymentMethod(planId, {
                stripeCustomerId: customerId,
                stripePaymentMethodId: paymentMethodId,
            });
        }
    }

    const result = await finalizeInstallmentCollection(
        planId,
        paymentIntent.id,
        channel
    );
    return { handled: true, ...result };
}

module.exports = {
    extractCustomerAndPaymentMethod,
    syncInstallmentToWooCommerce,
    finalizeInstallmentCollection,
    attemptAutoCollect,
    collectFromTerminal,
    saveFirstPaymentMethodFromIntent,
    processDueInstallments,
    handlePaymentIntentSucceeded,
    createPaymentLinkFallback,
};
