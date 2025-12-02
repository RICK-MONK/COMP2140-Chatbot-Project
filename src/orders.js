/**
 * File: src/orders.js
 * Software Engineering Project (COMP2140)
 * Student: Patrick Marsden (620169874)
 */

const fs = require('fs');
const path = require('path');

const ordersFile = path.join(__dirname, '../orders.json');

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
        orders[index] = { ...orders[index], ...updates };
        fs.writeFileSync(ordersFile, JSON.stringify(orders, null, 2));
        return true;
    }
    return false;
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
