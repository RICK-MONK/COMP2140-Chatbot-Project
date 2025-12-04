/**
 * File: public/js/script.js
 * Description: Frontend Logic for Admin Dashboard
 * Student: Patrick Marsden (620169874)
 */

let allOrders = []; 
let salesChartInstance = null;
let pieChartInstance = null;
let authToken = localStorage.getItem('authToken');
let isEditingReminder = false;

// --- AUTH ---
async function attemptLogin(username, password) {
    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        if (res.ok) {
            const data = await res.json();
            authToken = data.token;
            localStorage.setItem('authToken', authToken);
            window.location.href = '/dashboard.html';
        } else {
            const errEl = document.getElementById('errorMsg');
            if (errEl) errEl.style.display = 'block';
            console.error('Login failed', await res.text());
        }
    } catch (e) {
        console.error('Login error', e);
        const errEl = document.getElementById('errorMsg');
        if (errEl) errEl.style.display = 'block';
    }
}

function logout() {
    authToken = null;
    localStorage.removeItem('authToken');
    window.location.href = '/login.html';
}

document.addEventListener('DOMContentLoaded', () => {
    // Simple client-side guard for dashboard pages
    if (!authToken && window.location.pathname.includes('dashboard')) {
        window.location.href = '/login.html';
    }
});

// --- NAVIGATION ---
function switchTab(tab) {
    ['dashboard', 'orders', 'connection'].forEach(t => {
        const view = document.getElementById('view-' + t);
        const nav = document.getElementById('nav-' + t);
        if (view) view.classList.add('d-none');
        if (nav) nav.classList.remove('active');
    });
    
    const activeView = document.getElementById('view-' + tab);
    const activeNav = document.getElementById('nav-' + tab);
    if (activeView) activeView.classList.remove('d-none');
    if (activeNav) activeNav.classList.add('active');
    
    if (tab === 'dashboard') renderCharts(); 
}

// --- DATA LOADING ---
function authHeaders() {
    return authToken ? { 'Authorization': `Bearer ${authToken}` } : {};
}

async function loadData() {
    if (isEditingReminder) return; // avoid closing picker while editing
    try {
        const res = await fetch('/api/orders', { headers: authHeaders() });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(`HTTP ${res.status}: ${txt}`);
        }
        allOrders = await res.json();
        
        // If on orders tab, render full table. If on dashboard, render charts.
        // For simplicity, we re-render table whenever data loads if table exists
        if (document.getElementById('tableBody')) {
            // Check if filters are active. If yes, re-run filter logic instead of raw render.
            const search = document.getElementById('searchBox').value;
            const status = document.getElementById('statusFilter').value;
            const date = document.getElementById('dateFilter').value;
            
            if (search || status !== 'ALL' || date) {
                filterOrders(); // Renders filtered data
            } else {
                renderTable(allOrders); // Renders all data
            }
        }
        
        updateStats(allOrders);
        const dashboardView = document.getElementById('view-dashboard');
        if (dashboardView && !dashboardView.classList.contains('d-none')) {
            renderCharts();
        }
    } catch (e) { 
        console.error("Load Error", e); 
        alert(`Failed to load orders. ${e.message || 'Please check connection and try again.'}`);
    }
}

