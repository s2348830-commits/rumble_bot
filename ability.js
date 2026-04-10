// 聖遺物のデータ
const relicsData = [
    { name: "ドーンロッド",   bgX: "0%",   bgY: "0%" },
    { name: "ピュアブレード", bgX: "50%",  bgY: "0%" },
    { name: "シルバーナイト", bgX: "100%", bgY: "0%" },
    { name: "サンチャリス",   bgX: "0%",   bgY: "50%" },
    { name: "フェイトスピア", bgX: "50%",  bgY: "50%" },
    { name: "ブラッディ",     bgX: "100%", bgY: "50%" },
    { name: "ステラアリア",   bgX: "0%",   bgY: "100%" },
    { name: "クレセント",     bgX: "50%",  bgY: "100%" },
    { name: "秩序の双輝刃",   bgX: "100%", bgY: "100%" }
];

window.fbBonusDamage = 0;
window.crescentPercent = 5.0; 
window.activeBurnIntervals = [];
window.sunchaliceActive = false; 

function resetAbilities() {
    window.activeBurnIntervals.forEach(clearInterval);
    window.activeBurnIntervals = [];
}

// --- 聖遺物発動ロジック ---
function executeRelicAbility(relicName, pName = "誰か") {
    if (bossData.isDefeated || bossData.playerCurrentHp <= 0) return;

    if (!playerInventory || !playerInventory[relicName] || playerInventory[relicName] <= 0) {
        logBattle(`【エラー】「${relicName}」を所持していないため発動できません！`, true);
        return;
    }

    playerInventory[relicName] -= 1;
    if (playerInventory[relicName] <= 0) {
        delete playerInventory[relicName];
    }
    
    if (typeof syncPlayerState === 'function') syncPlayerState();
    if (typeof renderInventory === 'function') renderInventory();

    logBattle(`【消費】${pName}が「${relicName}」の力を解放した！`, false);

    const dealBossDmg = (amount, isAoe) => {
        if (typeof window.dealDamageToBoss === 'function') {
            window.dealDamageToBoss(amount, isAoe, 'relic', relicName, pName);
        }
    };

    switch(relicName) {
        case "ドーンロッド":
            dealBossDmg(300, true); 
            break;
        case "ピュアブレード":
            dealBossDmg(600, false); 
            break;
        case "シルバーナイト":
            for (let i = 0; i < 5; i++) {
                let dmg = Math.floor(bossData.currentHp * 0.002);
                dealBossDmg(dmg, false); 
            }
            break;
        case "サンチャリス":
            sendBossAction('apply_buff', 0, { sunchaliceUntil: Date.now() + 15 * 60 * 1000 }); 
            logBattle(`【効果】${pName}により、クールタイム短縮効果が発動した！(全プレイヤーの全スキルのCT30%短縮、15分間有効)`, false);
            break;
        case "フェイトスピア":
            logBattle(`【効果】${pName}が全体に燃焼を付与した！（10分間、30ダメージ/10秒）`, false);
            startBurn(30, 10000, 600000); 
            break;
        case "ブラッディ":
            let newBonus = (window.fbBonusDamage || 0) + 100;
            sendBossAction('apply_buff', 0, { fbBonusDamage: newBonus, bloodyUntil: Date.now() + 20 * 60 * 1000 });
            logBattle(`【効果】${pName}により、全プレイヤーのファイヤーボールの威力が上昇した！（追加ダメージ: +${newBonus}、20分間有効）`, false);
            break;
        case "ステラアリア":
            sendBossAction('apply_buff', 0, { bossEvasion: 0 });
            logBattle(`【効果】${pName}が敵のバフを解除し、攻撃力を40%低下させた！(回避率も0にリセット)`, false);
            break;
        case "クレセント":
            let currentPct = window.crescentPercent || 5.0;
            let pctDmg = Math.floor(bossData.currentHp * (currentPct / 100));
            dealBossDmg(pctDmg, false); 
            sendBossAction('apply_buff', 0, { crescentPercent: Math.max(0.2, currentPct - 1.0) });
            break;
        case "秩序の双輝刃":
            logBattle(`【効果】${pName}が敵に永続の燃焼を付与した！（5ダメージ/10秒）`, false);
            startBurn(5, 10000, null); 
            break;
    }
}

function startBurn(damage, intervalMs, durationMs) {
    const burnTimer = setInterval(() => {
        if (bossData.isDefeated) {
            clearInterval(burnTimer);
            return;
        }
        if (typeof sendBossAction === 'function') {
            sendBossAction('damage_boss', damage);
            logBattle(`【燃焼】ボスに ${damage} のダメージ！`, false);
        }
    }, intervalMs);

    window.activeBurnIntervals.push(burnTimer);

    if (durationMs) {
        setTimeout(() => {
            clearInterval(burnTimer);
            window.activeBurnIntervals = window.activeBurnIntervals.filter(t => t !== burnTimer);
        }, durationMs);
    }
}

// =========================================
// メインメニューの「持ち物」と猫アイテム処理
// =========================================

function getSharedSavings() { return parseInt(localStorage.getItem('shared_savings_pool')) || 0; }
function setSharedSavings(val) { localStorage.setItem('shared_savings_pool', val); }
function getSharedChallengers() { return parseInt(localStorage.getItem('shared_savings_challengers')) || 0; }
function addSharedChallenger() { localStorage.setItem('shared_savings_challengers', getSharedChallengers() + 1); }

