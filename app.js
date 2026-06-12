 <script>
        // Global Application State Variables
        window.isKitchenOpen = true;
        window.isAlertSoundEnabled = true;
        window.isWhatsAppDispatchEnabled = false;
        window.adminPassword = '8590';
        window.itemIndexToDelete = null;
        window.currentMenuFilter = 'all';
        window.searchString = '';
        window.orders = [];
        window.menuItems = [];
        window.selectedItem = null;
        window.selectedQty = 1;
        window.selectedPortion = 'Q'; // Portions state choices: Q (Quarter), H (Half), F (Full)
        window.selectedFlavor = 'Normal'; // Style choices for Alfahm: Normal, Kanthari, Peri Peri
        window.syncRoomId = localStorage.getItem('syncRoomId') || 'DAY2DAY-PTA-8590';

        // Default seeds if database is empty on start (Vellayappam, Palappam & Rice Items)
        const defaultMenuItems = [
            { id: 1, displayName: "Vellayappam", price: "₹7", category: "main", desc: "Soft, spongy traditional fermented rice pancake.", available: true },
            { id: 2, displayName: "Pathiri", price: "₹6", category: "main", desc: "Thin, soft rice flour flatbread.", available: true },
            { id: 3, displayName: "Porotta", price: "₹10", category: "main", desc: "Flaky layered traditional flatbread.", available: true },
            { id: 4, displayName: "Kuzhi Mandhi", price: "₹190", category: "main", desc: "Traditional delicious slow-cooked rice cooked with rich Travancore spice blends. Price represents Quarter portion.", available: true },
            { id: 5, displayName: "Palappam", price: "₹6", category: "main", desc: "Crispy-edged, soft-centered sweet coconut milk pancake.", available: true },
            { id: 6, displayName: "Madhooth", price: "₹200", category: "main", desc: "Authentic Arabian slow-cooked flavorful spiced rice dish. Price represents Quarter portion.", available: true },
            { id: 7, displayName: "Madfoona Mandhi", price: "₹210", category: "main", desc: "Authentic spice-buried slow tender cooked chicken and rice. Price represents Quarter portion.", available: true },
            { id: 8, displayName: "Alfahm", price: "₹120", category: "main", desc: "Juicy charcoal grilled chicken marinated in Arabian spices. Available in Normal, Kanthari, or Peri Peri. Price represents Quarter portion.", available: true }
        ];

        // GunDB peer network array initialization for zero-config mesh syncing
        let gun = null;
        let p2pRoom = null;

        function initP2PSync() {
            try {
                // Initialize GunDB client using public relay node peers
                if (typeof Gun === 'undefined') {
                    throw new Error("Gun framework CDN did not load.");
                }

                gun = Gun({
                    peers: [
                        'https://gun-manhattan.herokuapp.com/gun',
                        'https://gundb.herokuapp.com/gun'
                    ]
                });

                p2pRoom = gun.get(window.syncRoomId);

                // Setup dynamic cloud listener for menu catalog mutations
                p2pRoom.get('menuItems').on((data) => {
                    if (data) {
                        try {
                            const parsed = JSON.parse(data);
                            if (JSON.stringify(window.menuItems) !== data) {
                                window.menuItems = parsed;
                                renderMenu();
                                renderAdminMenuList();
                                localStorage.setItem('backupMenu', data);
                            }
                        } catch (e) { console.error("Menu parse error:", e); }
                    }
                });

                // Setup dynamic cloud listener for incoming orders
                let firstLoad = true;
                p2pRoom.get('orders').on((data) => {
                    if (data) {
                        try {
                            const parsed = JSON.parse(data);
                            if (JSON.stringify(window.orders) !== data) {
                                let oldLength = Array.isArray(window.orders) ? window.orders.length : 0;
                                window.orders = parsed;
                                if (!Array.isArray(window.orders)) window.orders = [];
                                
                                renderAdminOrders();
                                renderSalesHistory();
                                updateNavbarOrderBadge();
                                localStorage.setItem('backupOrders', data);

                                // Sound chime if a new order lands from another computer/client phone
                                if (!firstLoad && window.orders.length > oldLength) {
                                    playChime();
                                    showToast("New live order ticket received!", true);
                                }
                            }
                        } catch (e) { console.error("Order sync parse error:", e); }
                    }
                    firstLoad = false;
                });

                // Setup dynamic cloud listener for system/kitchen controls settings
                p2pRoom.get('settings').on((data) => {
                    if (data) {
                        try {
                            const settings = JSON.parse(data);
                            window.isKitchenOpen = settings.isKitchenOpen !== undefined ? settings.isKitchenOpen : true;
                            window.isAlertSoundEnabled = settings.isAlertSoundEnabled !== undefined ? settings.isAlertSoundEnabled : true;
                            window.isWhatsAppDispatchEnabled = settings.isWhatsAppDispatchEnabled !== undefined ? settings.isWhatsAppDispatchEnabled : false;
                            window.adminPassword = settings.adminPassword || '8590';
                            
                            updateSettingsTabUI();
                            updateKitchenClosedBanner();
                        } catch (e) { console.error("Settings sync parse error:", e); }
                    }
                });

                // Update UI badge to represent successful peer connection
                const statusBadge = document.getElementById('db-status');
                if (statusBadge) {
                    statusBadge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-800 transition-all duration-300";
                    statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span> Live Synced`;
                }
            } catch (error) {
                console.warn("P2P Mesh connection offline or fallback activated:", error.message);
                const statusBadge = document.getElementById('db-status');
                if (statusBadge) {
                    statusBadge.className = "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800 transition-all duration-300";
                    statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-red-500"></span> Local Backup Mode`;
                }
                loadLocalStorageBackup();
            }
        }

        // Backup local retrieval if network connection drops
        function loadLocalStorageBackup() {
            try {
                window.menuItems = JSON.parse(localStorage.getItem('backupMenu')) || [...defaultMenuItems];
                window.orders = JSON.parse(localStorage.getItem('backupOrders')) || [];
                if (!Array.isArray(window.orders)) window.orders = [];
            } catch(e) {
                window.menuItems = [...defaultMenuItems];
                window.orders = [];
            }
            renderMenu();
            renderAdminMenuList();
            renderAdminOrders();
            renderSalesHistory();
            updateNavbarOrderBadge();
            updateKitchenClosedBanner();
        }

        // Save kitchen/system config states to Cloud mesh
        window.saveSettingsToCloud = function() {
            const settingsObj = {
                isKitchenOpen: window.isKitchenOpen,
                isAlertSoundEnabled: window.isAlertSoundEnabled,
                isWhatsAppDispatchEnabled: window.isWhatsAppDispatchEnabled,
                adminPassword: window.adminPassword
            };
            if (p2pRoom) {
                try {
                    p2pRoom.get('settings').put(JSON.stringify(settingsObj));
                } catch (e) { console.error("Error putting setting configs:", e); }
            }
            updateSettingsTabUI();
            updateKitchenClosedBanner();
        }

        // Save new order to GunDB mesh database
        window.submitOrderCloud = function(newTicket) {
            if (!Array.isArray(window.orders)) {
                window.orders = [];
            }
            window.orders.push(newTicket);
            const dataStr = JSON.stringify(window.orders);
            localStorage.setItem('backupOrders', dataStr);
            if (p2pRoom) {
                try {
                    p2pRoom.get('orders').put(dataStr);
                } catch (e) { console.error("Error updating synced order packet:", e); }
            }
            renderAdminOrders();
            renderSalesHistory();
            updateNavbarOrderBadge();
        }

        // Advance Order Status across the Kanban pipeline
        window.advanceOrderCloud = function(id, nextStatus) {
            if (!Array.isArray(window.orders)) return;
            const o = window.orders.find(item => item.id === id);
            if (o) {
                o.status = nextStatus;
                const dataStr = JSON.stringify(window.orders);
                localStorage.setItem('backupOrders', dataStr);
                if (p2pRoom) {
                    try {
                        p2pRoom.get('orders').put(dataStr);
                    } catch (e) { console.error("Error setting synchronized order state:", e); }
                }
                renderAdminOrders();
                renderSalesHistory();
            }
        }

        // Delete order from dashboard and sync records
        window.deleteOrderCloud = function(id) {
            if (!Array.isArray(window.orders)) return;
            window.orders = window.orders.filter(item => item.id !== id);
            const dataStr = JSON.stringify(window.orders);
            localStorage.setItem('backupOrders', dataStr);
            if (p2pRoom) {
                try {
                    p2pRoom.get('orders').put(dataStr);
                } catch (e) { console.error("Error purging synced order:", e); }
            }
            renderAdminOrders();
            renderSalesHistory();
        }

        // Add food to menu sync registry
        window.addFoodItemCloud = function(newItem) {
            window.menuItems.push(newItem);
            const dataStr = JSON.stringify(window.menuItems);
            localStorage.setItem('backupMenu', dataStr);
            if (p2pRoom) {
                try {
                    p2pRoom.get('menuItems').put(dataStr);
                } catch (e) { console.error("Error adding catalog item:", e); }
            }
            renderMenu();
            renderAdminMenuList();
        }

        // Update single catalog item price
        window.updateMenuPriceCloud = function(id, newPrice) {
            const item = window.menuItems.find(i => i.id === id);
            if (item) {
                item.price = newPrice;
                const dataStr = JSON.stringify(window.menuItems);
                localStorage.setItem('backupMenu', dataStr);
                if (p2pRoom) {
                    try {
                        p2pRoom.get('menuItems').put(dataStr);
                    } catch (e) { console.error("Error updating price item:", e); }
                }
                renderMenu();
                renderAdminMenuList();
            }
        }

        // Toggle food availability state
        window.toggleFoodAvailabilityCloud = function(id) {
            const item = window.menuItems.find(i => i.id === id);
            if (item) {
                item.available = (item.available === undefined) ? false : !item.available;
                const dataStr = JSON.stringify(window.menuItems);
                localStorage.setItem('backupMenu', dataStr);
                if (p2pRoom) {
                    try {
                        p2pRoom.get('menuItems').put(dataStr);
                    } catch (e) { console.error("Error toggling stock:", e); }
                }
                renderMenu();
                renderAdminMenuList();
            }
        }

        // Delete food item from catalog registry
        window.deleteFoodItemCloud = function(id) {
            window.menuItems = window.menuItems.filter(i => i.id !== id);
            const dataStr = JSON.stringify(window.menuItems);
            localStorage.setItem('backupMenu', dataStr);
            if (p2pRoom) {
                try {
                    p2pRoom.get('menuItems').put(dataStr);
                } catch (e) { console.error("Error deleting catalog item:", e); }
            }
            renderMenu();
            renderAdminMenuList();
        }

        // Update active sync room ID
        window.updateSyncRoomId = function() {
            const customKey = document.getElementById('sync-room-id').value.trim().toUpperCase();
            if (!customKey) {
                showToast("Sync Room ID cannot be empty!", false);
                return;
            }
            window.syncRoomId = customKey;
            localStorage.setItem('syncRoomId', customKey);
            showToast(`Sync Room updated to: ${customKey}! Reconnecting...`, true);
            initP2PSync();
        }

        // Relative Time indicator engine
        function getRelativeTime(timestamp) {
            if (!timestamp) return "Just now";
            const diff = Date.now() - timestamp;
            const minutes = Math.floor(diff / 60000);
            
            if (minutes < 1) return "Just now";
            if (minutes === 1) return "1 min ago";
            if (minutes < 60) return `${minutes} mins ago`;
            
            const hours = Math.floor(minutes / 60);
            if (hours === 1) return "1 hour ago";
            return `${hours} hours ago`;
        }

        // Header active count notification badges
        function updateNavbarOrderBadge() {
            const activeOrders = (window.orders || []).filter(o => o.status === 'pending' || o.status === 'preparing');
            const count = activeOrders.length;
            
            const navBadge = document.getElementById('nav-order-badge');
            const dashBadge = document.getElementById('dashboard-order-badge');
            
            if (navBadge) {
                if (count > 0) {
                    navBadge.innerText = count;
                    navBadge.classList.remove('hidden');
                } else {
                    navBadge.classList.add('hidden');
                }
            }
            
            if (dashBadge) {
                dashBadge.innerText = count;
            }
        }

        // Control kitchen pause layout banner display
        function updateKitchenClosedBanner() {
            const banner = document.getElementById('kitchen-closed-banner');
            if (banner) {
                if (window.isKitchenOpen) {
                    banner.classList.add('hidden');
                } else {
                    banner.classList.remove('hidden');
                }
            }
        }

        // Synthesize dynamic Web Audio chime alerts (Dependency-free sound synthesizer)
        function playChime() {
            if (!window.isAlertSoundEnabled) return;
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (!AudioContext) return;
                const ctx = new AudioContext();
                
                const playNote = (freq, startTime, duration) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, startTime);
                    
                    gain.gain.setValueAtTime(0.3, startTime);
                    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                    
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    
                    osc.start(startTime);
                    osc.stop(startTime + duration);
                };
                
                const now = ctx.currentTime;
                playNote(523.25, now, 0.4); // C5 Tone
                playNote(659.25, now + 0.15, 0.5); // E5 Tone
            } catch (e) {
                console.warn("Audio blocked by browser context restrictions:", e);
            }
        }

        // Display animated in-app notifications toast
        function showToast(message, isSuccess = true) {
            const toast = document.getElementById('toast');
            const icon = document.getElementById('toast-icon');
            const text = document.getElementById('toast-message');

            toast.className = isSuccess 
                ? "fixed top-5 right-5 bg-green-600 text-white px-6 py-3 rounded-xl shadow-2xl z-50 transform transition-all duration-300 flex items-center gap-3" 
                : "fixed top-5 right-5 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl z-50 transform transition-all duration-300 flex items-center gap-3";

            icon.innerText = isSuccess ? "✓" : "⚠️";
            text.innerText = message;

            toast.style.transform = "translateY(0)";
            toast.style.opacity = "1";

            setTimeout(() => {
                toast.style.transform = "translateY(-100px)";
                toast.style.opacity = "0";
            }, 3200);
        }

        // Owner security gateways
        function openLoginModal() {
            if (!document.getElementById('admin-view').classList.contains('hidden')) {
                showView('admin');
                return;
            }
            document.getElementById('login-password').value = '';
            document.getElementById('login-error').classList.add('hidden');
            document.getElementById('login-modal').classList.remove('hidden');
            document.getElementById('login-password').focus();
        }

        function closeLoginModal() {
            document.getElementById('login-modal').classList.add('hidden');
        }

        function verifyAdminPassword() {
            const entered = document.getElementById('login-password').value;
            if (entered === window.adminPassword) {
                closeLoginModal();
                showView('admin');
                showToast("Dashboard accessed successfully!", true);
            } else {
                document.getElementById('login-error').classList.remove('hidden');
                showToast("Incorrect password!", false);
            }
        }

        // Control high-level application routing layouts
        function showView(view) {
            document.getElementById('home-view').classList.add('hidden');
            document.getElementById('menu-view').classList.add('hidden');
            document.getElementById('admin-view').classList.add('hidden');

            document.getElementById('nav-home').className = "px-3 py-1.5 md:px-4 md:py-2 rounded-full text-green-700 hover:text-red-600 transition duration-300 font-bold";
            document.getElementById('nav-menu').className = "px-3 py-1.5 md:px-4 md:py-2 rounded-full text-green-700 hover:text-red-600 transition duration-300 font-bold";
            document.getElementById('nav-admin-btn').className = "text-green-700 font-bold hover:text-red-600 border border-green-600 px-3 py-1.5 md:px-4 md:py-1.5 rounded-full transition duration-300 relative flex items-center gap-1.5";

            if (view === 'home') {
                document.getElementById('home-view').classList.remove('hidden');
                document.getElementById('nav-home').className = "px-3 py-1.5 md:px-4 md:py-2 rounded-full text-green-700 hover:text-red-600 transition duration-300 font-bold bg-green-50";
            } else if (view === 'menu') {
                document.getElementById('menu-view').classList.remove('hidden');
                document.getElementById('nav-menu').className = "px-3 py-1.5 md:px-4 md:py-2 rounded-full text-green-700 hover:text-red-600 transition duration-300 font-bold bg-green-50";
                renderMenu();
            } else if (view === 'admin') {
                document.getElementById('admin-view').classList.remove('hidden');
                document.getElementById('nav-admin-btn').className = "text-green-700 font-bold hover:text-red-600 border border-green-600 px-3 py-1.5 md:px-4 md:py-1.5 rounded-full transition duration-300 relative flex items-center gap-1.5 bg-green-50";
                renderAdminOrders();
                renderAdminMenuList();
                renderSalesHistory();
                updateSettingsTabUI();
            }
            window.scrollTo(0,0);
        }

        // Control owner dashboard tab switching layouts
        function showAdminTab(tabName) {
            document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.add('hidden'));
            document.getElementById('tab-' + tabName).classList.remove('hidden');

            const buttons = ['orders', 'menu-edit', 'history', 'qr-generator', 'settings'];
            buttons.forEach(b => {
                const btn = document.getElementById(`tab-${b}-btn`);
                if (!btn) return;
                if (b === tabName) {
                    btn.className = "px-6 py-3 font-bold border-b-4 border-green-600 text-green-700 flex items-center gap-2 whitespace-nowrap";
                } else {
                    btn.className = "px-6 py-3 font-bold text-gray-500 hover:text-green-700 transition whitespace-nowrap";
                }
            });

            if (tabName === 'history') {
                renderSalesHistory();
            }
        }

        // Build active catalog list for customer browsing
        function renderMenu() {
            const grid = document.getElementById('menu-grid');
            if (!grid) return;
            grid.innerHTML = '';

            let filtered = (window.menuItems || []).filter(item => {
                if (window.currentMenuFilter !== 'all' && item.category !== window.currentMenuFilter) return false;
                if (window.searchString && !item.displayName.toLowerCase().includes(window.searchString)) return false;
                return true;
            });

            if (filtered.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full py-16 text-center text-gray-500">
                        <span class="text-5xl block mb-4">🍽️</span>
                        <p class="text-lg font-bold">No food items match your filter selection.</p>
                    </div>
                `;
                return;
            }

            filtered.forEach(item => {
                const categoryColors = {
                    main: { border: 'border-l-4 border-green-600', bg: 'bg-green-50/50', text: 'text-green-800' },
                    appetizer: { border: 'border-l-4 border-yellow-500', bg: 'bg-yellow-50/50', text: 'text-yellow-800' },
                    drink: { border: 'border-l-4 border-blue-500', bg: 'bg-blue-50/50', text: 'text-blue-800' }
                };
                const categoryEmojis = { main: '🍛', appetizer: '🍿', drink: '🍹' };
                const design = categoryColors[item.category] || { border: 'border-l-4 border-gray-400', bg: 'bg-gray-50', text: 'text-gray-800' };
                const emoji = categoryEmojis[item.category] || '🍲';
                const readableCategory = item.category === 'main' ? 'Main' : item.category === 'appetizer' ? 'Snack' : 'Beverage';

                // Check item's active stock value
                const isAvailable = item.available !== false;

                const card = document.createElement('div');
                
                // Build responsive style layouts based on availability switches
                if (isAvailable) {
                    card.className = `bg-white rounded-2xl shadow-sm ${design.border} p-6 flex flex-col justify-between hover:shadow-xl transition duration-300 transform hover:-translate-y-1 border border-gray-150 cursor-pointer`;
                    card.onclick = () => openModal(item.id);
                } else {
                    card.className = `bg-gray-100 rounded-2xl shadow-sm border-l-4 border-gray-300 p-6 flex flex-col justify-between opacity-60 border border-gray-200 cursor-not-allowed select-none`;
                    card.onclick = () => showToast(`"${item.displayName}" is currently Out of Stock!`, false);
                }
                
                let isRice = checkIsRiceItem(item);
                let suffixPrice = isRice ? ' <span class="text-xs text-gray-400 font-bold block mt-1">(Base / Qtr portion)</span>' : '';
                
                const actionButton = isAvailable
                    ? `<span class="bg-green-600 text-white font-bold px-4 py-2 rounded-full text-xs hover:bg-green-700 transition">Order Hot</span>`
                    : `<span class="bg-gray-400 text-white font-bold px-4 py-2 rounded-full text-xs cursor-not-allowed">Sold Out</span>`;

                const availabilityBadge = isAvailable
                    ? ''
                    : `<span class="bg-red-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded ml-2 uppercase tracking-widest animate-pulse">Sold Out</span>`;

                card.innerHTML = `
                    <div>
                        <div class="flex justify-between items-start gap-2">
                            <span class="${design.bg} ${design.text} text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5">
                                <span>${emoji}</span> <span class="capitalize font-bold">${readableCategory}</span>
                            </span>
                            ${availabilityBadge}
                        </div>
                        <h4 class="text-xl font-bold text-green-950 mt-4 mb-2 flex items-center justify-between">
                            <span>${item.displayName}</span>
                        </h4>
                        <p class="text-sm text-gray-550 leading-relaxed min-h-[40px] line-clamp-2">${item.desc}</p>
                    </div>
                    <div class="pt-6 border-t border-gray-100 flex justify-between items-center mt-6">
                        <div>
                            <span class="text-2xl font-black text-red-600">${item.price}</span>
                            ${suffixPrice}
                        </div>
                        ${actionButton}
                    </div>
                `;
                grid.appendChild(card);
            });
        }

        function filterMenu(category) {
            window.currentMenuFilter = category;
            document.querySelectorAll('.cat-btn').forEach(btn => {
                btn.className = "cat-btn px-4 py-2 rounded-full font-bold text-sm bg-gray-100 text-gray-700 hover:bg-gray-200 transition";
            });
            document.getElementById(`cat-${category}`).className = "cat-btn px-4 py-2 rounded-full font-bold text-sm bg-green-700 text-white transition";
            renderMenu();
        }

        function handleMenuSearch() {
            window.searchString = document.getElementById('menu-search').value.toLowerCase().trim();
            renderMenu();
        }

        // Verify if active item represents custom portion rules (Kuzhi Mandhi, Madhooth, Madfoona Mandhi, Alfahm)
        function checkIsRiceItem(item) {
            if (!item) return false;
            const name = item.displayName.toLowerCase();
            return name.includes('mandhi') || name.includes('madhooth') || name.includes('rice') || name.includes('biryani') || name.includes('madfoona') || name.includes('alfahm');
        }

        // Custom interactive customization checkout modal
        function openModal(id) {
            window.selectedItem = window.menuItems.find(item => item.id === id);
            if (!window.selectedItem) return;

            window.selectedQty = 1;
            window.selectedPortion = 'Q';
            window.selectedFlavor = 'Normal';
            
            const nameInput = document.getElementById('order-table');
            if (nameInput) {
                nameInput.classList.remove('input-error');
            }
            document.getElementById('order-notes').value = '';
            document.getElementById('modal-name').innerText = window.selectedItem.displayName;
            
            const isRice = checkIsRiceItem(window.selectedItem);
            const isAlfahm = window.selectedItem.displayName.toLowerCase().includes('alfahm');
            
            const modalPriceElem = document.getElementById('modal-price');
            if (isRice) {
                modalPriceElem.classList.add('hidden');
            } else {
                modalPriceElem.classList.remove('hidden');
                modalPriceElem.innerText = window.selectedItem.price;
            }
            
            document.getElementById('modal-desc').innerText = window.selectedItem.desc;

            const categoryEmojis = { main: '🍛', appetizer: '🍿', drink: '🍹' };
            const categoryLabels = { main: 'Main Course', appetizer: 'Snack / Starter', drink: 'Beverage / Drink' };
            
            document.getElementById('modal-badge-emoji').innerText = categoryEmojis[window.selectedItem.category] || '🍲';
            document.getElementById('modal-badge-cat').innerText = categoryLabels[window.selectedItem.category] || 'Special';

            const qtyContainer = document.getElementById('quantity-control-container');

            if (isRice) {
                // Render custom portion selector bar
                let flavorHTML = '';
                if (isAlfahm) {
                    flavorHTML = `
                        <div class="flex flex-col gap-2 mt-4 pt-4 border-t border-gray-200">
                            <span class="text-xs font-bold text-gray-500 uppercase tracking-wider block">Select Flavor / Style</span>
                            <div class="grid grid-cols-3 gap-2 bg-gray-100 p-1.5 rounded-xl border border-gray-250">
                                <button type="button" onclick="setAlfahmFlavor('Normal')" id="flavor-btn-Normal" class="flavor-option-btn py-2.5 rounded-lg font-bold text-xs transition focus:outline-none text-center bg-transparent text-gray-650 hover:bg-gray-200/60 border-0 cursor-pointer">Normal</button>
                                <button type="button" onclick="setAlfahmFlavor('Kanthari')" id="flavor-btn-Kanthari" class="flavor-option-btn py-2.5 rounded-lg font-bold text-xs transition focus:outline-none text-center bg-transparent text-gray-650 hover:bg-gray-200/60 border-0 cursor-pointer">Kanthari</button>
                                <button type="button" onclick="setAlfahmFlavor('Peri Peri')" id="flavor-btn-Peri" class="flavor-option-btn py-2.5 rounded-lg font-bold text-xs transition focus:outline-none text-center bg-transparent text-gray-650 hover:bg-gray-200/60 border-0 cursor-pointer">Peri Peri</button>
                            </div>
                        </div>
                    `;
                }

                qtyContainer.innerHTML = `
                    <div class="flex flex-col gap-2">
                        <span class="text-xs font-bold text-gray-500 uppercase tracking-wider block">Select portion size</span>
                        <div class="grid grid-cols-3 gap-2 bg-gray-100 p-1.5 rounded-xl border border-gray-250">
                            <button type="button" onclick="setRicePortion('Q')" id="portion-btn-Q" class="py-2.5 rounded-lg font-bold text-xs transition focus:outline-none text-center border-0 cursor-pointer">Quarter (Q)</button>
                            <button type="button" onclick="setRicePortion('H')" id="portion-btn-H" class="py-2.5 rounded-lg font-bold text-xs transition focus:outline-none text-center border-0 cursor-pointer">Half (H)</button>
                            <button type="button" onclick="setRicePortion('F')" id="portion-btn-F" class="py-2.5 rounded-lg font-bold text-xs transition focus:outline-none text-center border-0 cursor-pointer">Full (F)</button>
                        </div>
                    </div>
                    ${flavorHTML}
                `;
                setRicePortion('Q');
                if (isAlfahm) {
                    setTimeout(() => setAlfahmFlavor('Normal'), 50);
                }
            } else {
                // Render standard numerical spinners
                qtyContainer.innerHTML = `
                    <div class="flex items-center justify-between">
                        <span class="text-sm font-semibold text-gray-700">Quantity</span>
                        <div class="flex items-center bg-white border rounded-xl overflow-hidden shadow-sm">
                            <button type="button" onclick="changeQty(-1)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 font-bold transition focus:outline-none border-0 cursor-pointer">-</button>
                            <span id="order-qty" class="px-6 font-bold text-gray-800">1</span>
                            <button type="button" onclick="changeQty(1)" class="px-4 py-2 bg-gray-100 hover:bg-gray-200 font-bold transition focus:outline-none border-0 cursor-pointer">+</button>
                        </div>
                    </div>
                `;
                document.getElementById('order-qty').innerText = window.selectedQty;
                updateModalPrice();
            }

            document.getElementById('item-modal').classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
        }

        window.setAlfahmFlavor = function(flavor) {
            window.selectedFlavor = flavor;
            const btnN = document.getElementById('flavor-btn-Normal');
            const btnK = document.getElementById('flavor-btn-Kanthari');
            const btnP = document.getElementById('flavor-btn-Peri');

            if (!btnN || !btnK || !btnP) return;

            [btnN, btnK, btnP].forEach(btn => {
                btn.className = "flavor-option-btn py-2.5 rounded-lg font-bold text-xs transition focus:outline-none text-center bg-transparent text-gray-650 hover:bg-gray-200/60 border-0 cursor-pointer";
            });

            let activeBtn;
            if (flavor === 'Normal') activeBtn = btnN;
            if (flavor === 'Kanthari') activeBtn = btnK;
            if (flavor === 'Peri Peri') activeBtn = btnP;

            if (activeBtn) {
                activeBtn.className = "flavor-option-btn py-2.5 rounded-lg font-extrabold text-xs transition focus:outline-none text-center bg-red-600 text-white shadow-md border-0 cursor-pointer";
            }
        }

        function closeModal() {
            document.getElementById('item-modal').classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        }

        function setRicePortion(portion) {
            window.selectedPortion = portion;
            const btnQ = document.getElementById('portion-btn-Q');
            const btnH = document.getElementById('portion-btn-H');
            const btnF = document.getElementById('portion-btn-F');

            if (!btnQ || !btnH || !btnF) return;

            [btnQ, btnH, btnF].forEach(btn => {
                btn.className = "py-2.5 rounded-lg font-bold text-xs transition focus:outline-none text-center bg-transparent text-gray-650 hover:bg-gray-200/60 border-0 cursor-pointer";
            });

            const activeBtn = document.getElementById(`portion-btn-${portion}`);
            if (activeBtn) {
                activeBtn.className = "py-2.5 rounded-lg font-extrabold text-xs transition focus:outline-none text-center bg-green-600 text-white shadow-md border-0 cursor-pointer";
            }

            updateModalPrice();
        }

        function changeQty(amount) {
            window.selectedQty += amount;
            if (window.selectedQty < 1) window.selectedQty = 1;
            document.getElementById('order-qty').innerText = window.selectedQty;
            updateModalPrice();
        }

        function updateModalPrice() {
            if (!window.selectedItem) return;
            const rawVal = window.selectedItem.price.replace(/[^\d]/g, '');
            const rate = parseInt(rawVal, 10) || 0;
            
            let calculatedTotal = 0;
            const isRice = checkIsRiceItem(window.selectedItem);
            
            if (isRice) {
                let multiplier = 1;
                if (window.selectedPortion === 'H') multiplier = 2;
                if (window.selectedPortion === 'F') multiplier = 4;
                calculatedTotal = rate * multiplier;
            } else {
                calculatedTotal = rate * window.selectedQty;
            }
            
            const totalBadge = document.getElementById('modal-order-total');
            if (totalBadge) {
                if (isRice) {
                    totalBadge.classList.add('hidden');
                } else {
                    totalBadge.classList.remove('hidden');
                    totalBadge.innerText = '₹' + calculatedTotal;
                }
            }
        }

        // Safe Order Placement pipeline (Validations, error overrides, local fallback support)
        function submitOrder() {
            if (!window.selectedItem) {
                showToast("Please choose a food item first!", false);
                return;
            }

            if (!window.isKitchenOpen) {
                showToast("The kitchen is currently closed. Online orders are temporarily paused!", false);
                closeModal();
                return;
            }

            const nameInput = document.getElementById('order-table');
            const table = nameInput ? nameInput.value.trim() : "";
            
            if (!table) {
                if (nameInput) {
                    nameInput.classList.add('input-error');
                    nameInput.focus();
                }
                showToast("Please enter your name to place the order!", false);
                return;
            }

            const notes = document.getElementById('order-notes').value;
            const orderId = 200 + (Array.isArray(window.orders) ? window.orders.length : 0) + Math.floor(Math.random() * 100);
            
            const rawVal = window.selectedItem.price.replace(/[^\d]/g, '');
            const rate = parseInt(rawVal, 10) || 0;

            const isRice = checkIsRiceItem(window.selectedItem);
            const isAlfahm = window.selectedItem.displayName.toLowerCase().includes('alfahm');
            let totalPriceStr = '';
            let qtyDisplay = '';

            if (isRice) {
                let multiplier = 1;
                if (window.selectedPortion === 'H') multiplier = 2;
                if (window.selectedPortion === 'F') multiplier = 4;
                totalPriceStr = `₹${rate * multiplier}`;
                qtyDisplay = window.selectedPortion;
            } else {
                totalPriceStr = `₹${rate * window.selectedQty}`;
                qtyDisplay = String(window.selectedQty);
            }

            let finalName = window.selectedItem.displayName;
            if (isAlfahm && window.selectedFlavor) {
                finalName += ` (${window.selectedFlavor})`;
            }

            // Create timestamp attributes
            const now = new Date();
            let hours = now.getHours();
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const ampm = hours >= 12 ? 'PM' : 'AM';
            hours = hours % 12;
            hours = hours ? hours : 12; 
            const timeString = `${hours}:${minutes} ${ampm}`;

            const newTicket = {
                id: orderId,
                name: finalName,
                qty: qtyDisplay,
                price: totalPriceStr,
                table: table,
                notes: notes,
                timestamp: Date.now(),
                time: timeString,
                status: "pending"
            };

            // Write order to sync database and local backup files
            if (window.submitOrderCloud) {
                window.submitOrderCloud(newTicket);
            }

            // Optional direct WhatsApp kitchen routing dispatcher
            if (window.isWhatsAppDispatchEnabled) {
                const kitchenPhone = "919061170906";
                const portionLabel = isRice 
                    ? (newTicket.qty === 'Q' ? 'Quarter' : newTicket.qty === 'H' ? 'Half' : 'Full') 
                    : `${newTicket.qty} Nos`;
                const textMessage = `*NEW ORDER - DAY2DAY PTA*%0A---------------------------%0A🍛 *Dish:* ${newTicket.name}%0A🔢 *Portion / Qty:* ${portionLabel}%0A💰 *Total:* ${newTicket.price}%0A👤 *Name:* ${newTicket.table}%0A📝 *Notes:* ${newTicket.notes || 'None'}%0A🕒 *Time:* ${newTicket.time}`;
                window.open(`https://api.whatsapp.com/send?phone=${kitchenPhone}&text=${textMessage}`, '_blank');
            }

            closeModal();
            const successModal = document.getElementById('success-modal');
            if (successModal) {
                successModal.classList.remove('hidden');
            }
        }

        function closeSuccessModal() {
            document.getElementById('success-modal').classList.add('hidden');
        }

        // Compile live lanes inside Kitchen Board
        function renderAdminOrders() {
            const pendingCol = document.getElementById('orders-pending-container');
            const preparingCol = document.getElementById('orders-preparing-container');
            const completedCol = document.getElementById('orders-completed-container');

            if (!pendingCol || !preparingCol || !completedCol) return;

            pendingCol.innerHTML = '';
            preparingCol.innerHTML = '';
            completedCol.innerHTML = '';

            let countP = 0, countPr = 0, countC = 0;

            (window.orders || []).forEach(order => {
                if (order.status === 'archived') return;

                const card = document.createElement('div');
                card.className = "bg-white p-5 rounded-2xl shadow-sm border border-gray-200 space-y-3 relative overflow-hidden transition hover:shadow-md animate-fade-in";
                
                let buttonControls = '';
                if (order.status === 'pending') {
                    countP++;
                    buttonControls = `
                        <div class="flex gap-2">
                            <button onclick="advanceOrder(${order.id}, 'preparing')" class="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 rounded-lg transition border-0 cursor-pointer">Accept to Kitchen</button>
                            <button onclick="deleteOrder(${order.id})" class="bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs p-2 rounded-lg transition border-0 cursor-pointer" title="Cancel Order">✕</button>
                        </div>
                    `;
                } else if (order.status === 'preparing') {
                    countPr++;
                    buttonControls = `
                        <div class="flex gap-2">
                            <button onclick="advanceOrder(${order.id}, 'completed')" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold text-xs py-2 rounded-lg transition border-0 cursor-pointer">Serve & Complete</button>
                        </div>
                    `;
                } else if (order.status === 'completed') {
                    countC++;
                    buttonControls = `
                        <button onclick="advanceOrder(${order.id}, 'archived')" class="w-full bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-600 font-bold text-xs py-2 rounded-lg transition border-0 cursor-pointer">Archive & Log Receipt</button>
                    `;
                }

                let displayQtyLabel = order.qty;
                let bgBadge = 'bg-gray-100 text-gray-800';
                if (order.qty === 'Q') {
                    displayQtyLabel = 'Quarter (Q)';
                    bgBadge = 'bg-amber-100 text-amber-800 border border-amber-200';
                } else if (order.qty === 'H') {
                    displayQtyLabel = 'Half (H)';
                    bgBadge = 'bg-blue-100 text-blue-800 border border-blue-200';
                } else if (order.qty === 'F') {
                    displayQtyLabel = 'Full (F)';
                    bgBadge = 'bg-purple-100 text-purple-800 border border-purple-200';
                }

                const relativeTimeLabel = getRelativeTime(order.timestamp);
                const isDelayed = order.status !== 'completed' && order.timestamp && (Date.now() - order.timestamp > 900000);
                const relativeColor = isDelayed ? "text-red-600 font-black animate-pulse" : "text-gray-400 font-medium";

                card.innerHTML = `
                    <div class="flex justify-between items-start">
                        <div>
                            <span class="text-xs text-gray-400 font-bold tracking-wider">TICKET #${order.id}</span>
                            <h5 class="font-bold text-gray-850 text-base mt-0.5">${order.name}</h5>
                        </div>
                        <span class="bg-gray-150 text-gray-800 font-black text-xs px-2.5 py-1 rounded-full max-w-[150px] truncate" title="${order.table}">${order.table}</span>
                    </div>
                    
                    <div class="flex justify-between items-center text-sm py-1 border-t border-b border-gray-50 bg-gray-50/50 px-2 rounded-lg">
                        <span class="text-gray-550">Portion/Qty: <strong class="px-2 py-0.5 rounded ${bgBadge} text-xs font-black ml-1">${displayQtyLabel}</strong></span>
                        <span class="text-red-600 font-extrabold">${order.price}</span>
                    </div>

                    ${order.notes ? `<p class="text-xs bg-yellow-50 text-yellow-800 p-2.5 rounded-lg border border-yellow-100 leading-relaxed font-medium">💬 ${order.notes}</p>` : ''}

                    <div class="flex justify-between items-center text-[10px] pt-1">
                        <span class="text-gray-400">🕒 Absolute: ${order.time}</span>
                        <span class="${relativeColor}">⏱️ ${relativeTimeLabel}</span>
                    </div>

                    <div class="pt-1">
                        ${buttonControls}
                    </div>
                `;

                if (order.status === 'pending') {
                    pendingCol.appendChild(card);
                } else if (order.status === 'preparing') {
                    preparingCol.appendChild(card);
                } else if (order.status === 'completed') {
                    completedCol.appendChild(card);
                }
            });

            document.getElementById('count-pending').innerText = countP;
            document.getElementById('count-preparing').innerText = countPr;
            document.getElementById('count-completed').innerText = countC;

            updateNavbarOrderBadge();
        }

        function advanceOrder(id, nextStatus) {
            if (window.advanceOrderCloud) {
                window.advanceOrderCloud(id, nextStatus);
                showToast(nextStatus === 'archived' ? "Order logged into history catalog!" : "Status updated successfully!", true);
            }
        }

        function deleteOrder(id) {
            if (window.deleteOrderCloud) {
                window.deleteOrderCloud(id);
                showToast("Order ticket dismissed.", true);
            }
        }

        // Render Sales history records and aggregate revenue financials
        function renderSalesHistory() {
            const tableBody = document.getElementById('history-table-body');
            if (!tableBody) return;
            tableBody.innerHTML = '';

            const historyFilterText = document.getElementById('history-search').value.toLowerCase().trim();

            let totalRevenue = 0;
            let successOrdersCount = 0;
            let dishCounter = {};

            const historicalOrders = (window.orders || []).filter(order => {
                return order.status === 'completed' || order.status === 'archived';
            });

            let filteredHistory = historicalOrders.filter(order => {
                if (!historyFilterText) return true;
                return order.name.toLowerCase().includes(historyFilterText) || 
                       order.table.toLowerCase().includes(historyFilterText) || 
                       String(order.id).includes(historyFilterText);
            });

            historicalOrders.forEach(order => {
                const numericPrice = parseInt(order.price.replace(/[^\d]/g, ''), 10) || 0;
                totalRevenue += numericPrice;
                successOrdersCount++;
                dishCounter[order.name] = (dishCounter[order.name] || 0) + 1;
            });

            let favoriteFood = "None Yet";
            let maxCount = 0;
            for (const [dish, count] of Object.entries(dishCounter)) {
                if (count > maxCount) {
                    maxCount = count;
                    favoriteFood = dish;
                }
            }

            document.getElementById('stat-revenue').innerText = `₹${totalRevenue}`;
            document.getElementById('stat-order-count').innerText = successOrdersCount;
            document.getElementById('stat-favorite').innerText = favoriteFood;

            if (filteredHistory.length === 0) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="8" class="p-8 text-center text-gray-400">
                            No ledger matches found.
                        </td>
                    </tr>
                `;
                return;
            }

            filteredHistory.forEach(order => {
                const tr = document.createElement('tr');
                tr.className = "hover:bg-gray-50 transition border-b";

                const dateObj = order.timestamp ? new Date(order.timestamp) : new Date();
                const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${order.time}`;

                let statusColor = "bg-green-100 text-green-850 border border-green-200";
                if (order.status === 'archived') {
                    statusColor = "bg-gray-100 text-gray-700 border border-gray-200";
                }

                tr.innerHTML = `
                    <td class="p-4 font-bold text-gray-400">#${order.id}</td>
                    <td class="p-4 text-gray-600 font-medium">${formattedDate}</td>
                    <td class="p-4 font-bold text-gray-800">${order.name}</td>
                    <td class="p-4 font-black"><span class="bg-gray-100 px-2 py-0.5 rounded">${order.qty}</span></td>
                    <td class="p-4 font-semibold text-gray-700">${order.table}</td>
                    <td class="p-4 font-extrabold text-red-600">${order.price}</td>
                    <td class="p-4">
                        <span class="text-[10px] font-black px-2.5 py-0.5 rounded-full capitalize ${statusColor}">
                            ${order.status}
                        </span>
                    </td>
                    <td class="p-4 text-center">
                        <button onclick="deleteOrder(${order.id})" class="text-red-500 hover:text-red-700 font-bold px-2 py-1 rounded hover:bg-red-50 transition text-[11px] border-0 bg-transparent cursor-pointer" title="Permanently delete from log">
                            Delete
                        </button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        }

        // Render Administrative list of food catalog
        function renderAdminMenuList() {
            const list = document.getElementById('admin-menu-list');
            if (!list) return;
            list.innerHTML = '';

            (window.menuItems || []).forEach((item, index) => {
                const categoryEmojis = { main: '🍛', appetizer: '🍿', drink: '🍹' };
                const emoji = categoryEmojis[item.category] || '🍲';
                const row = document.createElement('div');
                row.className = "flex flex-col md:flex-row items-center justify-between p-4 rounded-xl border border-gray-250 gap-4 hover:bg-gray-50 transition";
                
                let isRice = checkIsRiceItem(item);
                let priceLabel = isRice ? '<span class="text-[10px] text-gray-400 block font-bold">Base Price (Quarter)</span>' : '';

                const isAvailable = item.available !== false;
                const toggleBtnClass = isAvailable
                    ? "bg-green-100 text-green-800 hover:bg-green-200 border border-green-300"
                    : "bg-red-100 text-red-800 hover:bg-red-200 border border-red-300";
                const toggleBtnText = isAvailable ? "🟢 In Stock" : "🔴 Sold Out";

                row.innerHTML = `
                    <div class="flex items-center gap-3 w-full md:w-auto flex-grow">
                        <span class="text-3xl bg-emerald-50 p-2 rounded-xl border">${emoji}</span>
                        <div class="flex-grow">
                            <span class="text-[10px] bg-green-100 text-green-800 font-bold px-2 py-0.5 rounded-full capitalize">${item.category === 'main' ? 'Main Course' : item.category === 'appetizer' ? 'Snack' : 'Beverage'}</span>
                            <h5 class="font-bold text-gray-800 text-base mt-1">${item.displayName}</h5>
                            <p class="text-xs text-gray-500 line-clamp-1">${item.desc}</p>
                        </div>
                    </div>
                    
                    <div class="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
                        <button onclick="toggleFoodAvailability(${item.id})" class="${toggleBtnClass} text-xs px-3.5 py-2 rounded-lg font-black transition whitespace-nowrap shadow-sm border-0 cursor-pointer" title="Toggle current stock level">
                            ${toggleBtnText}
                        </button>

                        <div class="flex flex-col items-end">
                            <div class="flex items-center gap-1.5">
                                <span class="text-xs text-gray-400 font-bold">Price:</span>
                                <input type="text" id="price-edit-${index}" value="${item.price}" class="w-24 border rounded-lg px-2.5 py-1.5 text-center text-sm focus:outline-none focus:border-green-600 font-bold font-mono">
                            </div>
                            ${priceLabel}
                        </div>
                        <div class="flex gap-1.5">
                            <button onclick="updateMenuDetails(${index})" class="bg-green-600 hover:bg-green-700 text-white text-xs px-4 py-2 rounded-lg font-bold transition border-0 cursor-pointer">Save</button>
                            <button onclick="openDeleteModal(${index})" class="bg-red-50 hover:bg-red-100 text-red-600 text-xs px-3 py-2 rounded-lg font-bold transition border-0 cursor-pointer">Delete</button>
                        </div>
                    </div>
                `;
                list.appendChild(row);
            });
        }

        window.toggleFoodAvailability = function(id) {
            if (window.toggleFoodAvailabilityCloud) {
                window.toggleFoodAvailabilityCloud(id);
                const item = window.menuItems.find(i => i.id === id);
                const availabilityText = (item.available !== false) ? "In Stock" : "Sold Out";
                showToast(`"${item.displayName}" status set to: ${availabilityText}!`, true);
            }
        }

        function addFoodItem() {
            const name = document.getElementById('add-food-name').value.trim();
            let price = document.getElementById('add-food-price').value.trim();
            const category = document.getElementById('add-food-category').value;
            const desc = document.getElementById('add-food-desc').value.trim();

            if (!name || !price || !desc) {
                showToast("Please fill in the food name, price, and descriptive text!", false);
                return;
            }

            if (!price.startsWith('₹')) price = '₹' + price;

            const newId = window.menuItems.length > 0 ? Math.max(...window.menuItems.map(item => item.id)) + 1 : 1;
            
            const newItem = { id: newId, displayName: name, price: price, category: category, desc: desc, available: true };

            if (window.addFoodItemCloud) {
                window.addFoodItemCloud(newItem);
                showToast(`"${name}" was successfully added to your digital menu!`, true);
            }

            document.getElementById('add-food-name').value = '';
            document.getElementById('add-food-price').value = '₹';
            document.getElementById('add-food-desc').value = '';
        }

        function updateMenuDetails(index) {
            const newPrice = document.getElementById(`price-edit-${index}`).value.trim();
            if (!newPrice) {
                showToast("Pricing cannot be left blank!", false);
                return;
            }
            const cleanPrice = newPrice.startsWith('₹') ? newPrice : '₹' + newPrice;
            const item = window.menuItems[index];

            if (window.updateMenuPriceCloud) {
                window.updateMenuPriceCloud(item.id, cleanPrice);
                showToast(`Saved changes for ${item.displayName}!`, true);
            }
        }

        function openDeleteModal(index) {
            window.itemIndexToDelete = index;
            const item = window.menuItems[index];
            document.getElementById('delete-item-name').innerText = item.displayName;
            document.getElementById('delete-confirm-modal').classList.remove('hidden');
        }

        function closeDeleteModal() {
            document.getElementById('delete-confirm-modal').classList.add('hidden');
            window.itemIndexToDelete = null;
        }

        function executeDeleteFoodItem() {
            if (window.itemIndexToDelete !== null) {
                const item = window.menuItems[window.itemIndexToDelete];
                if (window.deleteFoodItemCloud) {
                    window.deleteFoodItemCloud(item.id);
                    closeDeleteModal();
                    showToast(`"${item.displayName}" removed.`, true);
                }
            }
        }

        // Custom Table Scan-to-order QR Generator logic
        function generateCustomQRCode() {
            const rawLabel = document.getElementById('qr-table-label').value.trim();
            if (!rawLabel) {
                showToast("Enter a name/table identifier first!", false);
                return;
            }

            const currentURL = window.location.href.split('#')[0].split('?')[0];
            const qrLink = `${currentURL}?table=${encodeURIComponent(rawLabel)}#menu`;
            const encodedLink = encodeURIComponent(qrLink);
            const qrAPIUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodedLink}`;

            document.getElementById('generated-qr-img').src = qrAPIUrl;
            document.getElementById('qr-link-text').innerText = qrLink;
            document.getElementById('qr-result-box').classList.remove('hidden');

            showToast(`QR generated for: ${rawLabel}`, true);
        }

        function copyQRLinkToClipboard() {
            const linkText = document.getElementById('qr-link-text').innerText;
            if (!linkText) return;

            const el = document.createElement('textarea');
            el.value = linkText;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);

            showToast("Copied to clipboard!", true);
        }

        function checkURLParameters() {
            const urlParams = new URLSearchParams(window.location.search);
            const tableParam = urlParams.get('table');
            if (tableParam) {
                setTimeout(() => {
                    const tableInput = document.getElementById('order-table');
                    if (tableInput) {
                        tableInput.value = tableParam;
                    }
                    showView('menu');
                    showToast(`Welcome! Ready to order for: ${tableParam}`, true);
                }, 800);
            }
        }

        window.addEventListener('DOMContentLoaded', checkURLParameters);

        // Control system configuration state toggles
        function toggleKitchenStatus() {
            window.isKitchenOpen = !window.isKitchenOpen;
            saveSettingsToCloud();
            showToast(window.isKitchenOpen ? "Kitchen is Open!" : "Kitchen Closed.", true);
        }

        function toggleAlertSound() {
            window.isAlertSoundEnabled = !window.isAlertSoundEnabled;
            saveSettingsToCloud();
            showToast(window.isAlertSoundEnabled ? "Chime alerts active!" : "Chime muted.", true);
        }

        function toggleWhatsAppDispatch() {
            window.isWhatsAppDispatchEnabled = !window.isWhatsAppDispatchEnabled;
            saveSettingsToCloud();
            showToast(window.isWhatsAppDispatchEnabled ? "WhatsApp dispatcher enabled!" : "WhatsApp dispatcher disabled.", true);
        }

        function updateSettingsTabUI() {
            const kitchenBtn = document.getElementById('kitchen-status-btn');
            const soundBtn = document.getElementById('sound-status-btn');
            const waBtn = document.getElementById('whatsapp-dispatch-btn');

            if (!kitchenBtn || !soundBtn || !waBtn) return;

            if (window.isKitchenOpen) {
                kitchenBtn.innerText = "KITCHEN OPEN";
                kitchenBtn.className = "px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-full transition shadow-sm text-xs md:text-sm whitespace-nowrap border-0 cursor-pointer";
            } else {
                kitchenBtn.innerText = "KITCHEN CLOSED";
                kitchenBtn.className = "px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-full transition shadow-sm text-xs md:text-sm whitespace-nowrap border-0 cursor-pointer";
            }

            if (window.isAlertSoundEnabled) {
                soundBtn.innerText = "ALERT CHIME ACTIVE";
                soundBtn.className = "px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-full transition shadow-sm text-xs md:text-sm whitespace-nowrap border-0 cursor-pointer";
            } else {
                soundBtn.innerText = "ALERT CHIME SILENT";
                soundBtn.className = "px-5 py-2.5 bg-gray-500 hover:bg-gray-655 text-white font-bold rounded-full transition shadow-sm text-xs md:text-sm whitespace-nowrap border-0 cursor-pointer";
            }

            if (window.isWhatsAppDispatchEnabled) {
                waBtn.innerText = "DISPATCH ACTIVE";
                waBtn.className = "px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-full transition shadow-sm text-xs md:text-sm whitespace-nowrap border-0 cursor-pointer";
            } else {
                waBtn.innerText = "DISPATCH DISABLED";
                waBtn.className = "px-5 py-2.5 bg-gray-500 hover:bg-gray-655 text-white font-bold rounded-full transition shadow-sm text-xs md:text-sm whitespace-nowrap border-0 cursor-pointer";
            }
        }

        function changeAdminPassword() {
            const newPass = document.getElementById('new-admin-password').value.trim();
            const confirmPass = document.getElementById('confirm-admin-password').value.trim();

            if (!newPass) {
                showToast("Password cannot be blank!", false);
                return;
            }

            if (newPass !== confirmPass) {
                showToast("Passwords do not match!", false);
                return;
            }

            window.adminPassword = newPass;
            saveSettingsToCloud();
            document.getElementById('new-admin-password').value = '';
            document.getElementById('confirm-admin-password').value = '';
            showToast("Password updated successfully!", true);
        }

        // Run application on launch
        window.onload = function() {
            const syncIdInput = document.getElementById('sync-room-id');
            if (syncIdInput) {
                syncIdInput.value = window.syncRoomId;
            }
            loadLocalStorageBackup();
            initP2PSync();

            // Set recurring cycle to recalculate relative durations on the board
            setInterval(() => {
                const adminView = document.getElementById('admin-view');
                if (adminView && !adminView.classList.contains('hidden')) {
                    renderAdminOrders();
                }
            }, 30000);
        };
    </script>
</body>
</html>
