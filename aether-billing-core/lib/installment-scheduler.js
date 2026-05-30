const { processDueInstallments } = require('./installment-collector');

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

function startInstallmentScheduler(intervalMs = DEFAULT_INTERVAL_MS) {
    if (process.env.AETHER_INSTALLMENT_SCHEDULER === 'off') {
        console.log('Installment scheduler disabled (AETHER_INSTALLMENT_SCHEDULER=off).');
        return null;
    }

    const run = async () => {
        try {
            const results = await processDueInstallments();
            if (results.length) {
                console.log(
                    `Installment scheduler processed ${results.length} due plan(s).`
                );
            }
        } catch (err) {
            console.error('Installment scheduler error:', err.message);
        }
    };

    run();
    return setInterval(run, intervalMs);
}

module.exports = { startInstallmentScheduler };
