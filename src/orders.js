/**
 * File: src/orders.js
 * Software Engineering Project (COMP2140)
 * Student: Patrick Marsden (620169874)
 */

const fs = require('fs');
const path = require('path');

const ordersFile = path.join(__dirname, '../orders.json');

function normalizeDate(input) {
    if (!input) return null;
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
}

function normalizeDateTime(input) {
    if (!input) return null;
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

// --- READ ---
function getAllOrders() {
    if (fs.existsSync(ordersFile)) {
        try { return JSON.parse(fs.readFileSync(ordersFile)); } 
        catch (e) { return []; }
    }
    return [];
}

function getOrdersForUser(phoneNumber) {
    const orders = getAllOrders();
    return orders.filter(o => o.phone === phoneNumber);
}

function getOrderById(id) {
    const orders = getAllOrders();
    // Loose equality (==) allows string "1234" to match number 1234
    return orders.find(o => o.id == id);
}

// --- CREATE ---
function saveOrder(order) {
    const orders = getAllOrders();
    orders.unshift(order);
    fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
}

// --- UPDATE ---
function updateOrder(id, updates) {
    const orders = getAllOrders();
    const index = orders.findIndex(o => o.id == id);
    
    if (index !== -1) {
        const existing = orders[index];
        const normalizedUpdates = { ...updates };
        if (updates.scheduledDate) {
            const isoDate = normalizeDate(updates.scheduledDate);
            if (isoDate) normalizedUpdates.scheduledDate = isoDate;
        }
        if (updates.reminderTime) {
            const isoDateTime = normalizeDateTime(updates.reminderTime);
            if (isoDateTime) {
                normalizedUpdates.reminderTime = isoDateTime;
                normalizedUpdates.reminderSent = false;
                normalizedUpdates.reminderSentAt = null;
            }
        }

        orders[index] = { ...existing, ...normalizedUpdates };
        fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
        return { 
            success: true, 
            id: existing.id, 
            phone: existing.phone, 
            oldStatus: existing.status || null,
            order: orders[index]
        };
    }
    return { success: false };
}

// --- DELETE ---
function deleteOrder(id) {
    let orders = getAllOrders();
    const initialLength = orders.length;
    orders = orders.filter(o => o.id != id);
    
    if (orders.length !== initialLength) {
        fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
        return true;
    }
    return false;
}

function clearAllOrders() {
    fs.writeFileSync(ordersFile, JSON.stringify([], null, 2));
}

module.exports = { 
    saveOrder, 
    getOrdersForUser, 
    getOrderById,
    getAllOrders, 
    updateOrder, 
    deleteOrder, 
    clearAllOrders 
};
