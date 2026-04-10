function getLogicalDateString() {
    const now = new Date();
    if (now.getHours() < 5) {
        now.setDate(now.getDate() - 1);
    }
    return now.toDateString();
}

function getLogicalDay() {
    const now = new Date();
    if (now.getHours() < 5) {
        now.setDate(now.getDate() - 1);
    }
    return now.getDay();
}

let cart = {}; 
let playerInventory = {}; 
let catalog = {}; 

async function init() {
    const response = await fetch('/api/me');
    const data = await response.json();

    if (data.loggedIn) {
        document.getElementById("player-name").innerText = data.user.name;
        document.getElementById("player-gold").innerText = data.user.gold;
        playerInventory = data.user.inventory || {}; 
        
        document.getElementById("login-container").style.display = "none";
        document.getElementById("player-info").style.display = "block";
        
        document.getElementById("main-menu").style.display = "block";
        document.getElementById("shop-container").style.display = "none";
        
        loadShopItems(); 
        
        if (typeof checkBankPenalties === 'function') {
            checkBankPenalties();
        }

        let pending = parseInt(localStorage.getItem('pendingReward') || '0');
        if (pending > 0) {
            try {
                const r = await fetch('/api/boss_reward', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reward: pending })
                });
                const res = await r.json();
                if (res.success) {
                    alert(`【未受け取り報酬】\n前回受け取れなかったボス討伐報酬 ${pending} G を無事に獲得しました！`);
                    document.getElementById("player-gold").innerText = res.newGold;
                    localStorage.removeItem('pendingReward'); // 受け取ったらリセット
                }
            } catch(e) {
                console.error("未受け取り報酬の付与に失敗しました");
            }
        }

    } else {
        document.getElementById("login-container").style.display = "block";
    }
}

function login() { window.location.href = '/api/login'; }

function goToShop() {
    document.getElementById("main-menu").style.display = "none";
    document.getElementById("shop-container").style.display = "block";
}

function goToMenu() {
    document.getElementById("shop-container").style.display = "none";
    document.getElementById("main-menu").style.display = "block";
}

function goToMainInventory() {
    document.getElementById("main-menu").style.display = "none";
    document.getElementById("main-inventory-container").style.display = "block";
    if (typeof renderMainInventory === 'function') renderMainInventory();
}

function returnToMenuFromMainInventory() {
    document.getElementById("main-inventory-container").style.display = "none";
    document.getElementById("main-menu").style.display = "block";
}

function goToBank() {
    document.getElementById("main-menu").style.display = "none";
    document.getElementById("bank-container").style.display = "block";
    if (typeof renderBankUI === 'function') renderBankUI();
}

function returnToMenuFromBank() {
    document.getElementById("bank-container").style.display = "none";
    document.getElementById("main-menu").style.display = "block";
}

function switchTab(tabName) {
    document.getElementById('items-view').style.display = tabName === 'items' ? 'block' : 'none';
    document.getElementById('weapons-view').style.display = tabName === 'weapons' ? 'block' : 'none';
    document.getElementById('others-view').style.display = tabName === 'others' ? 'block' : 'none';
    document.getElementById('inventory-view').style.display = tabName === 'inventory' ? 'block' : 'none';
    
    document.querySelectorAll('#shop-container .tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');

    if(tabName === 'inventory') renderInventory();
}

async function loadShopItems() {
    const [itemRes, weaponRes, otherRes] = await Promise.all([
        fetch('/api/items'), fetch('/api/weapons'), fetch('/api/others')
    ]);
    const items = await itemRes.json();
    const weapons = await weaponRes.json();
    const others = await otherRes.json();

    const createListItem = (item) => {
        catalog[item.name] = item; 
        
        const li = document.createElement("li");
        li.className = "shop-item";

        const descHtml = item.desc ? item.desc.replace(/\n/g, '<br>') : '';
        const iconHtml = item.icon ? `<i class="item-icon ${item.icon}"></i>` : '';

        // 所持上限がある場合は表示に追加
        let limitText = "";
        if (item.maxQty !== undefined) {
            limitText = ` <small style="color:#ffaa00;">(上限:${item.maxQty}個)</small>`;
        }

        li.innerHTML = `
            <div class="item-main">
                <span class="item-name">${iconHtml}${item.name}${limitText}</span>
                <span class="item-price">${item.price} G</span>
                <button onclick="addToCart('${item.name}', ${item.price})" title="カートに入れる"><i class="icon icon-cart"></i></button>
            </div>
            ${descHtml ? `<div class="item-desc">${descHtml}</div>` : ''}
        `;
        return li;
    };

    const itemList = document.getElementById("item-list");
    const weaponList = document.getElementById("weapon-list");
    const otherList = document.getElementById("other-list");
    
    itemList.innerHTML = ""; weaponList.innerHTML = ""; otherList.innerHTML = "";
    items.forEach(i => itemList.appendChild(createListItem(i)));
    weapons.forEach(w => weaponList.appendChild(createListItem(w)));
    others.forEach(o => otherList.appendChild(createListItem(o)));
}

function addToCart(name, price) {
    if (!cart[name]) {
        cart[name] = { price: price, quantity: 0 };
    }
    
    let catItem = catalog[name];
    let maxLimit = (catItem && catItem.maxQty !== undefined) ? catItem.maxQty : 99;
    let currentInv = playerInventory[name] || 0;
    
    if (currentInv + cart[name].quantity + 1 > maxLimit) {
        alert(`これ以上追加できません！ (所持制限: ${maxLimit}個)`);
        if (cart[name].quantity === 0) delete cart[name];
        return;
    }
    
    cart[name].quantity++;
    renderCart();
}

