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
window.sunchaliceActive = false; // サンチャリスのクールタイム短縮フラグ

function resetAbilities() {
    window.fbBonusDamage = 0;
    window.crescentPercent = 5.0;
    window.sunchaliceActive = false;
    window.activeBurnIntervals.forEach(clearInterval);
    window.activeBurnIntervals = [];
}

// --- 聖遺物発動ロジック ---
function executeRelicAbility(relicName) {
    if (bossData.isDefeated || bossData.playerCurrentHp <= 0) return;

    if (!playerInventory || !playerInventory[relicName] || playerInventory[relicName] <= 0) {
        logBattle(`【エラー】「${relicName}」を所持していないため発動できません！`);
        return;
    }

    playerInventory[relicName] -= 1;
    if (playerInventory[relicName] <= 0) {
        delete playerInventory[relicName];
    }
    
    if (typeof syncPlayerState === 'function') syncPlayerState();
    if (typeof renderInventory === 'function') renderInventory();

    logBattle(`【消費】「${relicName}」の力を解放した！（残り: ${playerInventory[relicName] || 0}個）`);

    // boss.jsの統合ダメージ関数を呼ぶヘルパー
    const dealBossDmg = (amount, isAoe) => {
        if (typeof window.dealDamageToBoss === 'function') {
            window.dealDamageToBoss(amount, isAoe, 'relic', relicName);
        }
    };

    switch(relicName) {
        case "ドーンロッド":
            dealBossDmg(300, true); // 範囲(全体)ダメージ
            break;
        case "ピュアブレード":
            dealBossDmg(600, false); // 単体ダメージ
            break;
        case "シルバーナイト":
            let totalDmg = 0;
            // 本体のHPの0.2%を5回
            for (let i = 0; i < 5; i++) {
                let dmg = Math.floor(bossData.currentHp * 0.002);
                dealBossDmg(dmg, false); // 1発ずつ単体ダメージとして処理(分身に飛ぶ可能性あり)
            }
            break;
        case "サンチャリス":
            window.sunchaliceActive = true;
            logBattle("クールタイム短縮効果が発動した！(全スキルのCT30%短縮)");
            break;
        case "フェイトスピア":
            logBattle("全体に燃焼を付与した！（10分間、30ダメージ/10秒）");
            startBurn(30, 10000, 600000); 
            break;
        case "ブラッディ":
            window.fbBonusDamage += 100; 
            logBattle(`ファイヤーボールの威力が上昇した！（追加ダメージ: +${window.fbBonusDamage}）`);
            break;
        case "ステラアリア":
            bossData.evasion = 0; 
            logBattle("敵のバフを解除し、攻撃力を40%低下させた！(回避率も0にリセット)");
            break;
        case "クレセント":
            let pctDmg = Math.floor(bossData.currentHp * (window.crescentPercent / 100));
            dealBossDmg(pctDmg, false); // 単体
            window.crescentPercent = Math.max(0.2, window.crescentPercent - 1.0);
            break;
        case "秩序の双輝刃":
            logBattle("敵に永続の燃焼を付与した！（5ダメージ/10秒）");
            startBurn(5, 10000, null); 
            break;
    }
}

// デバフとしての燃焼処理
function startBurn(damage, intervalMs, durationMs) {
    const burnTimer = setInterval(() => {
        if (bossData.isDefeated) {
            clearInterval(burnTimer);
            return;
        }
        // 燃焼は貫通ダメージとして処理（バフの影響を受けない）
        bossData.currentHp -= damage;
        if (bossData.currentHp < 0) bossData.currentHp = 0;
        
        logBattle(`【燃焼】ボスに ${damage} のダメージ！`);
        updateBossUI();
        
        if (bossData.currentHp <= 0) {
            // boss.js内のdefeatBossを強引に呼ぶ
            if (typeof window.dealDamageToBoss === 'function') {
                window.dealDamageToBoss(0, true, 'burn', '燃焼'); // 死亡判定チェックを促す
            }
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

function getSharedSavings() {
    return parseInt(localStorage.getItem('shared_savings_pool')) || 0;
}
function setSharedSavings(val) {
    localStorage.setItem('shared_savings_pool', val);
}
function getSharedChallengers() {
    return parseInt(localStorage.getItem('shared_savings_challengers')) || 0;
}
function addSharedChallenger() {
    let c = getSharedChallengers();
    localStorage.setItem('shared_savings_challengers', c + 1);
}

// 持ち物の描画
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
        const iconHtml = itemData.icon ? `<i class="item-icon ${itemData.icon}"></i>` : '';

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
        }

        li.innerHTML = `
            <div class="item-main">
                <span>${iconHtml}${name} <small>(所持: ${qty}個)</small></span>
                ${useBtnHtml}
            </div>
            ${descHtml ? `<div class="item-desc">${descHtml}</div>` : ''}
        `;
        list.appendChild(li);
    }
}

// 猫アイテムの使用
function useCatItem(itemName) {
    if (!playerInventory[itemName] || playerInventory[itemName] <= 0) return;
    
    playerInventory[itemName] -= 1;
    if (playerInventory[itemName] <= 0) delete playerInventory[itemName];

    if (typeof syncPlayerState === 'function') syncPlayerState();

    let currentGold = getCurrentGold();

    if (itemName === "博打猫") {
        const isWin = Math.random() < 0.30; 
        if (isWin) {
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
        const isWin = Math.random() < 0.01; 

        if (isWin) {
            updateGoldLocally(currentGold + pool); 
            setSharedSavings(0); 
            alert(`【超大当たり！！！】\n貯金猫に貯まった ${pool} G をすべて獲得しました！`);
        } else {
            alert(`【ハズレ...】\n何も起きなかった...。`);
        }
    }

    renderMainInventory(); 
}