function renderMainInventory() {
    const list = document.getElementById("main-inventory-list");
    list.innerHTML = "";
    if (Object.keys(playerInventory).length === 0) {
        list.innerHTML = "<li style='text-align:center;'>なにも持っていないようだ...</li>";
        return;
    }
    const pool = getSharedSavings();
    const challengers = getSharedChallengers();
    for (const [name, qty] of Object.entries(playerInventory)) {
        if (qty <= 0) continue;
        let itemData = catalog[name] || { desc: "" }; 
        let descHtml = itemData.desc ? itemData.desc.replace(/\n/g, '<br>') : '';
        
        // ★修正：特別アイテム用の画像アイコン判定
        let iconHtml = '';
        if (typeof specialItemIcons !== 'undefined' && specialItemIcons[name]) {
            iconHtml = `<i class="${specialItemIcons[name]}" style="margin-right: 10px; vertical-align: middle;"></i>`;
        } else if (itemData.icon) {
            iconHtml = `<i class="item-icon ${itemData.icon}"></i>`;
        }

        if (name === "貯金猫") {
            descHtml = `1%の確率で貯金が全額手に入る。<br><br><span style="color:#4CAF50; font-weight:bold;">【現在の貯金状況】</span><br>総額: ${pool} G<br>挑戦人数: ${challengers} 人`;
        }
        
        const li = document.createElement("li");
        li.className = "shop-item";
        let useBtnHtml = "";
        
        if (name === "博打猫" || name === "貯金猫") {
            useBtnHtml = `<button class="use-item-btn" onclick="useCatItem('${name}')">使う</button>`;
        } else if (relicsData.some(r => r.name === name)) {
            useBtnHtml = `<span style="font-size:0.8em; color:#aaa;">(戦闘中のみ使用可能)</span>`;
        } else if (typeof specialItemIcons !== 'undefined' && specialItemIcons[name]) {
            // 特別アイテムは使用不可（市場で売却）であることを表示
            useBtnHtml = `<span style="font-size:0.8em; color:#ffcc00;">(特別市場で売却可能)</span>`;
        }
        
        let giftBtnHtml = `<button class="use-item-btn" style="background-color: #9c27b0; margin-left: 5px; padding: 5px 10px; font-size: 0.9em;" onclick="openGiftPrompt('${name}', ${qty})">🎁 ギフト</button>`;

        li.innerHTML = `
            <div class="item-main">
                <span>${iconHtml}${name} <small>(所持: ${qty}個)</small></span>
                <div style="display: flex; gap: 5px; align-items: center;">
                    ${useBtnHtml}
                    ${giftBtnHtml}
                </div>
            </div>
            ${descHtml ? `<div class="item-desc">${descHtml}</div>` : ''}
        `;
        list.appendChild(li);
    }
}

function openGiftPrompt(itemName, maxQty) {
    const targetName = prompt(`【${itemName}】を誰に送りますか？\n相手のプレイヤー名を入力してください:`);
    if (!targetName) return;
    
    const amountStr = prompt(`何個送りますか？ (最大 ${maxQty} 個)`);
    if (!amountStr) return;
    const amount = parseInt(amountStr);
    
    if (isNaN(amount) || amount <= 0 || amount > maxQty) {
        alert("正しい個数を入力してください。");
        return;
    }
    
    sendGiftToServer(targetName, itemName, amount);
}

async function sendGiftToServer(targetName, itemName, amount) {
    try {
        const response = await fetch('/api/gift', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetName, itemName, amount })
        });
        const result = await response.json();
        
        if (result.success) {
            alert(`${targetName} に ${itemName} を ${amount}個 送りました！`);
            playerInventory = result.newInventory;
            renderMainInventory();
            if (typeof renderInventory === 'function') renderInventory();
        } else {
            alert("エラー: " + result.message);
        }
    } catch(e) {
        alert("通信エラーが発生しました。");
    }
}

function useCatItem(itemName) {
    if (!playerInventory[itemName] || playerInventory[itemName] <= 0) return;
    playerInventory[itemName] -= 1;
    if (playerInventory[itemName] <= 0) delete playerInventory[itemName];
    if (typeof syncPlayerState === 'function') syncPlayerState();
    let currentGold = getCurrentGold();
    if (itemName === "博打猫") {
        if (Math.random() < 0.30) {
            updateGoldLocally(currentGold * 2);
            alert(`【大勝利！】Gが2倍になった！\n(${currentGold} G ➔ ${currentGold * 2} G)`);
        } else {
            let pool = getSharedSavings();
            setSharedSavings(pool + currentGold);
            addSharedChallenger();
            updateGoldLocally(0); 
            alert(`【ハズレ...】\n所持金がすべて没収され、貯金猫のプールに送られました...`);
        }
    } 
    else if (itemName === "貯金猫") {
        addSharedChallenger();
        const pool = getSharedSavings();
        if (Math.random() < 0.01) {
            updateGoldLocally(currentGold + pool); 
            setSharedSavings(0); 
            alert(`【超大当たり！！！】\n貯金猫に貯まった ${pool} G をすべて獲得しました！`);
        } else {
            alert(`【ハズレ...】\n何も起きなかった...。`);
        }
    }
    renderMainInventory(); 
}