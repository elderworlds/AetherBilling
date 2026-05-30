const { sendEmail } = require('./email');
const { getSiteByStripeAccount, fetchWordPressJson } = require('./sites');
const {
    getPlanById,
    saveCustomerEmail,
} = require('./installment-plans');
const {
    planCreatedEmail,
    paymentLinkEmail,
    installmentPaidEmail,
    planCompleteEmail,
} = require('./email-templates');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    return EMAIL_RE.test(email) ? email : null;
}

async function fetchOrderCustomerEmail(plan) {
    if (!plan.siteUrl || !plan.wcOrderId) {
        return null;
    }

    const site = await getSiteByStripeAccount(plan.merchantConnectId);
    if (!site) {
        return null;
    }

    try {
        const data = await fetchWordPressJson(
            site,
            `/wp-json/aether/v1/pos-order/${plan.wcOrderId}`
        );
        return normalizeEmail(data.customerEmail);
    } catch (err) {
        console.warn(`[email] could not fetch WC email for plan ${plan.planId}:`, err.message);
        return null;
    }
}

async function resolvePlanEmail(plan, candidateEmail = null) {
    const direct = normalizeEmail(candidateEmail) || normalizeEmail(plan.customerEmail);
    if (direct) {
        return direct;
    }
    return fetchOrderCustomerEmail(plan);
}

async function persistPlanEmailIfNeeded(planId, email) {
    const normalized = normalizeEmail(email);
    if (!normalized) {
        return null;
    }
    await saveCustomerEmail(planId, normalized);
    return normalized;
}

async function safeSendEmail(to, template) {
    if (!to || !template) {
        return { sent: false, reason: 'no_recipient_or_template' };
    }
    return sendEmail({
        to,
        subject: template.subject,
        html: template.html,
    });
}

/**
 * Fire-and-forget email helper — never throws.
 */
function sendInstallmentEmail(work) {
    Promise.resolve()
        .then(work)
        .catch((err) => {
            console.error('[email] installment notification failed:', err.message);
        });
}

async function notifyPlanCreated(planId, { customerEmail, orderNumber } = {}) {
    const plan = await getPlanById(planId);
    if (!plan) return;

    const email = await resolvePlanEmail(plan, customerEmail);
    if (!email) return;

    await persistPlanEmailIfNeeded(planId, email);
    const template = planCreatedEmail(plan, orderNumber);
    await safeSendEmail(email, template);
}

async function notifyPaymentLinkCreated(planId, linkUrl, reason) {
    const plan = await getPlanById(planId);
    if (!plan || !linkUrl) return;

    const email = await resolvePlanEmail(plan);
    if (!email) return;

    await persistPlanEmailIfNeeded(planId, email);
    const template = paymentLinkEmail(plan, linkUrl, reason);
    await safeSendEmail(email, template);
}

async function notifyInstallmentPaid(plan, updatedPlan) {
    const email = await resolvePlanEmail(updatedPlan);
    if (!email) return;

    await persistPlanEmailIfNeeded(updatedPlan.planId, email);

    if (updatedPlan.isComplete) {
        await safeSendEmail(email, planCompleteEmail(updatedPlan));
        return;
    }

    if (updatedPlan.paidCount < 2) {
        return;
    }

    const amountCents =
        plan.installmentAmounts[updatedPlan.installmentNumber - 1] ??
        updatedPlan.nextAmountCents ??
        0;
    const template = installmentPaidEmail(
        updatedPlan,
        updatedPlan.installmentNumber,
        amountCents
    );
    await safeSendEmail(email, template);
}

function queuePlanCreatedEmail(planId, options) {
    sendInstallmentEmail(() => notifyPlanCreated(planId, options));
}

function queuePaymentLinkEmail(planId, linkUrl, reason) {
    sendInstallmentEmail(() => notifyPaymentLinkCreated(planId, linkUrl, reason));
}

function queueInstallmentPaidEmail(plan, updatedPlan) {
    sendInstallmentEmail(() => notifyInstallmentPaid(plan, updatedPlan));
}

module.exports = {
    normalizeEmail,
    resolvePlanEmail,
    persistPlanEmailIfNeeded,
    notifyPlanCreated,
    notifyPaymentLinkCreated,
    notifyInstallmentPaid,
    queuePlanCreatedEmail,
    queuePaymentLinkEmail,
    queueInstallmentPaidEmail,
};
