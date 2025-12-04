const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { sendInvoiceEmail } = require('./email');
const { generateInvoicePDF } = require('./invoice');

const AUTH_TOKEN = 'secure-session-token';

function startServer({ port, getSystemStatus, whatsappClient, publicDir, ordersStore }) {
    const staticDir = publicDir || path.join(__dirname, '..', 'public');
    const app = express();
    app.use(express.json());
    app.use(cors());
    app.use(express.static(staticDir));

    function requireAuth(req, res, next) {
        const token = req.headers['authorization']?.replace('Bearer ', '') || req.headers['x-auth-token'];
        if (token === AUTH_TOKEN) return next();
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    app.post('/api/login', (req, res) => {
        const { username, password } = req.body;
        if (username === 'admin' && password === 'admin123') {
            res.json({ success: true, token: AUTH_TOKEN });
        } else {
            res.status(401).json({ success: false, error: "Invalid username or password" });
        }
    });

    app.get('/api/orders', requireAuth, (req, res) => {
        try {
            res.json(ordersStore.getAllOrders());
        } catch (err) {
            console.error('Orders fetch error', err);
            res.status(500).json({ success: false, error: 'Failed to load orders' });
        }
    });

    app.get('/api/status', requireAuth, (req, res) => {
        try {
            res.json(getSystemStatus());
        } catch (err) {
            console.error('Status error', err);
            res.status(500).json({ success: false });
        }
    });

    app.put('/api/orders/:id', requireAuth, (req, res) => {
        try {
            const updates = req.body; 
            const result = ordersStore.updateOrder(req.params.id, updates);
            
            if (!result.success) return res.status(404).json({ success: false, error: 'Order not found' });

            if (whatsappClient) {
                const userId = `${result.phone}@c.us`;
                if (updates.status && updates.status !== result.oldStatus) {
                    const message = `Update on Order #${result.id}\n\nStatus changed to: ${updates.status}`;
                    whatsappClient.sendMessage(userId, message).catch(e => console.error("Notify Error", e));
                }
            }
            res.json({ success: true, order: result.order });
        } catch (err) {
            console.error('Update order error', err);
            res.status(500).json({ success: false, error: 'Update failed' });
        }
    });

    app.post('/api/notify/:id', requireAuth, (req, res) => {
        try {
            const order = ordersStore.getOrderById(req.params.id);
            if (order && whatsappClient) {
                const userId = `${order.phone}@c.us`;
                const message = `Order #${order.id} is READY.\nYour order is ready for ${order.fulfillment || 'pickup/delivery'}.`;
                whatsappClient.sendMessage(userId, message)
                    .then(() => res.json({ success: true }))
                    .catch(err => {
                        console.error('Notify send error', err);
                        res.status(500).json({ success: false, error: 'Send failed' });
                    });
            } else {
                res.status(404).json({ success: false });
            }
        } catch (err) {
            console.error('Notify error', err);
            res.status(500).json({ success: false, error: 'Notify failed' });
        }
    });

    app.delete('/api/orders/:id', requireAuth, (req, res) => {
        try {
            res.json({ success: ordersStore.deleteOrder(req.params.id) });
        } catch (err) {
            console.error('Delete error', err);
            res.status(500).json({ success: false, error: 'Delete failed' });
        }
    });
    app.delete('/api/orders', requireAuth, (req, res) => {
        try {
            ordersStore.clearAllOrders();
            res.json({ success: true });
        } catch (err) {
            console.error('Clear error', err);
            res.status(500).json({ success: false, error: 'Clear failed' });
        }
    });

    app.get(['/dashboard', '/dashboard.html'], (req, res) => {
        res.sendFile(path.join(staticDir, 'dashboard.html'));
    });

    app.post('/api/send-invoice/:id', requireAuth, async (req, res) => {
        const order = ordersStore.getOrderById(req.params.id);
        if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
        if (!order.email || order.email === 'N/A') {
            return res.status(400).json({ success: false, error: 'No email on order' });
        }

        try {
            const invoicesDir = path.join(staticDir, 'invoices');
            if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
            const fileName = `Invoice_${order.id}.pdf`;
            const pdfPath = path.join(invoicesDir, fileName);

            await generateInvoicePDF(order, fileName, "INVOICE");
            const success = await sendInvoiceEmail(order.email, order, pdfPath);
            res.json({ success });
        } catch (err) {
            console.error('Send invoice error', err);
            res.status(500).json({ success: false, error: 'Email failed' });
        }
    });

    app.get('/api/report', requireAuth, (req, res) => {
        try {
            const orders = ordersStore.getAllOrders();
            const headers = ['id','date','name','phone','details','price','email','fulfillment','status'];
            const rows = orders.map(o => headers.map(h => (o[h] !== undefined ? String(o[h]).replace(/"/g,'""') : '')).join(','));
            const csv = [headers.join(','), ...rows].join('\n');
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="orders_report.csv"');
            res.send(csv);
        } catch (err) {
            console.error('Report error', err);
            res.status(500).json({ success: false, error: 'Report failed' });
        }
    });

    app.listen(port, () => {
        console.log(`Admin Dashboard running at http://localhost:${port}/dashboard.html`);
    });
}

module.exports = { startServer };
