let resendClient = null;

function isEmailConfigured() {
    return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM);
}

function getResend() {
    if (!process.env.RESEND_API_KEY) {
        return null;
    }
    if (!resendClient) {
        const { Resend } = require('resend');
        resendClient = new Resend(process.env.RESEND_API_KEY);
    }
    return resendClient;
}

/**
 * Send email via Resend. No-ops when RESEND_API_KEY or RESEND_FROM is unset.
 * Failures are logged and never thrown.
 */
async function sendEmail({ to, subject, html }) {
    if (!to || !subject || !html) {
        return { sent: false, reason: 'missing_fields' };
    }
    if (!isEmailConfigured()) {
        return { sent: false, reason: 'not_configured' };
    }

    try {
        const resend = getResend();
        const result = await resend.emails.send({
            from: process.env.RESEND_FROM,
            to: [to],
            subject,
            html,
        });
        return { sent: true, id: result?.data?.id || null };
    } catch (err) {
        console.error('[email] send failed:', err.message);
        return { sent: false, error: err.message };
    }
}

module.exports = {
    sendEmail,
    isEmailConfigured,
};