// --- RENDER TABLE ---
function renderTable(orders) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center p-4">No orders found.</td></tr>';
        return;
    }

    orders.forEach(order => {
        const statusClass = `status-${(order.status || 'pending').toLowerCase().split(' ')[0]}`;
        const icon = (order.fulfillment || '').includes('Pickup') ? '<i class="fa-solid fa-shop"></i>' : '<i class="fa-solid fa-truck"></i>';
        const payDateInfo = order.scheduledPayDate ? `<div class="small text-danger">Pay: ${order.scheduledPayDate}</div>` : '';

        const row = `<tr>
            <td><span class="fw-bold text-primary">#${order.id}</span></td>
            <td>${order.date}</td>
            <td>
                <div class="fw-bold">${order.name || 'Guest'}</div>
                <div class="small text-muted">${order.phone}</div>
            </td>
            <td>${order.details}<br>${payDateInfo}</td>
            <td>
                <input type="date" class="date-input" value="${order.scheduledDate || ''}" onchange="updateDate('${order.id}', this)">
                ${order.scheduleTime ? `<div class="small text-primary">Time: ${order.scheduleTime}</div>` : ''}
                <div class="small text-muted mt-1">${icon} ${order.fulfillment || 'Delivery'}</div>
            </td>
            <td>
                <input type="datetime-local" class="form-control form-control-sm" value="${formatDateTimeLocal(order.reminderTime)}" onfocus="startReminderEdit()" onblur="endReminderEdit()" onchange="updateReminder('${order.id}', this.value)" />
                ${order.reminderSent ? `<div class="small text-success">Sent: ${formatDateTimeLocal(order.reminderSentAt) || 'Sent'}</div>` : '<div class="small text-muted">Pending</div>'}
            </td>
            <td class="fw-bold">$${order.price}</td>
            <td>
                <select class="status-select ${statusClass}" onchange="updateStatus('${order.id}', this)">
                    <option value="AWAITING DEPOSIT" ${order.status === 'AWAITING DEPOSIT' ? 'selected' : ''}>Awaiting Deposit</option>
                    <option value="DEPOSIT PAID" ${order.status === 'DEPOSIT PAID' ? 'selected' : ''}>Deposit Paid</option>
                    <option value="PENDING DELIVERY" ${order.status === 'PENDING DELIVERY' ? 'selected' : ''}>Pending Delivery</option>
                    <option value="IN PROGRESS" ${order.status === 'IN PROGRESS' ? 'selected' : ''}>In Progress</option>
                    <option value="READY" ${order.status === 'READY' ? 'selected' : ''}>Order Ready</option>
                    <option value="DELIVERED" ${order.status === 'DELIVERED' ? 'selected' : ''}>Delivered</option>
                    <option value="PICKED UP" ${order.status === 'PICKED UP' ? 'selected' : ''}>Picked Up</option>
                    <option value="CANCELLED" ${order.status === 'CANCELLED' ? 'selected' : ''}>Cancelled</option>
                </select>
            </td>
            <td>
                <button class="btn-icon text-success" title="Notify Ready" onclick="notifyReady('${order.id}')"><i class="fa-solid fa-bell"></i></button>
            </td>
            <td>
                <button class="btn-icon text-danger" title="Delete" onclick="deleteOrder('${order.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

// --- FILTERING ---
function filterOrders() {
    const searchText = document.getElementById('searchBox').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;
    const dateFilter = document.getElementById('dateFilter').value; 

    const filtered = allOrders.filter(order => {
        const matchesText = (order.id.toString().includes(searchText)) || 
                            (order.name && order.name.toLowerCase().includes(searchText));
        
        const matchesStatus = (statusFilter === 'ALL') || (order.status && order.status.includes(statusFilter));
        
        let matchesDate = true;
        if (dateFilter) {
             const d1 = new Date(order.date).toDateString();
             const d2 = new Date(dateFilter).toDateString();
             matchesDate = (d1 === d2);
        }

        return matchesText && matchesStatus && matchesDate;
    });

    renderTable(filtered);
}

// --- ANALYTICS ---
function updateStats(orders) {
    let revenue = 0, pending = 0, completed = 0, cancelled = 0;

    orders.forEach(o => {
        const price = parseFloat(o.price) || 0;
        if (!o.status.includes('CANCELLED')) revenue += price;
        
        if (o.status.includes('PENDING') || o.status.includes('AWAITING')) pending++;
        else if (o.status.includes('DELIVERED') || o.status.includes('PICKED') || o.status.includes('READY')) completed++;
        else if (o.status.includes('CANCELLED')) cancelled++;
    });

    if(document.getElementById('totalRevenue')) {
        document.getElementById('totalRevenue').innerText = '$' + revenue.toLocaleString(undefined, {minimumFractionDigits: 2});
        document.getElementById('pendingOrders').innerText = pending;
        document.getElementById('completedOrders').innerText = completed;
        document.getElementById('cancelledOrders').innerText = cancelled;
    }
}

function renderCharts() {
    const ctx1 = document.getElementById('salesTrendChart');
    const ctx2 = document.getElementById('productPieChart');
    
    if (!ctx1 || !ctx2) return;

    const productCounts = { 'Roller': 0, 'Woodlook': 0, 'PVC': 0, 'Vertical': 0 };
    
    allOrders.forEach(o => {
        if(o.details.includes('Roller')) productCounts['Roller']++;
        else if(o.details.includes('Woodlook')) productCounts['Woodlook']++;
        else if(o.details.includes('PVC')) productCounts['PVC']++;
        else productCounts['Vertical']++;
    });

    if (salesChartInstance) salesChartInstance.destroy();
    if (pieChartInstance) pieChartInstance.destroy();

    // Safely parse revenue
    let revText = document.getElementById('totalRevenue').innerText;
    let currentRev = parseFloat(revText.replace(/[$,]/g, '')) || 0;

    salesChartInstance = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Current'],
            datasets: [{
                label: 'Revenue ($)',
                data: [12000, 19000, 30000, 5000, 20000, currentRev],
                borderColor: '#4e73df',
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(78, 115, 223, 0.1)'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });

    pieChartInstance = new Chart(ctx2, {
        type: 'doughnut',
        data: {
            labels: Object.keys(productCounts),
            datasets: [{
                data: Object.values(productCounts),
                backgroundColor: ['#4e73df', '#1cc88a', '#36b9cc', '#f6c23e']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- ACTIONS ---
async function updateStatus(id, select) {
    const newStatus = select.value;
    let statusClass = 'status-pending';
    const s = newStatus.toLowerCase();
    if (s.includes('progress')) statusClass = 'status-in';
    else if (s.includes('delivered') || s.includes('completed') || s.includes('ready')) statusClass = 'status-delivered';
    else if (s.includes('picked')) statusClass = 'status-picked';
    else if (s.includes('cancelled')) statusClass = 'status-cancelled';
    
    select.className = `status-select ${statusClass}`;
    
    await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', ...authHeaders()},
        body: JSON.stringify({ status: newStatus })
    });
    // Don't full reload here, just update UI or silent reload
    // loadData(); 
}

async function updateDate(id, input) {
    await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', ...authHeaders()},
        body: JSON.stringify({ scheduledDate: input.value })
    });
}

async function updateReminder(id, value) {
    await fetch(`/api/orders/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json', ...authHeaders()},
        body: JSON.stringify({ reminderTime: value, reminderSent: false })
    });
    isEditingReminder = false;
}

