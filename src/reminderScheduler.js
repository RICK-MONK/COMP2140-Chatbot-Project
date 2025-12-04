async function sendReminder({ order, whatsappClient }) {
    const userId = `${order.phone}@c.us`;
    const date = order.scheduledDate || order.date || 'your scheduled date';
    const time = order.scheduleTime || 'the scheduled time';
    const message = `Reminder: Order #${order.id} is scheduled for ${date} at ${time}. Reply 'Reschedule' if you need to change.`;
    await whatsappClient.sendMessage(userId, message);
}

function isDue(reminderTime) {
    const ts = new Date(reminderTime).getTime();
    if (Number.isNaN(ts)) return false;
    return ts <= Date.now();
}

function startReminderScheduler({ ordersStore, whatsappClient, reminderLogger, getSystemStatus, intervalMs = 60_000 }) {
    if (!ordersStore || !whatsappClient) {
        console.warn('Reminder scheduler not started: missing ordersStore or WhatsApp client');
        return () => {};
    }

    const logger = reminderLogger || { logReminder: () => {} };

    async function tick() {
        try {
            if (getSystemStatus && !getSystemStatus().ready) return;
            const orders = ordersStore.getAllOrders();
            for (const order of orders) {
                if (!order.reminderTime || order.reminderSent) continue;
                if (!isDue(order.reminderTime)) continue;

                try {
                    await sendReminder({ order, whatsappClient });
                    const sentAt = new Date().toISOString();
                    ordersStore.updateOrder(order.id, { reminderSent: true, reminderSentAt: sentAt });
                    logger.logReminder({
                        orderId: order.id,
                        phone: order.phone,
                        scheduledFor: order.reminderTime,
                        sentAt,
                        status: 'SENT'
                    });
                } catch (err) {
                    console.error('Reminder send error', err);
                    logger.logReminder({
                        orderId: order.id,
                        phone: order.phone,
                        scheduledFor: order.reminderTime,
                        sentAt: new Date().toISOString(),
                        status: 'FAILED',
                        error: err.message
                    });
                }
            }
        } catch (err) {
            console.error('Reminder scheduler tick error', err);
        }
    }

    const interval = setInterval(tick, intervalMs);
    console.log(`Reminder scheduler running every ${intervalMs / 1000}s`);
    tick();
    return () => clearInterval(interval);
}

module.exports = { startReminderScheduler };
