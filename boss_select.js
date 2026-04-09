// メインメニューから「ボス」を選んだときの処理
function goToBossSelect() {
    document.getElementById("main-menu").style.display = "none";
    document.getElementById("boss-select-container").style.display = "block";

    // 朝5時を基準にした論理的な曜日を取得
    const today = typeof getLogicalDay === 'function' ? getLogicalDay() : new Date().getDay(); 
    
    // ★変更：管理者によって解放されている曜日リストを取得
    let unlockedDays = [];
    if (typeof getLogicalDateString === 'function') {
        const unlockDataStr = localStorage.getItem('admin_unlocked_bosses');
        if (unlockDataStr) {
            const unlockData = JSON.parse(unlockDataStr);
            // 今日の朝5時リセット以降のデータなら有効
            if (unlockData.date === getLogicalDateString()) {
                unlockedDays = unlockData.days || [];
            }
        }
    }

    for (let i = 0; i <= 6; i++) {
        const btn = document.getElementById(`btn-day-${i}`);
        if (i === today || unlockedDays.includes(i)) {
            btn.classList.remove('disabled');
            btn.disabled = false;
        } else {
            btn.classList.add('disabled');
            btn.disabled = true;
        }
    }
}

function returnToMenuFromBossSelect() {
    document.getElementById("boss-select-container").style.display = "none";
    document.getElementById("main-menu").style.display = "block";
}