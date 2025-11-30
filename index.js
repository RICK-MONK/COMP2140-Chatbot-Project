/**
 * Software Engineering Project (COMP2140)
 * Group: Group 1
 * * Student Name: Patrick Marsden
 * Student ID:   620169874
 * * Description:
 * WhatsApp Chatbot for White Rose Interiors using whatsapp-web.js.
 * Features: GUI-like Menu, Polling, Price Calculator, and Location services.
 */

const { Client, LocalAuth, Poll } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
    authStrategy: new LocalAuth()
});

const userState = {};
const userData = {};

client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan the QR code above.');
});

client.on('ready', () => {
    console.log('Client is ready! (Poll Mode Active)');
});

// 1. LISTENER FOR TEXT MESSAGES
client.on('message', async msg => {
    if(msg.from.includes('status')) return;

    const userId = msg.from;
    const text = msg.body.toLowerCase();
    const pushname = msg._data.notifyName || "Guest";

    // --- SCENARIO A: MAIN MENU (SENDING A POLL) ---
    if (text === 'hi' || text === 'hello' || text === 'menu') {
        userState[userId] = null; // Reset state

        // Create the Poll
        // The first argument is the Question, the second is the list of Options
        const poll = new Poll('👋 Welcome to White Rose Interiors! How can we help?', [
            'Get Blind Quote',
            'Check Status',
            'Contact Support'
        ]);

        await client.sendMessage(userId, poll);
    }

    // --- SCENARIO C: CALCULATOR LOGIC (Text input for numbers) ---
    // (We still need text listeners for the width/height numbers)
    
    else if (userState[userId] === 'waiting_for_width') {
        const width = parseFloat(text);
        if (isNaN(width)) {
            await client.sendMessage(userId, '⚠️ Please enter a valid number for width.');
            return;
        }
        if (!userData[userId]) userData[userId] = {};
        userData[userId].width = width;

        userState[userId] = 'waiting_for_height';
        await client.sendMessage(userId, 'Got it. Now enter the *HEIGHT* in inches.');
    }

    else if (userState[userId] === 'waiting_for_height') {
        const height = parseFloat(text);
        if (isNaN(height)) {
            await client.sendMessage(userId, '⚠️ Please enter a valid number for height.');
            return;
        }
        
        const width = userData[userId].width;
        const sqFt = (width * height) / 144;
        const total = (sqFt * 1200).toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');

        await client.sendMessage(userId, `✅ *ESTIMATE READY*\n\nSize: ${width}" x ${height}"\nPrice: $${total} JMD\n\n(Type 'Hi' to start over)`);
        
        userState[userId] = null;
    }
});

// 2. LISTENER FOR POLL VOTES (TOUCH INTERACTION)
// This runs when someone clicks a poll option
client.on('vote_update', async (vote) => {
    // The 'vote' object contains data about who voted and what they clicked
    const userId = vote.voter; 
    
    // Check if the vote is valid and has an option selected
    if (vote.selectedOptions.length > 0) {
        const selectedOption = vote.selectedOptions[0].name;
        console.log(`User ${userId} voted for: ${selectedOption}`);

        // --- HANDLE POLL CLICKS ---
        
        if (selectedOption === 'Get Blind Quote') {
            userState[userId] = 'waiting_for_width';
            await client.sendMessage(userId, '🪟 *New Quote Request*\n\nPlease enter the *WIDTH* of the window in inches.');
        }

        else if (selectedOption === 'Check Status') {
            await client.sendMessage(userId, '🔍 Checking database...\n\nYou have no pending orders right now.');
        }

        else if (selectedOption === 'Contact Support') {
            await client.sendMessage(userId, '📞 You can contact us at 876-555-0199 (Mon-Fri, 8am-5pm).');
        }
    }
});

client.initialize();