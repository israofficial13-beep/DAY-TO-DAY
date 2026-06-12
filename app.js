// ------------------------------------------
// 1. Core Data Models and Decentralized State Setup
// ------------------------------------------
const MASTER_SYNC_ROOM_KEY = "DAY2DAY-VENNIKKULAM-RESTAURANT-8590";

// Initializing Realtime GunDB Engine Nodes
let gunInstance, dbSyncNode;
try {
    gunInstance = Gun(['https://gun-manhattan.herokuapp.com/gun', 'https://gundb.space/gun']);
    dbSyncNode = gunInstance.get(MASTER_SYNC_ROOM_KEY);
} catch(e) {
    console.error("GunDB failure initialized local mock safety node fallback instead.", e);
    dbSyncNode = { get: function() { return { put: function(){}, on: function(){} }; } };
}

// Global Static Menu Master Food Stock Matrix Data Array
const FOOD_PRODUCTS_REGISTRY = [
    { id: "p1", name: "Chicken Mandhi", category: "rice-items", desc: "Traditional Arabian rice layered dish paired with charcoal-baked tender chicken.", basePrice: 160, hasPortions: true },
    { id: "p2", name: "Al Faham Chicken", category: "al-faham", desc: "Flame grilled chicken infused with specialized Arabian spices seasoning blends.", basePrice: 150, hasPortions: true, hasFlavors: true },
    { id: "p3", name: "Beef Mandhi", category: "rice-items", desc: "Rich slow-cooked premium tender beef slices combined over aromatic stock-steamed basmati grains.", basePrice: 190, hasPortions: true },
    { id: "p4", name: "Peri Peri Al Faham", category: "al-faham", desc: "Spicy fire-grilled barbecue profile finished with african bird eye pepper coats.", basePrice: 170, hasPortions: true, hasFlavors: true },
    { id: "p5", name: "Fresh Mint Lime juice", category: "beverages", desc: "Chilled crushing refresh beverage extracted with mint leaves and fresh lime juice.", basePrice: 40, hasPortions: false },
    { id: "p6", name: "Traditional Blue Lime Mojito", category: "beverages", desc: "Effervescent sweet sparkling tonic layer with deep curacao extract profiles.", basePrice: 80, hasPortions: false }
];

// Portion Pricing Scaling Modifiers Config
const PORTION_MULTIPLIERS = { "Quarter": 1.0, "Half": 1.9, "Full": 3.6 };

// System Trackers Memory States
let systemSettingsState = { kitchenOpen: true };
let itemsStockAvailabilityRegistry = {};
let liveIncomingOrdersQueue = [];

let localSelectedProductId = null;
let localSelectedPortion = "Quarter";
let localSelectedFlavor = "Normal";
let currentActiveMenuFilter = "all";

// Web Audio API Synthesizer Sound Engine Controls
function playChimeNotificationAlert(type) {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioCtx) return;
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        if (type === 'success') {
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(523.25, audioCtx.currentTime); // Note C5
            osc.frequency.setValueAtTime(659.25, audioCtx.currentTime + 0.15); // Note E5
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.35);
        } else if (type === 'alert') {
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(220.00, audioCtx.currentTime); // Note A3
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.2);
        }
    } catch(e) { console.log("Audio contexts access ignored by view policy.", e); }
}

function createScreenToastMessage(text, isDanger = false) {
    const container = document.getElementById('toast-container');
    if(!container) return;
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-xl text-xs font-bold text-white shadow-lg border transform transition duration-300 translate-y-2 animate-fadeIn pointer-events-auto flex items-center space-x-2 ${isDanger ? 'bg-red-600 border-red-700' : 'bg-slate-900 border-slate-800'}`;
    toast.innerHTML = `<span>${isDanger ? '⚠️' : '🔔'}</span> <span>${text}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ------------------------------------------
// 2. Navigation Control Routing Interfaces
// ------------------------------------------
window.switchView = function(targetViewId) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    const activeView = document.getElementById(targetViewId);
    if (activeView) activeView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.filterMenu = function(categoryName) {
    currentActiveMenuFilter = categoryName;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.classList.remove('bg-slate-900', 'text-white', 'active');
        btn.classList.add('bg-white', 'text-slate-600', 'border-slate-200');
    });
    const targetedBtn = document.getElementById(`cat-btn-${categoryName}`);
    if (targetedBtn) {
        targetedBtn.classList.remove('bg-white', 'text-slate-600', 'border-slate-200');
        targetedBtn.classList.add('bg-slate-900', 'text-white', 'active');
    }
    renderCustomerFoodCatalogGrid();
};

