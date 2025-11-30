/**
 * Software Engineering Project (COMP2140)
 * Student: Patrick Marsden (620169874)
 * Feature: Categories, Email, Delivery/Pickup, Confirmation
 */

const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcodeTerminal = require('qrcode-terminal'); 
const QRCode = require('qrcode'); 
const express = require('express');
const fs = require('fs');
const cors = require('cors');

// --- CONFIGURATION ---
const config = require('./prices.json'); 
const ordersFile = './orders.json';
const PORT = 3000;

// --- STATE VARIABLES ---
let qrCodeDataUrl = null; 
let isClientReady = false; 

// --- 1. DASHBOARD SERVER ---
const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static('public'));

app.get('/api/orders', (req, res) => {
    if (fs.existsSync(ordersFile)) res.json(JSON.parse(fs.readFileSync(ordersFile)));
    else res.json([]);
});

app.get('/api/status', (req, res) => {
    res.json({ ready: isClientReady, qr: qrCodeDataUrl });
});

app.listen(PORT, () => {
    console.log(`✅ Admin Dashboard running at http://localhost:${PORT}/dashboard.html`);
});

// --- 2. LOGIC HELPERS ---
function calculatePrice(productKey, userWidth, userHeight) {
    const product = config.products[productKey];
    if (!product) return null;
    
    let widthIndex = product.widths.findIndex(w => w >= userWidth);
    if (widthIndex === -1) return null; 

    let heightIndex = product.heights.findIndex(h => h >= userHeight);
    if (heightIndex === -1) return null; 

    if (!product.grid[heightIndex] || !product.grid[heightIndex][widthIndex]) return null; 

    const price = product.grid[heightIndex][widthIndex];
    
    return {
        price: price,
        matchedWidth: product.widths[widthIndex],
        matchedHeight: product.heights[heightIndex],
        name: product.name
    };
}

function saveOrder(order) {
    let orders = [];
    if (fs.existsSync(ordersFile)) {
        try { orders = JSON.parse(fs.readFileSync(ordersFile)); } catch (e) {}
    }
    orders.unshift(order);
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
}

function getOrdersForUser(phoneNumber) {
    if (fs.existsSync(ordersFile)) {
        try { 
            const orders = JSON.parse(fs.readFileSync(ordersFile));
            return orders.filter(o => o.phone === phoneNumber);
        } catch (e) { return []; }
    }
    return [];
}

// --- 3. WHATSAPP BOT ---
const client = new Client({ authStrategy: new LocalAuth() });
const userState = {};
const userData = {};

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
    const pushname = msg._data.notifyName || "Guest";

    // MENU
    if (text === 'hi' || text === 'hello' || text === 'menu') {
        userState[userId] = null;
        await client.sendMessage(userId, `👋 Welcome to White Rose Interiors!`);
        const poll = new Poll('How can we help you today?', [
            'Goods/Services', 
            'Get Order Status', 
            'Contact Support',
            'FAQ'
        ]);
        await client.sendMessage(userId, poll);
    }

    // CALCULATOR - WIDTH
    else if (userState[userId] === 'waiting_for_width') {
        const width = parseFloat(text);
        if (isNaN(width)) return client.sendMessage(userId, '⚠️ Enter a valid number.');
        
        if (!userData[userId]) userData[userId] = {};
        userData[userId].width = width;
        
        userState[userId] = 'waiting_for_height';
        await client.sendMessage(userId, 'Enter Height (inches):');
    }

    // CALCULATOR - HEIGHT & PRICE LOOKUP
    else if (userState[userId] === 'waiting_for_height') {
        const height = parseFloat(text);
        if (isNaN(height)) return client.sendMessage(userId, '⚠️ Enter a valid number.');
        
        const width = userData[userId].width;
        const productKey = userData[userId].selectedProduct || 'illusion_cat3'; 
        
        const result = calculatePrice(productKey, width, height);

        if (!result) {
            await client.sendMessage(userId, '⚠️ Size not available in standard list. Contacting support...');
            userState[userId] = null;
            return;
        }

        // Pricing Calculation
        const subtotal = result.price + config.installation_fee;
        const gct = subtotal * 0.15;
        const finalPrice = subtotal + gct;
        
        userData[userId].lastQuote = { 
            width: width, 
            height: height, 
            price: finalPrice.toFixed(2),
            product: result.name,
            email: null,
            fulfillment: null // Placeholder
        };

        const receipt = `
╔════════════════════╗
║  OFFICIAL ESTIMATE ║
╠════════════════════╣
║ Item   : ${result.name}
║ Size   : ${width}" x ${height}"
║ Base   : $${result.price.toLocaleString()}
║ Install: $${config.installation_fee.toLocaleString()}
║ Subtot : $${subtotal.toLocaleString()}
║ GCT 15%: $${gct.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
╟────────────────────╢
║ TOTAL  : $${finalPrice.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})} 
╚════════════════════╝
`;
        await client.sendMessage(userId, '✅ *Estimate Generated:*');
        await client.sendMessage(userId, '```' + receipt + '```'); 
        
        // Step 1: Ask for Email
        userState[userId] = 'waiting_for_email_decision';
        const poll = new Poll('Would you like a copy emailed to you?', ['Yes, email me', 'No, thanks']);
        await client.sendMessage(userId, poll);
    }

    // CAPTURE EMAIL ADDRESS
    else if (userState[userId] === 'typing_email') {
        if (text.includes('@')) {
            userData[userId].lastQuote.email = text; 
            await client.sendMessage(userId, '📧 Email saved!');
            
            // Step 2: Ask for Delivery/Pickup
            userState[userId] = 'waiting_for_fulfillment';
            const poll = new Poll('How would you like to receive this?', ['Delivery (3-4 Days)', 'Pickup']);
            await client.sendMessage(userId, poll);
        } else {
            await client.sendMessage(userId, '⚠️ Please enter a valid email address.');
        }
    }
});

