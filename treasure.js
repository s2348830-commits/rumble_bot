let marketData = null;
let selectedMarketItem = null;

async function initTreasureMarket() {
    try {
        const response = await fetch('/api/market');
        const data = await response.json();
        if (data.success) {
            marketData = data.state;
            if (!selectedMarketItem) {
                // 初期選択は最初のアイテム
                selectedMarketItem = Object.keys(marketData.items)[0];
            }
            renderTreasureMarket();
        } else {
            document.getElementById('treasure-market-container').innerHTML = "<p>市場データの読み込みに失敗しました。</p>";
        }
    } catch (e) {
        console.error(e);
    }
}

function renderTreasureMarket() {
    const container = document.getElementById('treasure-market-container');
    if (!marketData || !marketData.items) return;

    let listHtml = '';
    for (const [id, item] of Object.entries(marketData.items)) {
        const isSelected = id === selectedMarketItem ? 'selected' : '';
        const currentPrice = item.history[item.history.length - 1].close;
        const prevPrice = item.history.length > 1 ? item.history[item.history.length - 2].close : currentPrice;
        const diff = currentPrice - prevPrice;
        const color = diff >= 0 ? '#ff4444' : '#4CAF50'; // 赤=上昇、緑=下降
        const arrow = diff >= 0 ? '▲' : '▼';
        
        // 所持数の取得
        const owned = playerInventory[item.name] || 0;

        listHtml += `
            <div class="treasure-list-item ${isSelected}" onclick="selectMarketItem('${id}')">
                <div style="display: flex; align-items: center;">
                    <i class="t-icon t-img${item.imgIndex} t-pos${item.posIndex}"></i>
                    <div style="margin-left: 10px;">
                        <div style="font-weight: bold; font-size: 1.1em;">${item.name} <small style="color:#aaa;">(所持: ${owned})</small></div>
                        <div style="color: ${color};">${currentPrice} G ${arrow}${Math.abs(diff)}</div>
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="treasure-layout">
            <div class="treasure-sidebar">
                <h3 style="margin-top:0; border-bottom: 1px solid #555; padding-bottom: 10px;">特別市場</h3>
                <div class="treasure-list">
                    ${listHtml}
                </div>
            </div>
            <div class="treasure-main">
                <h3 id="treasure-chart-title" style="margin-top:0;">チャート</h3>
                <canvas id="market-chart" width="450" height="250" style="background: #1a1a1a; border: 1px solid #444; border-radius: 4px;"></canvas>
                
                <div class="treasure-actions">
                    <button class="join-btn" style="background-color: #e0245e; width: 45%;" onclick="tradeMarketItem('buy')">購入する</button>
                    <button class="join-btn" style="background-color: #008CBA; width: 45%;" onclick="tradeMarketItem('sell')">売却する</button>
                </div>
            </div>
        </div>
    `;

    drawCandlestickChart();
}

function selectMarketItem(id) {
    selectedMarketItem = id;
    renderTreasureMarket();
}

function drawCandlestickChart() {
    if (!selectedMarketItem || !marketData) return;
    const item = marketData.items[selectedMarketItem];
    const history = item.history;
    
    document.getElementById('treasure-chart-title').innerText = `${item.name} のレート推移 (過去30日)`;

    const canvas = document.getElementById('market-chart');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 30;
    const w = canvas.width - padding * 2;
    const h = canvas.height - padding * 2;

    // 最小・最大値の計算
    let minPrice = Infinity;
    let maxPrice = 0;
    history.forEach(d => {
        if (d.low < minPrice) minPrice = d.low;
        if (d.high > maxPrice) maxPrice = d.high;
    });
    
    // マージンをつける
    const range = maxPrice - minPrice;
    maxPrice += range * 0.1;
    minPrice = Math.max(0, minPrice - range * 0.1);

    const getY = (price) => canvas.height - padding - ((price - minPrice) / (maxPrice - minPrice)) * h;
    const getX = (index) => padding + (index / Math.max(1, history.length)) * w;
    const candleWidth = Math.max(2, (w / history.length) * 0.6);

    // 背景のガイドライン（基準線）
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    [0, 0.25, 0.5, 0.75, 1].forEach(ratio => {
        const y = padding + h * ratio;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(canvas.width - padding, y);
        ctx.stroke();
        
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.fillText(Math.floor(maxPrice - (maxPrice - minPrice) * ratio), 2, y + 3);
    });
    ctx.setLineDash([]);

    // ローソク足の描画
    history.forEach((d, i) => {
        const x = getX(i) + candleWidth / 2;
        const yOpen = getY(d.open);
        const yClose = getY(d.close);
        const yHigh = getY(d.high);
        const yLow = getY(d.low);

        const isUp = d.close >= d.open;
        ctx.strokeStyle = isUp ? '#ff4444' : '#4CAF50';
        ctx.fillStyle = isUp ? '#ff4444' : '#4CAF50';

        // ヒゲ
        ctx.beginPath();
        ctx.moveTo(x, yHigh);
        ctx.lineTo(x, yLow);
        ctx.stroke();

        // 実体
        const rectY = Math.min(yOpen, yClose);
        const rectH = Math.max(1, Math.abs(yOpen - yClose));
        ctx.fillRect(x - candleWidth / 2, rectY, candleWidth, rectH);
    });

    // 予測線（明日のトレンド予測）
    if (history.length > 0) {
        const last = history[history.length - 1];
        const lastX = getX(history.length - 1) + candleWidth / 2;
        const lastY = getY(last.close);
        
        // トレンドと平均回帰に基づく予測
        let predictedPrice = last.close;
        const currentTrend = item.trend || 0;
        predictedPrice += currentTrend * (last.close * 0.05);

        const predX = canvas.width - padding + 10;
        const predY = getY(predictedPrice);

        ctx.strokeStyle = '#ffcc00';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(predX, predY);
        ctx.stroke();
        ctx.setLineDash([]);

        // 現在価格の強調ライン
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padding, lastY);
        ctx.lineTo(canvas.width - padding, lastY);
        ctx.stroke();
    }
}

async function tradeMarketItem(action) {
    if (!selectedMarketItem || !marketData) return;
    const item = marketData.items[selectedMarketItem];
    const currentPrice = item.history[item.history.length - 1].close;

    // ★修正：連打防止機能（処理中はボタンを押せなくする）
    const buttons = document.querySelectorAll('.treasure-actions button');
    buttons.forEach(btn => btn.disabled = true);

    try {
        const response = await fetch('/api/market/trade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: action, itemId: selectedMarketItem, itemName: item.name, price: currentPrice })
        });
        
        const result = await response.json();
        if (result.success) {
            // ★修正：古い持ち物データでの無駄な上書き（syncPlayerState）を防止
            // サーバーから返ってきた最新データをUIに反映するだけに留める
            playerInventory = result.newInventory;
            document.getElementById("player-gold").innerText = result.newGold;
            
            renderTreasureMarket(); 
            if(typeof renderMainInventory === 'function') renderMainInventory();
        } else {
            alert(result.message);
        }
    } catch(e) {
        alert("通信エラーが発生しました。");
    } finally {
        // ★修正：処理が終わったらボタンを再度有効化
        buttons.forEach(btn => btn.disabled = false);
    }
}