async function notifyReady(id) {
    if(!confirm(`Notify customer for Order #${id}?`)) return;
    try {
        const res = await fetch(`/api/notify/${id}`, { method: 'POST', headers: authHeaders() });
        const d = await res.json();
        if(d.success) alert("Notification sent!");
        else alert("Failed. Check bot connection.");
    } catch(e) { alert("Server Error"); }
}

async function deleteOrder(id) {
    if(!confirm('Delete this order?')) return;
    await fetch(`/api/orders/${id}`, { method: 'DELETE', headers: authHeaders() });
    loadData();
}

async function clearAllOrders() {
    if(!confirm('WARNING: DELETE ALL DATA?')) return;
    await fetch('/api/orders', { method: 'DELETE', headers: authHeaders() });
    loadData();
}

async function downloadReport() {
    try {
        const res = await fetch('/api/report', { headers: authHeaders() });
        if (!res.ok) {
            alert('Failed to get report. Please re-login and try again.');
            return;
        }
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'orders_report.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Report download error', e);
        alert('Report download failed.');
    }
}

function formatDateTimeLocal(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const offsetMs = d.getTimezoneOffset() * 60000;
    const local = new Date(d.getTime() - offsetMs);
    return local.toISOString().slice(0, 16);
}

function startReminderEdit() {
    isEditingReminder = true;
}

function endReminderEdit() {
    // slight delay to allow onchange to fire before resuming reloads
    setTimeout(() => { isEditingReminder = false; }, 300);
}

// --- AUTH & POLLING ---
function checkStatus() {
    if (document.readyState !== 'complete') return;
    const connectionView = document.getElementById('view-connection');
    if (!connectionView || connectionView.classList.contains('d-none')) return;

    const img = document.getElementById('qrImage');
    const spin = document.getElementById('qrSpinner');
    const title = document.getElementById('connTitle');
    const status = document.getElementById('connStatus');
    if (!title || !status) return;

    fetch('/api/status', { headers: authHeaders() })
        .then(r => r.json())
        .then(d => {
            if (d.ready) {
                title.innerText = "System Online";
                status.innerText = "Connected";
                status.className = "text-success fw-bold";
                if (img) img.classList.add('d-none');
                if (spin) spin.classList.add('d-none');
            } else if (d.qr) {
                title.innerText = "Scan QR Code";
                status.innerText = "Waiting for scan...";
                status.className = "text-warning fw-bold";
                if (img) {
                    img.src = d.qr;
                    img.classList.remove('d-none');
                }
                if (spin) spin.classList.add('d-none');
            }
        })
        .catch(err => console.error('Status fetch error', err));
}

// INIT
// Only poll on pages that have the relevant elements (dashboard/orders)
if (document.getElementById('tableBody') || document.getElementById('view-dashboard')) {
    setInterval(checkStatus, 3000);
    setInterval(loadData, 5000); 
    loadData();
}
