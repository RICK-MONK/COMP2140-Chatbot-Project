const { Client, LocalAuth, Poll, MessageMedia } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const { generateInvoicePDF } = require('./invoice');
const { sendInvoiceEmail } = require('./email');
const path = require('path');
const fs = require('fs');
const { calculatePrice } = require('./pricing');

function createBot({ config, ordersStore }) {
    const client = new Client({ authStrategy: new LocalAuth() });
    const userState = {};
    const userData = {};
    let qrCodeDataUrl = null;
    let isClientReady = false;

    // Build product options and categories from config
    const productOptions = Object.entries(config.products)
        .filter(([, v]) => v.type === 'grid')
        .map(([key, v]) => ({ label: v.name, key }));

    const blindCategories = {
        illusion: ['illusion_cat3', 'illusion_cat2', 'woodlook_cat1'],
        horizontal: ['pvc_2inch', 'basswood', 'facade_2inch'],
        vertical: ['vertical_pvc'],
        'roller shades': [
            'roller_screen_1',
            'roller_screen_3',
            'roller_screen_5',
            'roller_screen_10',
            'roller_blackout_matte',
            'roller_blackout_midnight'
        ]
    };
    const blindCategoryLabels = ['Illusion', 'Horizontal', 'Vertical', 'Roller Shades'];

    function getCategoryProducts(label) {
        const ids = blindCategories[label.toLowerCase()] || [];
        return ids
            .map(key => ({
                key,
                label: (config.products[key] && config.products[key].name) || key
            }))
            .filter(p => config.products[p.key]);
    }

    function resetUser(userId) {
        userState[userId] = null;
        userData[userId] = {};
    }

    client.on('qr', (qr) => {
        qrcodeTerminal.generate(qr, { small: true });
        QRCode.toDataURL(qr, (err, url) => {
            if (!err) { qrCodeDataUrl = url; isClientReady = false; }
        });
    });

    client.on('ready', () => {
        console.log('>>> SYSTEM ONLINE <<<');
        isClientReady = true;
        qrCodeDataUrl = null;
    });

    client.on('message', async msg => {
        if(msg.from.includes('status')) return;

        const userId = msg.from;
        const text = msg.body.toLowerCase();
        const pushname = msg._data.notifyName || "Customer";
        if (!userData[userId]) userData[userId] = {};
        userData[userId].displayName = pushname;

        const greetings = ['hi','hello','hey','heyy','good morning','good afternoon','good evening',"what's up",'whats up','sup','yo','menu'];
        if (greetings.some(g => text.startsWith(g))) {
            resetUser(userId);
            await client.sendMessage(userId, `👋 Welcome to White Rose Interiors!`);
            const poll = new Poll('How can we help you today?', [
                'Goods/Services',
                'Get Order Status',
                'Contact Support',
                'FAQ'
            ]);
            await client.sendMessage(userId, poll);
            return;
        }

        // Width prompt
        if (userState[userId] === 'waiting_for_width') {
            const width = parseFloat(text);
            if (isNaN(width)) return client.sendMessage(userId, '⚠️ Enter a valid number.');
            userData[userId].width = width;
            userState[userId] = 'waiting_for_height';
            await client.sendMessage(userId, 'Enter Height (inches):');
            return;
        }

        // Height + pricing
        if (userState[userId] === 'waiting_for_height') {
            const height = parseFloat(text);
            if (isNaN(height)) return client.sendMessage(userId, '⚠️ Enter a valid number.');

            const width = userData[userId].width;
            const productKey = userData[userId].selectedProduct || 'illusion_cat3';
            const result = calculatePrice(productKey, width, height);
            if (!result || result.error || result.price === undefined || result.price === null) {
                await client.sendMessage(userId, '⚠️ Size not available in standard list. Contacting support...');
                userState[userId] = null;
                return;
            }

            const subtotal = result.price + config.installation_fee;
            const gct = subtotal * 0.15;
            const finalPrice = subtotal + gct;

            if (!userData[userId].cart) userData[userId].cart = [];
            const quote = {
                width,
                height,
                price: finalPrice.toFixed(2),
                product: result.name,
                email: null,
                fulfillment: null,
                priceBreakdown: {
                    base: result.price,
                    install: config.installation_fee,
                    subtotal,
                    gct
                }
            };
            userData[userId].lastQuote = quote;
            userData[userId].cart.push(quote);

            const receipt = `
╔══════════════════════╗
║  OFFICIAL ESTIMATE   ║
╠══════════════════════╣
║ Item   : ${result.name}
║ Size   : ${width}" x ${height}"
║ Base   : $${result.price.toLocaleString()}
║ Install: $${config.installation_fee.toLocaleString()}
║ Subtot : $${subtotal.toLocaleString()}
║ GCT 15%: $${gct.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
╠──────────────────────╣
║ TOTAL  : $${finalPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} 
╚══════════════════════╝
`;
            await client.sendMessage(userId, '✅ *Estimate Generated:*');
            await client.sendMessage(userId, '```' + receipt + '```');

            userState[userId] = 'quote_next_step';
            const poll = new Poll('Add another item or finish?', ['Add another blind', 'Finish & get PDF']);
            await client.sendMessage(userId, poll);
            return;
        }

        // Email capture (manual typing path)
        if (userState[userId] === 'typing_email') {
        if (text.includes('@')) {
            userData[userId].lastQuote.email = text;
            await client.sendMessage(userId, '📧 Email saved!');

            // Try to send the current estimate PDF immediately
            try {
                const cart = userData[userId]?.cart || [];
                const quote = userData[userId]?.lastQuote;
                if (quote && cart.length > 0) {
                    const total = cart.reduce((sum, item) => sum + parseFloat(item.price || 0), 0);
                    const order = {
                        id: Math.floor(Math.random() * 9000) + 1000,
                        date: new Date().toLocaleDateString(),
                        name: userData[userId]?.displayName || "Customer",
                        phone: userId.replace('@c.us', ''),
                        width: cart[0].width,
                        height: cart[0].height,
                        product: cart[0].product,
                        price: total.toFixed(2),
                        email: quote.email,
                        priceBreakdown: cart[0].priceBreakdown || {}
                    };
                    const invoicesDir = path.join(__dirname, '..', 'public', 'invoices');
                    if (!fs.existsSync(invoicesDir)) fs.mkdirSync(invoicesDir, { recursive: true });
                    const fileName = `Estimate_${order.id}.pdf`;
                    const pdfPath = path.join(invoicesDir, fileName);
                    await generateInvoicePDF(order, fileName, "ESTIMATE");
                    const mailed = await sendInvoiceEmail(order.email, order, pdfPath);
                    if (mailed) {
                        await client.sendMessage(userId, '✅ Estimate emailed to you.');
                    } else {
                        await client.sendMessage(userId, '❌ Could not send email right now.');
                    }
                }
            } catch (err) {
                console.error('Immediate email send error', err);
                await client.sendMessage(userId, '❌ Could not send email right now.');
            }
            userState[userId] = 'waiting_for_fulfillment';
            const poll = new Poll('How would you like to receive this?', ['Delivery (3-4 Days)', 'Pickup']);
            await client.sendMessage(userId, poll);
        } else {
            await client.sendMessage(userId, '⚠️ Please enter a valid email address.');
            }
            return;
        }
    });

    client.on('vote_update', async (vote) => {
        if (vote.selectedOptions.length === 0) return;
        const userId = vote.voter;
        const option = vote.selectedOptions[0].name;
        const optLower = option.toLowerCase();
        const displayName = userData[userId]?.displayName || "Customer";

        // LEVEL 1
        if (option === 'Goods/Services') {
            const subPoll = new Poll('Select a Category:', ['Blinds', 'Cleaning', 'Supplies']);
            await client.sendMessage(userId, subPoll);
        }
        else if (option === 'Contact Support') {
            await client.sendMessage(userId, '👤 A Customer Rep has been pinged and will reply shortly.');
            await client.sendMessage(userId, `📞 Call us: ${config.company_phone}`);
        }
        else if (option === 'Get Order Status') {
            const phone = userId.replace('@c.us', '');
            const myOrders = ordersStore.getOrdersForUser(phone);
            if (myOrders.length > 0) {
                let msg = "📋 *YOUR ORDERS:*\n";
                myOrders.forEach(o => msg += `\n📦 #${o.id} - ${o.status}`);
                await client.sendMessage(userId, msg);
            } else {
                await client.sendMessage(userId, '🔍 No pending orders found.');
            }
        }
        else if (option === 'FAQ') {
            await client.sendMessage(userId, `❓ *FAQ*\n\n🕒 *Hours:* Mon-Fri 8:30 AM - 4:30 PM\n🚚 *Delivery:* 3-4 Business Days\n📍 *Loc:* 30-32 Red Hills Road`);
        }

        // LEVEL 2
        else if (option === 'Blinds') {
            const catPoll = new Poll('Choose a blinds family:', blindCategoryLabels);
            await client.sendMessage(userId, catPoll);
        }
        else if (option === 'Cleaning' || option === 'Supplies') {
            await client.sendMessage(userId, 'Please leave a message describing what you need.');
        }

        // LEVEL 3
        else if (blindCategoryLabels.map(l => l.toLowerCase()).includes(optLower)) {
            const prods = getCategoryProducts(option);
            const prodLabels = prods.map(p => p.label);
            const poll = new Poll('Select a product:', prodLabels);
            await client.sendMessage(userId, poll);
        }
        else if (productOptions.find(p => p.label.toLowerCase() === optLower)) {
            const chosen = productOptions.find(p => p.label.toLowerCase() === optLower);
            userData[userId] = { selectedProduct: chosen.key, displayName };
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, 'Enter Width (inches):');
        }
        else if (Object.entries(config.products).find(([k,v]) => v.name.toLowerCase() === optLower)) {
            const found = Object.entries(config.products).find(([k,v]) => v.name.toLowerCase() === optLower);
            userData[userId] = { selectedProduct: found[0], displayName };
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, 'Enter Width (inches):');
        }

        // EMAIL DECISION (legacy path)
        else if (option === 'Yes, email me') {
            userState[userId] = 'typing_email';
            await client.sendMessage(userId, 'Please type your email address:');
        }
        else if (option === 'No, thanks') {
            userState[userId] = 'waiting_for_fulfillment';
            const poll = new Poll('How would you like to receive this?', ['Delivery (3-4 Days)', 'Pickup']);
            await client.sendMessage(userId, poll);
        }

        // QUOTE NEXT STEP
        else if (option === 'Add another blind') {
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, 'Enter Width (inches):');
        }
        else if (option === 'Finish & get PDF') {
            const cart = userData[userId]?.cart || [];
            if (cart.length === 0) {
                await client.sendMessage(userId, 'No items found. Start by selecting a product.');
                userState[userId] = null;
                return;
            }

            const total = cart.reduce((sum, item) => sum + parseFloat(item.price || 0), 0);
            const email = userData[userId]?.lastQuote?.email || 'N/A';
            const order = {
                id: Math.floor(Math.random() * 9000) + 1000,
                date: new Date().toLocaleDateString(),
                name: displayName,
                phone: userId.replace('@c.us', ''),
                width: cart[0].width,
                height: cart[0].height,
                product: cart[0].product,
                price: total.toFixed(2),
                email,
                priceBreakdown: cart[0].priceBreakdown || {}
            };

            await client.sendMessage(userId, `✅ Estimate complete. Total: $${order.price}`);

            try {
                const fileName = `Estimate_${order.id}.pdf`;
                const pdfPath = await generateInvoicePDF(order, fileName, "ESTIMATE");
                const media = MessageMedia.fromFilePath(pdfPath);
                await client.sendMessage(userId, media);
            } catch (err) {
                console.error('PDF send error', err);
                await client.sendMessage(userId, 'Could not send PDF at this time.');
            }

            userState[userId] = 'final_confirm';
            const confirmPoll = new Poll('Send email or confirm order?', ['Send email', 'Confirm Order', 'Cancel']);
            await client.sendMessage(userId, confirmPoll);
        }

        // FULFILLMENT DECISION
        else if (option === 'Delivery (3-4 Days)' || option === 'Pickup') {
            if (userData[userId] && userData[userId].lastQuote) {
                userData[userId].lastQuote.fulfillment = option;
            }
            userState[userId] = 'waiting_for_final_confirm';
            const poll = new Poll(`Method: ${option}. Place order?`, ['Confirm Order', 'Cancel']);
            await client.sendMessage(userId, poll);
        }

        // FINAL CONFIRM / EMAIL AFTER PDF
        else if (userState[userId] === 'final_confirm') {
            if (option === 'Send email') {
                userState[userId] = 'typing_email';
                await client.sendMessage(userId, 'Please type your email address:');
            } else if (option === 'Confirm Order') {
                const quote = userData[userId]?.lastQuote;
                const cart = userData[userId]?.cart || [];
                if (!quote || cart.length === 0) {
                    await client.sendMessage(userId, 'No order to confirm. Please start over.');
                    resetUser(userId);
                    return;
                }
                const total = cart.reduce((sum, item) => sum + parseFloat(item.price || 0), 0);
                const newOrder = {
                    id: Math.floor(Math.random() * 9000) + 1000,
                    date: new Date().toLocaleDateString(),
                    name: displayName,
                    phone: userId.replace('@c.us', ''),
                    details: `${quote.width}" x ${quote.height}" (${quote.product})`,
                    price: total.toFixed(2),
                    email: quote.email || "N/A",
                    fulfillment: quote.fulfillment || 'N/A',
                    status: 'PENDING DELIVERY'
                };
                ordersStore.saveOrder(newOrder);
                await client.sendMessage(userId, `✅ Order #${newOrder.id} placed!`);
                resetUser(userId);
            } else if (option === 'Cancel') {
                await client.sendMessage(userId, '❌ Cancelled. Type "Hi" to start over.');
                resetUser(userId);
            }
        }

        // LEGACY FINAL CONFIRM (before PDF flow)
        else if (option === 'Confirm Order') {
            const quote = userData[userId]?.lastQuote;
            if (!quote) {
                await client.sendMessage(userId, 'Please generate a quote first (select a product and enter size).');
                resetUser(userId);
                return;
            }
            const newOrder = {
                id: Math.floor(Math.random() * 9000) + 1000,
                date: new Date().toLocaleDateString(),
                name: "Customer",
                phone: userId.replace('@c.us', ''),
                details: `${quote.width}" x ${quote.height}" (${quote.product})`,
                price: quote.price,
                email: quote.email || "N/A",
                fulfillment: quote.fulfillment,
                status: 'PENDING DELIVERY'
            };
            ordersStore.saveOrder(newOrder);
            await client.sendMessage(userId, `✅ *Order #${newOrder.id} Placed!*`);
            resetUser(userId);
        }
        else if (option === 'Cancel') {
            await client.sendMessage(userId, '❌ Order cancelled. Type "Hi" to start over.');
            resetUser(userId);
        }
    });

    client.initialize();

    const getSystemStatus = () => ({ ready: isClientReady, qr: qrCodeDataUrl });

    return { client, getSystemStatus };
}

module.exports = { createBot };
