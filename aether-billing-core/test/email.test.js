const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('email module', () => {
    let originalApiKey;
    let originalFrom;

    beforeEach(() => {
        originalApiKey = process.env.RESEND_API_KEY;
        originalFrom = process.env.RESEND_FROM;
        delete require.cache[require.resolve('../lib/email')];
    });

    afterEach(() => {
        if (originalApiKey === undefined) {
            delete process.env.RESEND_API_KEY;
        } else {
            process.env.RESEND_API_KEY = originalApiKey;
        }
        if (originalFrom === undefined) {
            delete process.env.RESEND_FROM;
        } else {
            process.env.RESEND_FROM = originalFrom;
        }
        delete require.cache[require.resolve('../lib/email')];
    });

    it('loads without error', () => {
        const email = require('../lib/email');
        assert.equal(typeof email.sendEmail, 'function');
        assert.equal(typeof email.isEmailConfigured, 'function');
    });

    it('no-ops when RESEND_API_KEY is unset', async () => {
        delete process.env.RESEND_API_KEY;
        delete process.env.RESEND_FROM;
        const { sendEmail, isEmailConfigured } = require('../lib/email');

        assert.equal(isEmailConfigured(), false);
        const result = await sendEmail({
            to: 'customer@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
        });
        assert.equal(result.sent, false);
        assert.equal(result.reason, 'not_configured');
    });

    it('no-ops when RESEND_FROM is unset', async () => {
        process.env.RESEND_API_KEY = 're_test_key';
        delete process.env.RESEND_FROM;
        const { sendEmail, isEmailConfigured } = require('../lib/email');

        assert.equal(isEmailConfigured(), false);
        const result = await sendEmail({
            to: 'customer@example.com',
            subject: 'Test',
            html: '<p>Test</p>',
        });
        assert.equal(result.sent, false);
        assert.equal(result.reason, 'not_configured');
    });
});

describe('installment-emails helpers', () => {
    it('normalizes valid emails', () => {
        const { normalizeEmail } = require('../lib/installment-emails');
        assert.equal(normalizeEmail('  Customer@Example.COM '), 'customer@example.com');
        assert.equal(normalizeEmail('not-an-email'), null);
        assert.equal(normalizeEmail(''), null);
    });
});
