const { nextDueDates } = require('./installments');

function formatMoney(cents, currency = 'usd') {
    const amount = (Number(cents) || 0) / 100;
    try {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency.toUpperCase(),
        }).format(amount);
    } catch {
        return `$${amount.toFixed(2)}`;
    }
}

function formatDate(iso) {
    if (!iso) return '—';
    try {
        return new Intl.DateTimeFormat('en-US', {
            dateStyle: 'medium',
        }).format(new Date(iso));
    } catch {
        return String(iso);
    }
}

function emailLayout({ title, bodyHtml, footerNote }) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e5e7eb;">
        <tr><td style="padding:28px 32px 8px;">
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Aether Pay</p>
          <h1 style="margin:0 0 20px;font-size:22px;line-height:1.3;color:#111827;">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:0 32px 28px;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:#9ca3af;">${footerNote || 'Questions? Reply to this email or contact your merchant.'}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buttonHtml(href, label) {
    const safeHref = String(href || '').replace(/"/g, '&quot;');
    return `<p style="margin:24px 0 8px;">
      <a href="${safeHref}" style="display:inline-block;background:#2f7cf6;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 20px;border-radius:6px;">${label}</a>
    </p>`;
}

function scheduleTableHtml(plan) {
    const amounts = plan.installmentAmounts || [];
    const dueDates = nextDueDates(new Date(plan.createdAt || Date.now()), amounts.length, plan.intervalDays);
    const rows = amounts
        .map((cents, index) => {
            const num = index + 1;
            const paid = num <= plan.paidCount;
            const status = paid ? 'Paid' : `Due ${formatDate(dueDates[index - 1] || plan.nextDueAt)}`;
            return `<tr>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;color:#374151;">Installment ${num}</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;color:#111827;font-weight:600;">${formatMoney(cents, plan.currency)}</td>
              <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right;color:${paid ? '#059669' : '#6b7280'};">${status}</td>
            </tr>`;
        })
        .join('');

    return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0 8px;font-size:14px;">
      <tr>
        <th align="left" style="padding:0 0 8px;color:#6b7280;font-weight:600;font-size:12px;">Payment</th>
        <th align="right" style="padding:0 0 8px;color:#6b7280;font-weight:600;font-size:12px;">Amount</th>
        <th align="right" style="padding:0 0 8px;color:#6b7280;font-weight:600;font-size:12px;">Status</th>
      </tr>
      ${rows}
    </table>`;
}

function planCreatedEmail(plan, orderNumber) {
    const orderRef = orderNumber ? `Order #${orderNumber}` : plan.wcOrderId ? `Order #${plan.wcOrderId}` : 'your purchase';
    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
        Thank you for choosing Pay in 4. Your first installment has been collected for ${orderRef}.
      </p>
      <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Total plan amount</p>
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;">${formatMoney(plan.totalCents, plan.currency)}</p>
      ${scheduleTableHtml(plan)}
      <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#374151;">
        Remaining installments will be charged automatically on the schedule above. You will receive a confirmation email after each payment.
      </p>`;

    return {
        subject: `Pay in 4 plan started — ${formatMoney(plan.totalCents, plan.currency)}`,
        html: emailLayout({
            title: 'Your Pay in 4 plan is active',
            bodyHtml,
        }),
    };
}

function paymentLinkEmail(plan, linkUrl, reason) {
    const installmentNumber = plan.paidCount + 1;
    const amount = plan.nextAmountCents;
    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
        We could not process installment ${installmentNumber} of ${plan.installmentCount} automatically.
        ${reason ? ` Reason: ${String(reason).replace(/</g, '&lt;')}.` : ''}
      </p>
      <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Amount due now</p>
      <p style="margin:0 0 8px;font-size:20px;font-weight:700;color:#111827;">${formatMoney(amount, plan.currency)}</p>
      ${buttonHtml(linkUrl, 'Pay installment now')}
      <p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#6b7280;">
        This secure payment link will stay active until your installment is paid.
      </p>`;

    return {
        subject: `Action required — Pay in 4 installment ${installmentNumber} (${formatMoney(amount, plan.currency)})`,
        html: emailLayout({
            title: 'Complete your installment payment',
            bodyHtml,
        }),
    };
}

function installmentPaidEmail(plan, installmentNumber, amountCents) {
    const remaining = plan.installmentCount - plan.paidCount;
    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
        We received installment ${installmentNumber} of ${plan.installmentCount}.
      </p>
      <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Amount paid</p>
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;">${formatMoney(amountCents, plan.currency)}</p>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">
        ${remaining > 0
            ? `${remaining} payment${remaining === 1 ? '' : 's'} remaining.${plan.nextDueAt ? ` Next due: ${formatDate(plan.nextDueAt)}.` : ''}`
            : 'Your plan is now complete.'}
      </p>`;

    return {
        subject: `Payment received — installment ${installmentNumber} of ${plan.installmentCount}`,
        html: emailLayout({
            title: 'Payment confirmation',
            bodyHtml,
        }),
    };
}

function planCompleteEmail(plan) {
    const bodyHtml = `
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;">
        All ${plan.installmentCount} installments have been paid. Your Pay in 4 plan is complete.
      </p>
      <p style="margin:0 0 4px;font-size:14px;color:#6b7280;">Total paid</p>
      <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#111827;">${formatMoney(plan.totalCents, plan.currency)}</p>
      ${scheduleTableHtml({ ...plan, paidCount: plan.installmentCount })}
      <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#374151;">Thank you for your business.</p>`;

    return {
        subject: `Pay in 4 complete — ${formatMoney(plan.totalCents, plan.currency)}`,
        html: emailLayout({
            title: 'Your Pay in 4 plan is paid in full',
            bodyHtml,
        }),
    };
}

module.exports = {
    formatMoney,
    planCreatedEmail,
    paymentLinkEmail,
    installmentPaidEmail,
    planCompleteEmail,
};
