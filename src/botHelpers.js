function normalizeDate(input) {
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().split('T')[0];
}

function isValidTime(input) {
    if (!input) return false;
    const trimmed = input.trim();
    return /^([01]?\d|2[0-3]):[0-5]\d(\s?(AM|PM|am|pm))?$/.test(trimmed);
}

function buildCatalog(config) {
    const productOptions = Object.entries(config.products)
        .filter(([, v]) => v.type === 'grid')
        .map(([key, v]) => ({ label: v.name, key }));

    const blindCategories = {
        illusion: ['illusion_cat3', 'illusion_cat2', 'woodlook_cat1'],
        horizontal: ['pvc_2inch', 'basswood', 'facade_2inch'],
        'roller shades': [
            'roller_screen_1',
            'roller_screen_3',
            'roller_screen_5',
            'roller_screen_10',
            'roller_blackout_matte',
            'roller_blackout_midnight'
        ],
        vertical: ['vertical_pvc', 'fabric_sophia', 'fabric_venice']
    };
    const blindCategoryLabels = ['Illusion', 'Horizontal', 'Roller Shades', 'Vertical'];

    function getCategoryProducts(label) {
        const ids = blindCategories[label.toLowerCase()] || [];
        return ids
            .map(key => ({
                key,
                label: (config.products[key] && config.products[key].name) || key
            }))
            .filter(p => config.products[p.key]);
    }

    return { productOptions, blindCategories, blindCategoryLabels, getCategoryProducts };
}

function makeOrderHelpers({ ordersStore, client }) {
    async function sendOrderStatusList(userId) {
        const phone = userId.replace('@c.us', '');
        const myOrders = ordersStore.getOrdersForUser(phone);
        if (myOrders.length > 0) {
            let msg = "*YOUR ORDERS:*\n";
            myOrders.forEach(o => { msg += `\n#${o.id} - ${o.status}`; });
            await client.sendMessage(userId, msg);
        } else {
            await client.sendMessage(userId, 'No pending orders found.');
        }
    }

    function buildManageOrderPoll(userId) {
        const phone = userId.replace('@c.us', '');
        const upcoming = ordersStore
            .getOrdersForUser(phone)
            .filter(o => !['CANCELLED', 'DELIVERED', 'PICKED UP'].includes((o.status || '').toUpperCase()))
            .slice(0, 10); // cap options
        if (!upcoming.length) return null;
        const options = upcoming.map(o => {
            const when = [o.scheduledDate, o.scheduleTime].filter(Boolean).join(' ');
            return `#${o.id} - ${when || 'No date set'} - ${o.status || 'Pending'}`;
        });
        return { options, orders: upcoming };
    }

    return { sendOrderStatusList, buildManageOrderPoll };
}

module.exports = { normalizeDate, isValidTime, buildCatalog, makeOrderHelpers };