function changeQty(name, amount) {
    if (cart[name]) {
        let catItem = catalog[name];
        let maxLimit = (catItem && catItem.maxQty !== undefined) ? catItem.maxQty : 99;
        let currentInv = playerInventory[name] || 0;
        
        if (amount > 0 && currentInv + cart[name].quantity + amount > maxLimit) {
            alert(`これ以上追加できません！ (所持制限: ${maxLimit}個)`);
            return;
        }
        
        cart[name].quantity += amount;
        if (cart[name].quantity <= 0) delete cart[name];
    }
    renderCart();
}

function renderCart() {
    const list = document.getElementById("cart-list");
    list.innerHTML = "";
    let total = 0;
    for (const [name, item] of Object.entries(cart)) {
        total += item.price * item.quantity;
        const li = document.createElement("li");
        li.className = "item-main"; 
        li.innerHTML = `
            <span>${name} <br><small>(${item.price}G)</small></span>
            <span class="cart-qty-area">
                <button class="qty-btn" onclick="changeQty('${name}', -1)">-</button>
                ${item.quantity} 個
                <button class="qty-btn" onclick="changeQty('${name}', 1)">+</button>
            </span>
        `;
        list.appendChild(li);
    }
    document.getElementById("cart-total-price").innerText = total;
}

async function checkout() {
    if (Object.keys(cart).length === 0) { alert("カートは空っぽだ！"); return; }
    const response = await fetch('/api/buy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: cart })
    });
    const result = await response.json();
    if (result.success) {
        alert(result.message);
        document.getElementById("player-gold").innerText = result.newGold;
        playerInventory = result.newInventory; 
        cart = {}; renderCart(); renderInventory();
        if(typeof renderMainInventory === 'function') renderMainInventory();
    } else {
        alert(result.message);
    }
}

function renderInventory() {
    const list = document.getElementById("inventory-list");
    list.innerHTML = "";
    
    if (Object.keys(playerInventory).length === 0) {
        list.innerHTML = "<li style='text-align:center;'>なにも持っていないようだ...</li>";
        return;
    }

    for (const [name, qty] of Object.entries(playerInventory)) {
        const itemData = catalog[name] || { price: 20, desc: "" }; 
        const sellPrice = Math.max(1, Math.floor(itemData.price / 20));
        const descHtml = itemData.desc ? itemData.desc.replace(/\n/g, '<br>') : '';
        const iconHtml = itemData.icon ? `<i class="item-icon ${itemData.icon}"></i>` : '';

        const li = document.createElement("li");
        li.className = "shop-item";
        li.innerHTML = `
            <div class="item-main">
                <span>${iconHtml}${name} <small>(所持: ${qty}個)</small><br><small style="color:#aaa;">売値: ${sellPrice}G</small></span>
                <button class="sell-btn" onclick="sellItem('${name}', ${sellPrice})">1個売る</button>
            </div>
            ${descHtml ? `<div class="item-desc">${descHtml}</div>` : ''}
        `;
        list.appendChild(li);
    }
}

async function sellItem(itemName, sellPrice) {
    const response = await fetch('/api/sell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: itemName })
    });
    const result = await response.json();
    
    if (result.success) {
        document.getElementById("player-gold").innerText = result.newGold;
        playerInventory = result.newInventory; 
        renderInventory(); 
        if(typeof renderMainInventory === 'function') renderMainInventory();
    } else {
        alert(result.message);
    }
}

function getCurrentGold() {
    return parseInt(document.getElementById("player-gold").innerText) || 0;
}

async function syncPlayerState() {
    let currentGold = getCurrentGold();
    try {
        await fetch('/api/update_player', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gold: currentGold, inventory: playerInventory })
        });
    } catch(e) { console.error("同期エラー:", e); }
}

function updateGoldLocally(amount) {
    document.getElementById("player-gold").innerText = amount;
    syncPlayerState();
}

// =========================================
// 管理者画面のロジック
// =========================================
function checkAdmin() {
    const pass = document.getElementById('admin-pass').value;
    if (pass === 'がうるぐら') {
        document.getElementById('main-menu').style.display = 'none';
        document.getElementById('admin-container').style.display = 'block';
        updateAdminShopDropdown();
        document.getElementById('admin-pass').value = '';
    } else {
        alert("パスワードが違います！");
    }
}

function returnToMenuFromAdmin() {
    document.getElementById('admin-container').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
}

function updateAdminShopDropdown() {
    const select = document.getElementById('admin-shop-item-select');
    select.innerHTML = '';
    for (const name of Object.keys(catalog)) {
        const option = document.createElement('option');
        option.value = name;
        option.innerText = name;
        select.appendChild(option);
    }
}

function adminSetGold() {
    const gold = parseInt(document.getElementById('admin-player-gold').value);
    if (!isNaN(gold)) {
        updateGoldLocally(gold);
        alert(`所持Gを ${gold} に設定しました。`);
    }
}

async function adminSetShopItem() {
    const name = document.getElementById('admin-shop-item-select').value;
    const priceStr = document.getElementById('admin-shop-price').value;
    const qtyStr = document.getElementById('admin-shop-qty').value;

    let requestData = { name: name, price: priceStr, maxQty: qtyStr };

    if (priceStr !== '' || qtyStr !== '') {
        const response = await fetch('/api/admin/shop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestData)
        });
        const result = await response.json();
        
        if (result.success) {
            alert(`${name} の設定をサーバーに保存しました！`);
            document.getElementById('admin-shop-price').value = '';
            document.getElementById('admin-shop-qty').value = '';
            // ★最新のDB情報を読み込み直す
            loadShopItems(); 
        } else {
            alert("エラー：保存に失敗しました。");
        }
    } else {
        alert("設定する項目を入力してください。");
    }
}

window.onload = init;