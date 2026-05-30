const crypto = require('crypto');
const db = require('../database');
const { INSTALLMENT_COUNT, INSTALLMENT_INTERVAL_DAYS, addInterval } = require('./installments');

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function onRun(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
        });
    });
}

function parsePlan(row) {
    if (!row) return null;
    let installmentAmounts = [];
    let paymentIntentIds = [];
    try {
        installmentAmounts = JSON.parse(row.installment_amounts || '[]');
    } catch {
        installmentAmounts = [];
    }
    try {
        paymentIntentIds = JSON.parse(row.payment_intent_ids || '[]');
    } catch {
        paymentIntentIds = [];
    }
    const paidCount = Number(row.paid_count) || 0;
    const installmentCount = installmentAmounts.length || INSTALLMENT_COUNT;
    const nextAmountCents =
        paidCount < installmentAmounts.length ? installmentAmounts[paidCount] : null;

    return {
        planId: row.plan_id,
        merchantConnectId: row.merchant_connect_id,
        siteUrl: row.site_url,
        wcOrderId: row.wc_order_id,
        currency: row.currency,
        totalCents: row.total_cents,
        installmentAmounts,
        paidCount,
        installmentCount,
        paymentIntentIds,
        nextDueAt: row.next_due_at,
        intervalDays: row.interval_days != null ? Number(row.interval_days) : INSTALLMENT_INTERVAL_DAYS,
        nextAmountCents,
        status: row.status,
        stripeCustomerId: row.stripe_customer_id || null,
        stripePaymentMethodId: row.stripe_payment_method_id || null,
        paymentLinkUrl: row.payment_link_url || null,
        lastChargeError: row.last_charge_error || null,
        customerEmail: row.customer_email || null,
        createdAt: row.created_at,
    };
}

async function createInstallmentPlan({
    merchantConnectId,
    siteUrl,
    wcOrderId,
    currency,
    totalCents,
    installmentAmounts,
    paymentIntentId,
    nextDueAt,
    intervalDays,
    stripeCustomerId,
    stripePaymentMethodId,
    customerEmail,
}) {
    const planIntervalDays = intervalDays != null ? Number(intervalDays) : INSTALLMENT_INTERVAL_DAYS;
    const planId = `aip_${crypto.randomBytes(12).toString('hex')}`;
    const amountsJson = JSON.stringify(installmentAmounts);
    const paymentIdsJson = JSON.stringify([paymentIntentId]);

    await run(
        `INSERT INTO installment_plans (
            plan_id, merchant_connect_id, site_url, wc_order_id, currency,
            total_cents, installment_amounts, paid_count, payment_intent_ids,
            next_due_at, status, stripe_customer_id, stripe_payment_method_id, interval_days,
            customer_email
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            planId,
            merchantConnectId,
            siteUrl || null,
            wcOrderId || null,
            currency,
            totalCents,
            amountsJson,
            1,
            paymentIdsJson,
            nextDueAt || null,
            'active',
            stripeCustomerId || null,
            stripePaymentMethodId || null,
            planIntervalDays,
            customerEmail || null,
        ]
    );

    return {
        planId,
        paidCount: 1,
        installmentCount: installmentAmounts.length,
    };
}

async function getPlanById(planId) {
    const row = await get(`SELECT * FROM installment_plans WHERE plan_id = ?`, [planId]);
    return parsePlan(row);
}

async function listPlansByMerchant(merchantConnectId, { status = 'active' } = {}) {
    const rows = await all(
        `SELECT * FROM installment_plans
         WHERE merchant_connect_id = ?
         AND (? IS NULL OR status = ?)
         ORDER BY next_due_at ASC, created_at DESC`,
        [merchantConnectId, status || null, status || null]
    );
    return rows.map(parsePlan);
}

async function listDuePlans(now = new Date()) {
    const iso = now.toISOString();
    const rows = await all(
        `SELECT * FROM installment_plans
         WHERE status = 'active'
         AND paid_count < ?
         AND next_due_at IS NOT NULL
         AND next_due_at <= ?`,
        [INSTALLMENT_COUNT, iso]
    );
    return rows.map(parsePlan);
}

function computeNextDueAt(fromDate = new Date(), intervalDays = INSTALLMENT_INTERVAL_DAYS) {
    return addInterval(fromDate, intervalDays);
}

async function recordInstallmentPaid(planId, paymentIntentId, { clearPaymentLink = true } = {}) {
    const row = await get(`SELECT * FROM installment_plans WHERE plan_id = ?`, [planId]);
    if (!row) {
        throw new Error('Installment plan not found.');
    }

    const plan = parsePlan(row);
    if (plan.status !== 'active') {
        throw new Error(`Plan is ${plan.status}, cannot collect.`);
    }
    if (plan.paidCount >= plan.installmentCount) {
        throw new Error('All installments already paid.');
    }

    const newPaidCount = plan.paidCount + 1;
    const paymentIds = [...plan.paymentIntentIds, paymentIntentId];
    const isComplete = newPaidCount >= plan.installmentCount;
    const planIntervalDays =
        row.interval_days != null ? Number(row.interval_days) : INSTALLMENT_INTERVAL_DAYS;
    const nextDueAt = isComplete ? null : computeNextDueAt(new Date(), planIntervalDays);
    const status = isComplete ? 'completed' : 'active';

    await run(
        `UPDATE installment_plans SET
            paid_count = ?,
            payment_intent_ids = ?,
            next_due_at = ?,
            status = ?,
            payment_link_url = CASE WHEN ? = 1 THEN NULL ELSE payment_link_url END,
            last_charge_error = NULL
         WHERE plan_id = ?`,
        [
            newPaidCount,
            JSON.stringify(paymentIds),
            nextDueAt,
            status,
            clearPaymentLink ? 1 : 0,
            planId,
        ]
    );

    return {
        ...plan,
        paidCount: newPaidCount,
        paymentIntentIds: paymentIds,
        nextDueAt,
        status,
        installmentNumber: newPaidCount,
        isComplete,
    };
}

async function savePaymentMethod(planId, { stripeCustomerId, stripePaymentMethodId }) {
    await run(
        `UPDATE installment_plans SET
            stripe_customer_id = COALESCE(?, stripe_customer_id),
            stripe_payment_method_id = COALESCE(?, stripe_payment_method_id)
         WHERE plan_id = ?`,
        [stripeCustomerId || null, stripePaymentMethodId || null, planId]
    );
}

async function storePaymentLink(planId, url, errorMessage = null) {
    await run(
        `UPDATE installment_plans SET
            payment_link_url = ?,
            last_charge_error = ?,
            last_payment_link_at = datetime('now')
         WHERE plan_id = ?`,
        [url, errorMessage, planId]
    );
}

async function storeChargeError(planId, errorMessage) {
    await run(
        `UPDATE installment_plans SET last_charge_error = ? WHERE plan_id = ?`,
        [errorMessage, planId]
    );
}

async function saveCustomerEmail(planId, email) {
    if (!email) return;
    await run(
        `UPDATE installment_plans SET customer_email = COALESCE(customer_email, ?) WHERE plan_id = ?`,
        [email, planId]
    );
}

module.exports = {
    parsePlan,
    createInstallmentPlan,
    getPlanById,
    listPlansByMerchant,
    listDuePlans,
    recordInstallmentPaid,
    savePaymentMethod,
    storePaymentLink,
    storeChargeError,
    saveCustomerEmail,
    computeNextDueAt,
    INSTALLMENT_COUNT,
};
