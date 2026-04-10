let currentBankTab = 'lump'; 
let bankState = {
    active: false,
    type: null,
    borrowed: 0,
    totalRepayment: 0,
    dailyRepayment: 0,
    daysLeft: 0,
    lastUpdateDate: null,
    lastRepaymentDate: null 
};

// ★追加：銀行データをDBと同期する関数
async function syncBankState() {
    try {
        await fetch('/api/bank/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bankState: bankState })
        });
    } catch(e) { console.error("銀行同期エラー:", e); }
}

function drawBankGraph(containerId, borrowed, totalRepay, days) {
    const svgWidth = "100%";
    const svgHeight = 120;
    const maxVal = 200000; 
    const padding = 20;
    
    const getY = (val) => svgHeight - padding - ((val / maxVal) * (svgHeight - padding * 2));

    const yBorrowed = getY(borrowed);
    const yRepayEnd = getY(totalRepay);
    const yRepayStart = getY(borrowed);

    const svgHtml = `
        <svg width="${svgWidth}" height="${svgHeight}" style="background:#222; border:1px solid #555; border-radius:4px;">
            <line x1="10" y1="${svgHeight - padding}" x2="98%" y2="${svgHeight - padding}" stroke="#777" stroke-width="1" />
            <line x1="10" y1="10" x2="10" y2="${svgHeight - padding}" stroke="#777" stroke-width="1" />
            
            <line x1="10" y1="${yBorrowed}" x2="98%" y2="${yBorrowed}" stroke="#4CAF50" stroke-width="3" stroke-dasharray="5,5" />
            <text x="15" y="${yBorrowed - 5}" fill="#4CAF50" font-size="11" font-weight="bold">借入: ${borrowed} G</text>

            <line x1="10" y1="${yRepayStart}" x2="98%" y2="${yRepayEnd}" stroke="#ff4444" stroke-width="3" />
            <text x="65%" y="${yRepayEnd - 5}" fill="#ff4444" font-size="11" font-weight="bold">返済: ${totalRepay} G</text>
        </svg>
    `;
    
    document.getElementById(containerId).innerHTML = svgHtml;
}

function switchBankTab(tabName) {
    currentBankTab = tabName;
    document.querySelectorAll('#bank-container .tab-btn').forEach(btn => btn.classList.remove('active'));
    
    if (tabName === 'lump') {
        document.getElementById('tab-bank-lump').classList.add('active');
    } else if (tabName === 'installment') {
        document.getElementById('tab-bank-install').classList.add('active');
    } else if (tabName === 'invest') {
        document.getElementById('tab-bank-invest').classList.add('active');
    }

    renderBankUI();
}

