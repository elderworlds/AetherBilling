const INSTALLMENT_COUNT = 4;
const INSTALLMENT_INTERVAL_DAYS = 14;

const SCHEDULE_PRESETS = {
    weekly: 7,
    biweekly: 14,
    monthly: 30,
};

function resolveIntervalDays(input) {
    if (input != null && Number.isFinite(Number(input))) {
        const days = Math.round(Number(input));
        if (days > 0) return days;
    }
    if (input && typeof input === 'object') {
        if (Number.isFinite(Number(input.intervalDays))) {
            const days = Math.round(Number(input.intervalDays));
            if (days > 0) return days;
        }
        const preset = input.schedulePreset || input.schedule;
        if (preset && SCHEDULE_PRESETS[preset]) {
            return SCHEDULE_PRESETS[preset];
        }
    }
    return INSTALLMENT_INTERVAL_DAYS;
}

function splitInstallments(totalCents, count = INSTALLMENT_COUNT) {
    const total = Math.max(0, Math.round(Number(totalCents) || 0));
    if (total <= 0) {
        return Array.from({ length: count }, () => 0);
    }

    const base = Math.floor(total / count);
    const remainder = total - base * count;
    return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

function nextDueDates(fromDate = new Date(), count = INSTALLMENT_COUNT, intervalDays = INSTALLMENT_INTERVAL_DAYS) {
    const dates = [];
    const start = new Date(fromDate);
    const interval = resolveIntervalDays(intervalDays);
    for (let i = 1; i < count; i += 1) {
        const due = new Date(start);
        due.setDate(due.getDate() + interval * i);
        dates.push(due.toISOString());
    }
    return dates;
}

function addInterval(fromDate = new Date(), intervalDays = INSTALLMENT_INTERVAL_DAYS) {
    const due = new Date(fromDate);
    due.setDate(due.getDate() + resolveIntervalDays(intervalDays));
    return due.toISOString();
}

module.exports = {
    INSTALLMENT_COUNT,
    INSTALLMENT_INTERVAL_DAYS,
    SCHEDULE_PRESETS,
    resolveIntervalDays,
    splitInstallments,
    nextDueDates,
    addInterval,
};