window.switchAdminTab = function(adminTabKey) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.replace('block', 'hidden'));
    document.querySelectorAll('.admin-tab-btn').forEach(btn => btn.classList.remove('border-red-600', 'text-slate-900'));
    
    if (adminTabKey === 'live-orders') {
        document.getElementById('admin-live-orders-panel').classList.replace('hidden', 'block');
        document.getElementById('tab-btn-live-orders').classList.add('border-red-600', 'text-slate-900');
    } else {
        document.getElementById('admin-stock-manager-panel').classList.replace('hidden', 'block');
        document.getElementById('tab-btn-stock-manager').classList.add('border-red-600', 'text-slate-900');
    }
};

// Administrative Security Pass Validation Gates
window.openAdminAuthModal = function() {
    document.getElementById('admin-auth-modal').classList.remove('hidden');
    document.getElementById('admin-passcode-input').focus();
};
window.closeAdminAuthModal = function() {
    document.getElementById('admin-auth-modal').classList.add('hidden');
    document.getElementById('admin-passcode-input').value = "";
};
window.verifyAdminPasscodeCredentials = function() {
    const inputVal = document.getElementById('admin-passcode-input').value;
    if (inputVal === "8590") {
        closeAdminAuthModal();
        switchView('admin-dashboard-view');
        createScreenToastMessage("Access Authorized. Dashboard Engine Loaded.");
        playChimeNotificationAlert('success');
    } else {
        createScreenToastMessage("Invalid access passcode key sequence!", true);
        playChimeNotificationAlert('alert');
    }
};
window.exitAdminDashboard = function() {
    switchView('home-view');
    createScreenToastMessage("Dashboard session locked successfully.");
};

// ------------------------------------------
// 3. UI Template Compilers & Dynamic Rendering
// ------------------------------------------
function calculateProductCustomCost(productObj, size, flavor) {
    if(!productObj) return 0;
    let finalPrice = productObj.basePrice;
    if (productObj.hasPortions && PORTION_MULTIPLIERS[size]) {
        finalPrice = Math.round(productObj.basePrice * PORTION_MULTIPLIERS[size]);
    }
    if (productObj.hasFlavors && flavor !== 'Normal') {
        finalPrice += 15; // Add specialized marinade delta charge
    }
    return finalPrice;
}

