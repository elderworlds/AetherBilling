const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_PLATFORM_SECRET_KEY);
const { handlePaymentIntentSucceeded } = require('../lib/installment-collector');

router.post(
    '/stripe',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        if (!webhookSecret) {
            console.warn('STRIPE_WEBHOOK_SECRET not configured — webhook ignored.');
            return res.status(503).json({ error: 'Webhook secret not configured.' });
        }

        const signature = req.headers['stripe-signature'];
        let event;

        try {
            event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
        } catch (err) {
            console.error('Stripe webhook signature failed:', err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }

        try {
            if (event.type === 'payment_intent.succeeded') {
                const paymentIntent = event.data.object;
                const stripeAccountId =
                    event.account ||
                    paymentIntent.on_behalf_of ||
                    paymentIntent.transfer_data?.destination ||
                    null;

                await handlePaymentIntentSucceeded(paymentIntent, stripeAccountId);
            }
        } catch (err) {
            console.error('Stripe webhook handler error:', err.message);
            return res.status(500).json({ error: err.message });
        }

        return res.json({ received: true });
    }
);

module.exports = router;
