/**
 * Entry point: wires WhatsApp bot + HTTP server.
 */
const path = require('path');
const { prices, PORT } = require('./src/config');
const ordersStore = require('./src/orders');
const { createBot } = require('./src/bot');
const { startServer } = require('./src/server');
const { startReminderScheduler } = require('./src/reminderScheduler');
const reminderLogger = require('./src/reminders');

const bot = createBot({ config: prices, ordersStore });

startServer({
    port: PORT,
    getSystemStatus: bot.getSystemStatus,
    whatsappClient: bot.client,
    publicDir: path.join(__dirname, 'public'),
    ordersStore
});

startReminderScheduler({
    ordersStore,
    whatsappClient: bot.client,
    reminderLogger,
    getSystemStatus: bot.getSystemStatus
});