function renderBankUI() {
    const area = document.getElementById('bank-content-area');
    
    if (currentBankTab === 'invest') {
        area.innerHTML = `
            <div id="treasure-market-container">
                <p style="text-align:center; color:#ccc;">市場データを読み込み中...</p>
            </div>
        `;
        if (typeof initTreasureMarket === 'function') {
            initTreasureMarket();
        }
        return;
    }

    if (bankState.active) {
        if (bankState.type !== currentBankTab) {
            area.innerHTML = `<p style="text-align:center; color:#ffcc00;">現在別のプランで借入中です。<br>先にそちらを返済してください。</p>`;
            return;
        }

        let repayAmountText = bankState.type === 'lump' ? `${bankState.totalRepayment} G (一括)` : `${bankState.dailyRepayment} G (本日の分割分)`;

        const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
        const isPaidToday = (bankState.type === 'installment' && bankState.lastRepaymentDate === todayStr);
        
        const btnStyle = isPaidToday ? "background-color: #555; cursor: not-allowed;" : "background-color: #4CAF50;";
        const btnText = isPaidToday ? "本日は返済済み" : "支払う";
        const btnDisabled = isPaidToday ? "disabled" : "";

        area.innerHTML = `
            <div id="bank-graph-container" style="margin-bottom: 15px;"></div>
            <div style="font-size: 1.1em; margin-bottom: 10px;">
                残り期間： <span style="color:#ffcc00; font-weight:bold;">${bankState.daysLeft} 日</span>
            </div>
            <div style="font-size: 1.1em; margin-bottom: 20px;">
                返す金額： <span style="color:#ff4444; font-weight:bold;">${repayAmountText}</span>
            </div>
            <button class="join-btn" style="width: 100%; ${btnStyle}" onclick="payBank()" ${btnDisabled}>${btnText}</button>
        `;

        drawBankGraph("bank-graph-container", bankState.borrowed, bankState.totalRepayment, bankState.daysLeft);

    } else {
        area.innerHTML = `
            <div id="bank-graph-container" style="margin-bottom: 15px;"></div>
            
            <div class="bank-control-row">
                <input type="number" id="bank-input" class="bank-input" min="1000" max="100000" step="1000" value="10000" oninput="syncBankInput('input')">
                <input type="range" id="bank-slider" class="bank-slider" min="1000" max="100000" step="1000" value="10000" oninput="syncBankInput('slider')">
            </div>
            
            <div class="bank-control-row">
                <span>返す期間:</span>
                <select id="bank-days" class="bank-input" onchange="updateBankPreview()">
                    <option value="1">1日</option>
                    <option value="2">2日</option>
                    <option value="3">3日</option>
                    <option value="4">4日</option>
                    <option value="5">5日</option>
                    <option value="6">6日</option>
                    <option value="7">7日</option>
                </select>
            </div>

            <div id="bank-daily-preview" style="display: ${currentBankTab === 'installment' ? 'block' : 'none'}; color: #aaa; margin-bottom: 10px;">
                1日ごとの返済金額: <span id="bank-daily-val" style="color:#fff;">0 G</span>
            </div>

            <div style="display:flex; justify-content:space-between; margin-bottom: 20px; font-weight:bold;">
                <span>借入: <span id="bank-borrow-val" style="color:#4CAF50;">10000 G</span></span>
                <span>合計利子: <span id="bank-interest-val" style="color:#ff4444;">0 G</span></span>
            </div>

            <button class="join-btn" style="width: 100%;" onclick="borrowFromBank()">借りる</button>
        `;
        updateBankPreview();
    }
}

function syncBankInput(source) {
    let val = 10000;
    if (source === 'input') {
        val = document.getElementById('bank-input').value;
        document.getElementById('bank-slider').value = val;
    } else {
        val = document.getElementById('bank-slider').value;
        document.getElementById('bank-input').value = val;
    }
    updateBankPreview();
}

function updateBankPreview() {
    const borrowed = parseInt(document.getElementById('bank-slider').value) || 0;
    const days = parseInt(document.getElementById('bank-days').value) || 1;
    
    let interestRate = 0;
    if (currentBankTab === 'lump') {
        interestRate = 0.10 + (0.05 * days);
    } 
    else if (currentBankTab === 'installment') {
        interestRate = 0.20 + (0.10 * days);
    }

    const interest = Math.floor(borrowed * interestRate);
    const totalRepay = borrowed + interest;

    document.getElementById('bank-borrow-val').innerText = `${borrowed} G`;
    document.getElementById('bank-interest-val').innerText = `${interest} G`;

    if (currentBankTab === 'installment') {
        const daily = Math.floor(totalRepay / days);
        document.getElementById('bank-daily-val').innerText = `${daily} G`;
    }

    drawBankGraph("bank-graph-container", borrowed, totalRepay, days);
}

function borrowFromBank() {
    const borrowed = parseInt(document.getElementById('bank-slider').value) || 0;
    const days = parseInt(document.getElementById('bank-days').value) || 1;
    
    if (borrowed <= 0 || borrowed > 100000) {
        alert("1,000 G から 100,000 G の間で指定してください。");
        return;
    }

    let interestRate = currentBankTab === 'lump' ? (0.10 + (0.05 * days)) : (0.20 + (0.10 * days));
    const interest = Math.floor(borrowed * interestRate);
    const totalRepay = borrowed + interest;
    const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();

    bankState = {
        active: true,
        type: currentBankTab,
        borrowed: borrowed,
        totalRepayment: totalRepay,
        dailyRepayment: currentBankTab === 'installment' ? Math.floor(totalRepay / days) : 0,
        daysLeft: days,
        lastUpdateDate: todayStr,
        lastRepaymentDate: null
    };

    // ★修正：DBに保存
    syncBankState();

    updateGoldLocally(getCurrentGold() + borrowed);
    
    alert(`${borrowed} G を借りました。\n返済期限を守らないとペナルティがあります！`);
    renderBankUI();
}