// EVENT: Poll Interaction
client.on('vote_update', async (vote) => {
    if (vote.selectedOptions.length > 0) {
        const userId = vote.voter;
        const option = vote.selectedOptions[0].name;
        
        // --- LEVEL 1: MAIN MENU ---
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
            const myOrders = getOrdersForUser(phone);
            if (myOrders.length > 0) {
                let msg = "📋 *YOUR ORDERS:*\n";
                myOrders.forEach(o => msg += `\n📦 #${o.id} - ${o.status}`);
                await client.sendMessage(userId, msg);
            } else {
                await client.sendMessage(userId, '🔍 No pending orders found.');
            }
        }
        else if (option === 'FAQ') {
            // Updated FAQ Info
            await client.sendMessage(userId, `❓ *FAQ*\n\n🕒 *Hours:* Mon-Fri 8:30 AM - 4:30 PM\n🚚 *Delivery:* 3-4 Business Days\n📍 *Loc:* 30-32 Red Hills Road`);
        }

        // --- LEVEL 2: GOODS ---
        else if (option === 'Blinds') {
            const blindPoll = new Poll('Which type of blinds?', ['Illusion / Roller', 'Woodlook', 'PVC', 'Screen 5%']);
            await client.sendMessage(userId, blindPoll);
        }
        else if (option === 'Cleaning' || option === 'Supplies') {
            await client.sendMessage(userId, 'Please leave a message describing what you need.');
        }

        // --- LEVEL 3: BLIND TYPES ---
        else if (option === 'Illusion / Roller') {
            userData[userId] = { selectedProduct: 'illusion_cat3' };
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, 'Enter Width (inches):');
        }
        else if (option === 'Woodlook') {
            userData[userId] = { selectedProduct: 'woodlook_cat1' };
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, 'Enter Width (inches):');
        }
        else if (option === 'PVC') {
            userData[userId] = { selectedProduct: 'pvc_2inch' };
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, 'Enter Width (inches):');
        }
        else if (option === 'Screen 5%') {
            userData[userId] = { selectedProduct: 'screen_5pct' };
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, 'Enter Width (inches):');
        }

        // --- LEVEL 4: EMAIL DECISION ---
        else if (option === 'Yes, email me') {
            userState[userId] = 'typing_email';
            await client.sendMessage(userId, 'Please type your email address:');
        }
        else if (option === 'No, thanks') {
            // Skip email, go to Delivery/Pickup
            userState[userId] = 'waiting_for_fulfillment';
            const poll = new Poll('How would you like to receive this?', ['Delivery (3-4 Days)', 'Pickup']);
            await client.sendMessage(userId, poll);
        }

        // --- LEVEL 5: FULFILLMENT DECISION (New Step) ---
        else if (option === 'Delivery (3-4 Days)' || option === 'Pickup') {
            // Save their choice
            if (userData[userId] && userData[userId].lastQuote) {
                userData[userId].lastQuote.fulfillment = option;
            }
            
            // Go to Final Confirmation
            userState[userId] = 'waiting_for_final_confirm';
            const poll = new Poll(`Method: ${option}. Place order?`, ['Confirm Order', 'Cancel']);
            await client.sendMessage(userId, poll);
        }

        // --- LEVEL 6: FINAL CONFIRMATION ---
        else if (option === 'Confirm Order') {
            const quote = userData[userId].lastQuote;
            const newOrder = {
                id: Math.floor(Math.random() * 9000) + 1000, 
                date: new Date().toLocaleDateString(),
                name: "Customer", 
                phone: userId.replace('@c.us', ''),
                details: `${quote.width}" x ${quote.height}" (${quote.product})`,
                price: quote.price,
                email: quote.email || "N/A",
                fulfillment: quote.fulfillment, // Saved here
                status: 'PENDING DELIVERY'
            };
            saveOrder(newOrder);
            await client.sendMessage(userId, `✅ *Order #${newOrder.id} Placed!*`);
            userData[userId] = null;
            userState[userId] = null;
        }
        else if (option === 'Cancel') {
            await client.sendMessage(userId, '❌ Order cancelled. Type "Hi" to start over.');
            userData[userId] = null;
            userState[userId] = null;
        }
    }
});

client.initialize();