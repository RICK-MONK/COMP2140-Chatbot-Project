function toPhone(userId) {
    return (userId || '').split('@')[0].replace(/\D/g, '');
}

function createOrderId(existingIds = []) {
    const existing = new Set((existingIds || []).map(id => String(id)));
    for (let i = 0; i < 5; i++) {
        const id = (Date.now() % 1_000_0000).toString().padStart(7, '0'); // up to 7 digits
        if (!existing.has(id)) return id;
    }
    return Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
}

function calculateCartTotals(cart) {
    return (cart || []).reduce((acc, item) => {
        const base = Number(item.priceBreakdown?.base || 0);
        const install = Number(item.priceBreakdown?.install || 0);
        const subtotal = item.priceBreakdown?.subtotal !== undefined
            ? Number(item.priceBreakdown.subtotal)
            : base + install;
        const gct = item.priceBreakdown?.gct !== undefined
            ? Number(item.priceBreakdown.gct)
            : subtotal * 0.15;
        const total = item.price !== undefined ? Number(item.price) : subtotal + gct;

        acc.base += base;
        acc.install += install;
        acc.subtotal += subtotal;
        acc.gct += gct;
        acc.total += total;
        return acc;
    }, { base: 0, install: 0, subtotal: 0, gct: 0, total: 0 });
}

function buildOrderFromCart({ cart, email, displayName, phone, fulfillment, includeStatus = true, existingIds = [] }) {
    if (!cart || !cart.length) return null;
    const totals = calculateCartTotals(cart);
    const items = cart.map(item => ({
        width: item.width,
        height: item.height,
        quantity: item.quantity || 1,
        product: item.product,
        description: item.description,
        priceBreakdown: item.priceBreakdown
    }));
    const details = items.map(i => {
        if (i.description) return `${i.product}`;
        return `${i.width}" x ${i.height}" (${i.product})`;
    }).join(' | ');

    return {
        id: createOrderId(existingIds),
        date: new Date().toLocaleDateString(),
        name: displayName || "Customer",
        phone,
        items,
        details,
        price: totals.total.toFixed(2),
        email: email || 'N/A',
        fulfillment: fulfillment || 'N/A',
        priceBreakdown: {
            base: totals.base,
            install: totals.install,
            subtotal: totals.subtotal,
            gct: totals.gct
        },
        status: includeStatus ? 'PENDING DELIVERY' : undefined
    };
}

function createSupplyQuote({ item, purchaseType, quantity, existingEmail, existingFulfillment }) {
    const pricePer = purchaseType === 'case' ? item.casePrice : item.unitPrice;
    if (pricePer === null || pricePer === undefined) return null;
    const qty = Number(quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) return null;
    const base = pricePer * qty;
    const install = 0;
    const subtotal = base;
    const gct = +(subtotal * 0.15).toFixed(2);
    const total = subtotal + gct;
    const label = `${qty} x ${item.name} (${purchaseType === 'case' ? 'Case' : 'Unit'}${item.unitSize ? `, ${item.unitSize}` : ''})`;

    return {
        width: 0,
        height: 0,
        quantity: qty,
        product: label,
        description: item.categoryLabel ? `${item.categoryLabel} supply` : 'Cleaning Supply',
        price: total.toFixed(2),
        email: existingEmail || null,
        fulfillment: existingFulfillment || null,
        priceBreakdown: {
            base,
            install,
            subtotal,
            gct
        }
    };
}

module.exports = {
    toPhone,
    createOrderId,
    calculateCartTotals,
    buildOrderFromCart,
    createSupplyQuote
};
