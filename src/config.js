try {
    require('dotenv').config();
} catch (e) {
    console.warn('dotenv not found; skipping .env load');
}
const path = require('path');
const prices = require('../prices.json');

const PORT = process.env.PORT || 3000;
const ORDERS_FILE = path.join(__dirname, '..', 'orders.json');

module.exports = {
    PORT,
    ORDERS_FILE,
    prices
};