function renderCustomerFoodCatalogGrid() {
    const container = document.getElementById('food-menu-grid');
    if(!container) return;
    container.innerHTML = "";

    const displayedItems = FOOD_PRODUCTS_REGISTRY.filter(item => currentActiveMenuFilter === 'all' || item.category === currentActiveMenuFilter);

    displayedItems.forEach(item => {
        const isAvailable = itemsStockAvailabilityRegistry[item.id] !== false;
        const cardWrapper = document.createElement('div');
        cardWrapper.className = `bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden flex flex-col justify-between transition transform hover:-translate-y-0.5 hover:shadow-md ${!isAvailable ? 'sold-out-card' : ''}`;
        
        let actionBtnMarkup = `
            <button onclick="openCustomizerModal('${item.id}')" class="w-full bg-slate-900 hover:bg-black text-white text-xs font-bold py-3 px-4 rounded-xl transition flex items-center justify-center space-x-1">
                <span>Order Custom Fit</span> <span>➔</span>
            </button>`;
        
        if(!isAvailable) {
            actionBtnMarkup = `
            <button disabled class="w-full bg-slate-200 text-slate-400 text-xs font-bold py-3 px-4 rounded-xl cursor-not-allowed">
                Sold Out
            </button>`;
        }

        cardWrapper.innerHTML = `
            ${!isAvailable ? `<div class="sold-out-badge">Sold Out</div>` : ''}
            <div class="p-6">
                <div class="flex justify-between items-start gap-2 mb-2">
                    <h3 class="font-extrabold text-slate-900 text-lg tracking-tight">${item.name}</h3>
                    <span class="text-emerald-600 font-black text-base whitespace-nowrap">₹${item.basePrice}${item.hasPortions ? '±' : ''}</span>
                </div>
                <p class="text-slate-500 text-xs leading-relaxed mb-4">${item.desc}</p>
                <div class="flex flex-wrap gap-1 mb-2">
                    <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-500">${item.category.replace('-', ' ')}</span>
                    ${item.hasPortions ? `<span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-amber-50 text-amber-600 border border-amber-100">Multi-Portion</span>` : ''}
                    ${item.hasFlavors ? `<span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-teal-50 text-teal-600 border border-teal-100">Flavor Matrix</span>` : ''}
                </div>
            </div>
            <div class="p-4 bg-slate-50 border-t border-slate-100 mt-auto">
                ${actionBtnMarkup}
            </div>
        `;
        container.appendChild(cardWrapper);
    });
}

function renderAdminStockConfigurationManager() {
    const container = document.getElementById('admin-stock-grid-target');
    if(!container) return;
    container.innerHTML = "";

    FOOD_PRODUCTS_REGISTRY.forEach(item => {
        const isAvailable = itemsStockAvailabilityRegistry[item.id] !== false;
        const row = document.createElement('div');
        row.className = "p-4 border border-slate-100 rounded-xl bg-slate-50 flex justify-between items-center";
        row.innerHTML = `
            <div>
                <h4 class="font-bold text-sm text-slate-800">${item.name}</h4>
                <p class="text-[10px] text-slate-400 capitalize">${item.category.replace('-', ' ')}</p>
            </div>
            <button onclick="toggleItemStockAvailability('${item.id}', ${!isAvailable})" class="px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-sm ${isAvailable ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-red-100 text-red-700 hover:bg-red-200'}">
                ${isAvailable ? '🟢 In Stock' : '🔴 Sold Out'}
            </button>
        `;
        container.appendChild(row);
    });
}

function renderAdminIncomingOrdersQueue() {
    const container = document.getElementById('admin-orders-list-target');
    const badge = document.getElementById('queue-counter-badge');
    if(!container) return;

    const pendingOrders = liveIncomingOrdersQueue.filter(o => o.status !== 'Completed' && o.status !== 'Cancelled');
    if(badge) badge.innerText = `${pendingOrders.length} Orders Active`;

    if(liveIncomingOrdersQueue.length === 0) {
        container.innerHTML = `<p class="text-center text-slate-400 text-sm py-12">No active customer orders records found in database.</p>`;
        return;
    }

    container.innerHTML = "";
    const sortedArray = [...liveIncomingOrdersQueue].sort((a,b) => b.timestamp - a.timestamp);

    sortedArray.forEach(order => {
        const row = document.createElement('div');
        row.className = `p-4 md:p-6 transition flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${order.status === 'Completed' ? 'bg-slate-50 opacity-60' : order.status === 'Cancelled' ? 'bg-red-50/40 opacity-50' : 'bg-white'}`;
        
        let controlButtons = `
            <div class="flex items-center gap-2 w-full md:w-auto justify-end">
                <button onclick="updateOrderStatusToken('${order.orderId}', 'Completed')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition shadow-sm">Complete Tick</button>
                <button onclick="updateOrderStatusToken('${order.orderId}', 'Cancelled')" class="text-slate-400 hover:text-red-600 text-xs font-semibold px-2 py-1.5 transition">Cancel</button>
            </div>`;

        if(order.status === 'Completed' || order.status === 'Cancelled') {
            controlButtons = `<span class="text-xs font-bold uppercase tracking-widest ${order.status === 'Completed' ? 'text-emerald-600' : 'text-red-500'}">${order.status}</span>`;
        }

        const timestampText = new Date(order.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        row.innerHTML = `
            <div class="space-y-1">
                <div class="flex items-center space-x-2">
                    <span class="text-xs text-slate-400 font-mono">#${order.orderId.substring(0,6)}</span>
                    <span class="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">${timestampText}</span>
                    <span class="text-sm font-black text-slate-800">${order.customerName}</span>
                </div>
                <p class="text-sm font-bold text-slate-900 tracking-tight">${order.itemSummaryString}</p>
                <div class="text-xs font-extrabold text-red-600">Total Price: ₹${order.computedPriceAmount}</div>
            </div>
            ${controlButtons}
        `;
        container.appendChild(row);
    });
}

// ------------------------------------------
// 4. Client Side Item Modals Config Configuration
// ------------------------------------------
window.openCustomizerModal = function(productId) {
    if(!systemSettingsState.kitchenOpen) {
        createScreenToastMessage("Cannot accept customization. Day 2 Day kitchen is closed!", true);
        playChimeNotificationAlert('alert');
        return;
    }

    const itemFound = FOOD_PRODUCTS_REGISTRY.find(p => p.id === productId);
    if(!itemFound) return;

    if(itemsStockAvailabilityRegistry[productId] === false) {
        createScreenToastMessage("This item selection is entirely sold out today!", true);
        return;
    }

    localSelectedProductId = productId;
    localSelectedPortion = itemFound.hasPortions ? "Quarter" : "Default";
    localSelectedFlavor = itemFound.hasFlavors ? "Normal" : "Default";

    document.getElementById('modal-food-title').innerText = itemFound.name;
    document.getElementById('modal-food-desc').innerText = itemFound.desc;

    document.getElementById('modal-portion-block').style.display = itemFound.hasPortions ? 'block' : 'none';
    document.getElementById('modal-flavor-block').style.display = itemFound.hasFlavors ? 'block' : 'none';
    document.getElementById('customer-input-name').classList.remove('border-red-500', 'bg-red-50');

    updateModalInteractiveStates();
    document.getElementById('order-customizer-modal').classList.remove('hidden');
};

window.closeCustomizerModal = function() {
    document.getElementById('order-customizer-modal').classList.add('hidden');
    localSelectedProductId = null;
};

window.selectPortionOption = function(sizeName) {
    localSelectedPortion = sizeName;
    updateModalInteractiveStates();
};

window.selectFlavorOption = function(flavorName) {
    localSelectedFlavor = flavorName;
    updateModalInteractiveStates();
};

function updateModalInteractiveStates() {
    const currentItem = FOOD_PRODUCTS_REGISTRY.find(p => p.id === localSelectedProductId);
    if(!currentItem) return;

    document.querySelectorAll('.portion-opt-btn').forEach(btn => {
        btn.className = "portion-opt-btn py-2.5 rounded-lg border text-center font-semibold text-sm transition bg-white text-slate-600 border-slate-200 hover:bg-slate-50";
    });
    const portionBtn = document.getElementById(`p-opt-${localSelectedPortion}`);
    if(portionBtn) portionBtn.className = "portion-opt-btn py-2.5 rounded-lg border text-center font-bold text-sm transition bg-red-600 text-white border-red-600 shadow-sm";

    document.querySelectorAll('.flavor-opt-btn').forEach(btn => {
        btn.className = "flavor-opt-btn py-2.5 rounded-lg border text-center font-semibold text-sm transition bg-white text-slate-600 border-slate-200 hover:bg-slate-50";
    });
    const flavorBtn = document.getElementById(`f-opt-${localSelectedFlavor.replace(' ', '-')}`);
    if(flavorBtn) flavorBtn.className = "flavor-opt-btn py-2.5 rounded-lg border text-center font-bold text-sm transition bg-emerald-600 text-white border-emerald-600 shadow-sm";

    const calculatedCost = calculateProductCustomCost(currentItem, localSelectedPortion, localSelectedFlavor);
    document.getElementById('modal-live-subtotal-price').innerText = `₹${calculatedCost}.00`;
}

window.submitFinalCustomerOrder = function() {
    const customerNameInput = document.getElementById('customer-input-name');
    const nameValue = customerNameInput.value.trim();

    if(!nameValue) {
        customerNameInput.classList.add('border-red-500', 'bg-red-50');
        createScreenToastMessage("Please enter your name to complete the order!", true);
        playChimeNotificationAlert('alert');
        return;
    }

    if(!systemSettingsState.kitchenOpen) {
        createScreenToastMessage("Order rejected. The kitchen just closed!", true);
        closeCustomizerModal();
        return;
    }

    const currentItem = FOOD_PRODUCTS_REGISTRY.find(p => p.id === localSelectedProductId);
    if(!currentItem) return;

    const computedPriceAmount = calculateProductCustomCost(currentItem, localSelectedPortion, localSelectedFlavor);
    
    let itemSummaryString = currentItem.name;
    if(currentItem.hasPortions) itemSummaryString += ` (${localSelectedPortion})`;
    if(currentItem.hasFlavors) itemSummaryString += ` [${localSelectedFlavor} Spice]`;

    const uniqueGeneratedId = 'ORD-' + Math.random().toString(36).substring(2, 9).toUpperCase();

    const payloadDataRecord = {
        orderId: uniqueGeneratedId,
        customerName: nameValue,
        itemSummaryString: itemSummaryString,
        computedPriceAmount: computedPriceAmount,
        status: "Pending",
        timestamp: Date.now()
    };

    try {
        dbSyncNode.get('orders-dataset').get(uniqueGeneratedId).put(payloadDataRecord);
        createScreenToastMessage(`Success! Live Ticket ${uniqueGeneratedId} Dispatched.`);
        playChimeNotificationAlert('success');
        closeCustomizerModal();
        customerNameInput.value = nameValue; 
    } catch(error) {
        createScreenToastMessage("Database sync connection pipeline latency encountered.", true);
    }
};

// ------------------------------------------
// 5. Reactive Database Sync Pipeline Listeners
// ------------------------------------------
dbSyncNode.get('kitchen-operational-variable').on(function(dataValue) {
    if(dataValue === undefined || dataValue === null) return;
    systemSettingsState.kitchenOpen = dataValue.isOpen !== false;
    
    const clientStickyNoticeBanner = document.getElementById('kitchen-closed-banner');
    const adminDashboardToggleButton = document.getElementById('admin-kitchen-toggle-btn');
    
    if(systemSettingsState.kitchenOpen) {
        if(clientStickyNoticeBanner) clientStickyNoticeBanner.classList.add('hidden');
        if(adminDashboardToggleButton) {
            adminDashboardToggleButton.innerText = "🟢 Kitchen Status: OPEN";
            adminDashboardToggleButton.className = "bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow transition";
        }
    } else {
        if(clientStickyNoticeBanner) clientStickyNoticeBanner.classList.remove('hidden');
        if(adminDashboardToggleButton) {
            adminDashboardToggleButton.innerText = "🔴 Kitchen Status: CLOSED";
            adminDashboardToggleButton.className = "bg-red-600 hover:bg-red-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow transition";
        }
    }
});

dbSyncNode.get('stock-availability-registry').map().on(function(val, key) {
    if(key) {
        itemsStockAvailabilityRegistry[key] = val !== false;
        renderCustomerFoodCatalogGrid();
        renderAdminStockConfigurationManager();
    }
});

dbSyncNode.get('orders-dataset').map().on(function(dataObject, key) {
    if(!dataObject) return;
    liveIncomingOrdersQueue = liveIncomingOrdersQueue.filter(o => o.orderId !== dataObject.orderId);
    liveIncomingOrdersQueue.push(dataObject);
    renderAdminIncomingOrdersQueue();
});

// Admin Panel Action Updates Dispatched
window.toggleKitchenStatus = function() {
    const nextOperationalState = !systemSettingsState.kitchenOpen;
    dbSyncNode.get('kitchen-operational-variable').put({ isOpen: nextOperationalState });
    createScreenToastMessage(`Global Kitchen state switched to ${nextOperationalState ? 'OPEN' : 'CLOSED'}.`);
};

window.toggleItemStockAvailability = function(productId, setInStockBooleanValue) {
    dbSyncNode.get('stock-availability-registry').get(productId).put(setInStockBooleanValue);
    createScreenToastMessage(`Item stock status changed in cloud peer cluster memory nodes.`);
};

window.updateOrderStatusToken = function(orderId, newStatusTokenString) {
    dbSyncNode.get('orders-dataset').get(orderId).get('status').put(newStatusTokenString);
    createScreenToastMessage(`Order ticket state updated to ${newStatusTokenString}.`);
    playChimeNotificationAlert('success');
};

// Runtime System Execution Setup
function bootstrapApplicationRunners() {
    renderCustomerFoodCatalogGrid();
    renderAdminStockConfigurationManager();
    renderAdminIncomingOrdersQueue();
    console.log("Day 2 Day Systems Engine loaded successfully.");
}

document.addEventListener("DOMContentLoaded", bootstrapApplicationRunners);
