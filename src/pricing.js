/**
 * File: src/pricing.js
 * Software Engineering Project (COMP2140)
 * Student: Patrick Marsden (620169874)
 */

const config = require('../prices.json');

/**
 * Calculates price based on product type (Grid vs Simple)
 */
function calculatePrice(productKey, width, height, quantity = 1) {
    const product = config.products[productKey];
    
    // 1. Safety Checks
    if (!product) return { error: "Product not found." };
    if (!product.available) return { error: "⚠️ Item currently unavailable." };

    // --- CASE A: SIMPLE ITEMS (Cleaning, Supplies) ---
    if (product.type === 'simple') {
        const total = product.price * quantity;
        return {
            price: total,
            name: product.name,
            details: `${quantity} x ${product.name}`,
            installFee: 0 // No install fee for supplies/cleaning usually
        };
    }

    // --- CASE B: GRID ITEMS (Blinds) ---
    if (product.type === 'grid') {
        // Round UP to the next available Width
        let widthIndex = product.widths.findIndex(w => w >= width);
        if (widthIndex === -1) return { error: "Width too large for catalog." };

        // Round UP to the next available Height
        let heightIndex = product.heights.findIndex(h => h >= height);
        if (heightIndex === -1) return { error: "Height too large for catalog." };

        // Grid Lookup
        if (!product.grid[heightIndex] || !product.grid[heightIndex][widthIndex]) {
            return { error: "Size combination not available." };
        }

        const price = product.grid[heightIndex][widthIndex];
        
        return {
            price: price,
            matchedWidth: product.widths[widthIndex],
            matchedHeight: product.heights[heightIndex],
            name: product.name,
            details: `${width}" x ${height}" (${product.name})`,
            installFee: config.installation_fee
        };
    }
}

module.exports = { calculatePrice };