function payBank() {
    if (!bankState.active) return;

    const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();

    if (bankState.type === 'installment' && bankState.lastRepaymentDate === todayStr) {
        alert("分割返済は1日1回までです。\nまた翌日（朝5時以降）に返済してください。");
        return;
    }

    let payAmount = bankState.type === 'lump' ? bankState.totalRepayment : bankState.dailyRepayment;
    let currentGold = getCurrentGold();

    currentGold -= payAmount;
    updateGoldLocally(currentGold);

    if (bankState.type === 'lump') {
        alert(`${payAmount} G を一括返済しました！\n（現在の所持金: ${currentGold} G）`);
        clearBankState();
    } else {
        bankState.totalRepayment -= payAmount;
        bankState.lastRepaymentDate = todayStr;
        
        let paymentsLeft = Math.ceil(bankState.totalRepayment / bankState.dailyRepayment);

        if (bankState.totalRepayment <= 0) {
            alert(`${payAmount} G を返済しました！\n分割返済がすべて完了しました！`);
            clearBankState();
        } else {
            alert(`${payAmount} G を返済しました！\n残り返済回数: ${paymentsLeft}回`);
            bankState.lastUpdateDate = todayStr;
            syncBankState();
            renderBankUI();
        }
    }
}

function clearBankState() {
    bankState = { active: false };
    syncBankState();
    renderBankUI();
}

function checkBankPenalties() {
    if (!bankState || !bankState.active) return;

    const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
    
    if (bankState.lastUpdateDate !== todayStr) {
        const lastDate = new Date(bankState.lastUpdateDate);
        const today = new Date(todayStr);
        const diffDays = Math.round(Math.abs(today - lastDate) / (1000 * 60 * 60 * 24)); 
        
        if (diffDays > 0) {
            bankState.daysLeft -= diffDays;

            if (bankState.daysLeft < 0) {
                let currentGold = getCurrentGold();
                let penaltyAmount = 0;

                if (bankState.type === 'lump') {
                    penaltyAmount = Math.floor(bankState.borrowed * 1.5);
                    alert(`【消費者金融】\n返済期限が過ぎました！\nペナルティとして ${penaltyAmount} G が強制引き落としされます。`);
                } else {
                    penaltyAmount = bankState.borrowed;
                    alert(`【消費者金融】\n分割返済が期限内に完了しませんでした！\nペナルティとして貸付額 ${penaltyAmount} G が強制引き落としされます。`);
                }

                currentGold -= penaltyAmount;
                updateGoldLocally(currentGold);
                
                bankState = { active: false };
                syncBankState();

            } else {
                bankState.lastUpdateDate = todayStr;
                syncBankState();
            }
        }
    }
}

// ★追加：他人の借金リセット
async function adminResetBankDays() {
    const targetName = document.getElementById('admin-bank-target').value || document.getElementById('player-name').innerText;
    
    if (targetName === document.getElementById('player-name').innerText) {
        if (bankState.active) {
            bankState.lastUpdateDate = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
            bankState.lastRepaymentDate = null;
            syncBankState();
            alert("自分の消費者金融の経過日数をリセットしました。");
            renderBankUI();
        } else {
            alert("現在借入していません。");
        }
    } else {
        const res = await fetch('/api/admin/bank_reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetName: targetName })
        });
        const data = await res.json();
        if (data.success) {
            alert(`${targetName} の借金日数をリセットしました。`);
        } else {
            alert(data.message || "エラーが発生しました。");
        }
    }
}

// ★追加：他人の借金クリア
async function adminClearBank() {
    const targetName = document.getElementById('admin-bank-target').value || document.getElementById('player-name').innerText;
    
    if (!confirm(`本当に ${targetName} の借金データを強制クリアしますか？`)) return;

    if (targetName === document.getElementById('player-name').innerText) {
        clearBankState();
        alert("自分の借金データをクリアしました。");
    } else {
        const res = await fetch('/api/admin/bank_clear', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetName: targetName })
        });
        const data = await res.json();
        if (data.success) {
            alert(`${targetName} の借金データを強制クリアしました。`);
        } else {
            alert(data.message || "エラーが発生しました。");
        }
    }
}