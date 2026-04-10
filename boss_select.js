async function goToBossSelect() {
    document.getElementById("main-menu").style.display = "none";
    document.getElementById("boss-select-container").style.display = "block";

    const today = typeof getLogicalDay === 'function' ? getLogicalDay() : new Date().getDay(); 
    
    let unlockedDays = [];
    try {
        let res = await fetch('/api/global_state');
        let stateRes = await res.json();
        let state = stateRes.state || {};
        const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
        
        if (state.unlockedDaysData && state.unlockedDaysData.date === todayStr) {
            unlockedDays = state.unlockedDaysData.days || [];
        }
    } catch(e) {}

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