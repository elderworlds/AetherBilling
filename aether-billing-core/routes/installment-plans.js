const express = require('express');
const router = express.Router();
const {
    getPlanById,
    listPlansByMerchant,
} = require('../lib/installment-plans');
const {
    attemptAutoCollect,
    collectFromTerminal,
} = require('../lib/installment-collector');

router.get('/', async (req, res) => {
    const merchantConnectId = String(req.query.merchantConnectId || '');

    if (!merchantConnectId.startsWith('acct_')) {
        return res.status(400).json({
            success: false,
            error: 'merchantConnectId (acct_...) is required.',
        });
    }

    try {
        const status = req.query.status ? String(req.query.status) : 'active';
        const plans = await listPlansByMerchant(merchantConnectId, { status });
        return res.json({ success: true, plans });
    } catch (error) {
        console.error('List installment plans failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/:planId', async (req, res) => {
    const plan = await getPlanById(req.params.planId);
    if (!plan) {
        return res.status(404).json({ success: false, error: 'Plan not found.' });
    }
    return res.json({ success: true, plan });
});

router.post('/:planId/collect', async (req, res) => {
    const { merchantConnectId, paymentIntentId, mode } = req.body;
    const planId = req.params.planId;

    if (!merchantConnectId || !String(merchantConnectId).startsWith('acct_')) {
        return res.status(400).json({
            success: false,
            error: 'merchantConnectId (acct_...) is required.',
        });
    }

    try {
        const plan = await getPlanById(planId);
        if (!plan) {
            return res.status(404).json({ success: false, error: 'Plan not found.' });
        }
        if (plan.merchantConnectId !== merchantConnectId) {
            return res.status(403).json({ success: false, error: 'Plan access denied.' });
        }
        if (plan.status !== 'active') {
            return res.status(400).json({
                success: false,
                error: `Plan is ${plan.status}.`,
            });
        }
        if (plan.paidCount >= plan.installmentCount) {
            return res.status(400).json({
                success: false,
                error: 'All installments already paid.',
            });
        }

        if (mode === 'auto') {
            const result = await attemptAutoCollect(planId);
            return res.json({ success: result.success !== false, ...result });
        }

        if (!paymentIntentId) {
            return res.json({
                success: true,
                ready: true,
                plan,
                nextAmountCents: plan.nextAmountCents,
                installmentNumber: plan.paidCount + 1,
            });
        }

        const result = await collectFromTerminal(planId, paymentIntentId, merchantConnectId);
        return res.json({ success: true, ...result });
    } catch (error) {
        console.error('Collect installment failed:', error.message);
        return res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
