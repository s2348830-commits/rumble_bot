const BOSS_TEMPLATES = {
    1: { name: "潜淵の主", maxHp: 1050000, image: "image/boss/月曜.png", defeatImage: "image/boss/月曜2.png", reward: 18000 },
    2: { name: "邪地ノ炎魔", maxHp: 1080000, image: "image/boss/火曜.png", defeatImage: "image/boss/火曜2.png", reward: 20000 },
    3: { name: "突風の鹿鬼", maxHp: 1100000, image: "image/boss/水曜.png", defeatImage: "image/boss/水曜2.png", reward: 17000 },
    4: { name: "砂の蛇王", maxHp: 1150000, image: "image/boss/木曜.png", defeatImage: "image/boss/木曜2.png", reward: 30000 },
    5: { name: "ギルドボス", maxHp: 1020000, image: "image/boss/金曜.png", defeatImage: "image/boss/金曜2.png", reward: 15000 },
    6: { name: "福臨", maxHp: 1020000, image: "image/boss/土曜.png", defeatImage: "image/boss/土曜2.png", reward: 35000 },
    0: { name: "日曜の支配者", maxHp: 1200000, image: "image/boss/日曜.png", defeatImage: "image/boss/日曜2.png", reward: 40000 }
};

let bossData = {
    dayIndex: 5,
    name: "ギルドボス",
    maxHp: 1020000,
    currentHp: 1020000,
    image: "image/boss/金曜.png",
    defeatImage: "image/boss/金曜2.png",
    shieldActive: false,
    evasion: 0,
    reward: 15000,
    isDefeated: false,
    participants: 0,
    playerMaxHp: 0,
    playerCurrentHp: 0,
    hasRevived: false,
    clones: [],
    lastCloneSummonTime: 0,
    absorbShields: [],
    sealedRelics: [],
    lastSealTime: 0,
    // ★追加：氷と霧の共有ステータス
    iceFrozenUntil: 0, 
    fogActiveUntil: 0  
};

let playerDebuffs = { burnUntil: 0, shockCount: 0 };
let playerShieldUntil = 0; 

// ★追加：氷と霧のクールタイム(ローカル管理)
let skillCooldowns = { 
    fireball: 0, 
    shield: 0, 
    accel: 0, 
    relic: 0,
    ice: 0, 
    fog: 0  
};

let hasJoined = false;
let battleLogs = [];
let playerFrozen = false;
let bossAttackIntervalId = null;
let bossPassiveIntervalId = null;
let uiUpdateIntervalId = null;
let freezeTimeoutId = null;
let currentRelicIndex = 0; 

let waitIntervalId = null;
let waitingForStart = false;
let bossSyncInterval = null; 

// =========================================
// DBと同期する通信関数群
// =========================================
async function sendBossAction(type, amount, data = null) {
    try {
        const response = await fetch('/api/boss/action', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ type, amount, data })
        });
        const res = await response.json();
        const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
        
        if (res.state && res.state.dateStr === todayStr) {
            bossData.currentHp = res.state.bossHp;
            bossData.maxHp = res.state.bossMaxHp;
            bossData.playerCurrentHp = res.state.playerHp;
            bossData.playerMaxHp = res.state.playerMaxHp;
            bossData.participants = res.state.participants;
            
            if (res.state.isDefeated && !bossData.isDefeated) {
                bossData.isDefeated = true;
                defeatBoss();
            }
            if (res.state.hasRevived && !bossData.hasRevived) {
                bossData.hasRevived = true;
            }

            if (res.state.logs) {
                const logBox = document.getElementById('battle-log');
                const isBottom = logBox.scrollHeight - logBox.clientHeight <= logBox.scrollTop + 5;
                logBox.innerHTML = "";
                res.state.logs.forEach(msg => {
                    const p = document.createElement('p');
                    p.style.margin = "4px 0";
                    p.innerText = `> ${msg}`;
                    logBox.appendChild(p);
                });
                if (isBottom) logBox.scrollTop = logBox.scrollHeight;
            }

            if (res.state.buffs) {
                const now = Date.now();
                window.sunchaliceActive = (res.state.buffs.sunchaliceUntil > now);
                window.fbBonusDamage = (res.state.buffs.bloodyUntil > now) ? res.state.buffs.fbBonusDamage : 0;
                window.crescentPercent = res.state.buffs.crescentPercent;
                playerShieldUntil = res.state.buffs.playerShieldUntil;
                bossData.evasion = res.state.buffs.bossEvasion || 0;
                
                // ★バフとして氷と霧の時間を更新
                bossData.iceFrozenUntil = res.state.buffs.iceFrozenUntil || 0;
                bossData.fogActiveUntil = res.state.buffs.fogActiveUntil || 0;
            }

            updateBossUI();
        }
    } catch(e) {}
}

async function initBossState(dayIndex = 5) {
    const t = BOSS_TEMPLATES[dayIndex];
    bossData = {
        dayIndex: dayIndex,
        name: t.name,
        maxHp: t.maxHp,
        currentHp: t.maxHp,
        image: t.image,
        defeatImage: t.defeatImage,
        shieldActive: false,
        evasion: 0,
        reward: t.reward,
        isDefeated: false,
        participants: 0,
        playerMaxHp: 0,
        playerCurrentHp: 0,
        hasRevived: false,
        clones: [],
        lastCloneSummonTime: 0,
        absorbShields: [],
        sealedRelics: [],
        lastSealTime: 0,
        iceFrozenUntil: 0,
        fogActiveUntil: 0
    };
    hasJoined = false;
    battleLogs = [];
    document.getElementById('battle-log').innerHTML = ""; 

    const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
    const doc = {
        dateStr: todayStr,
        dayIndex: dayIndex,
        bossHp: t.maxHp,
        bossMaxHp: t.maxHp,
        playerHp: 0,
        playerMaxHp: 0,
        participants: 0,
        isDefeated: false,
        hasRevived: false,
        resetBuffs: true 
    };
    await sendBossAction('set_state', 0, doc);
}

async function loadBossState(dayIndex) {
    try {
        const res = await fetch('/api/global_state');
        const data = await res.json();
        const state = data.state || {};
        const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
        
        if (state.dateStr === todayStr && state.dayIndex === dayIndex) {
            bossData.currentHp = state.bossHp;
            bossData.maxHp = state.bossMaxHp;
            bossData.playerCurrentHp = state.playerHp;
            bossData.playerMaxHp = state.playerMaxHp;
            bossData.participants = state.participants;
            bossData.isDefeated = state.isDefeated;
            bossData.hasRevived = state.hasRevived;
            bossData.dayIndex = state.dayIndex;
            const t = BOSS_TEMPLATES[state.dayIndex] || BOSS_TEMPLATES[5];
            bossData.name = t.name;
            bossData.image = t.image;
            bossData.defeatImage = t.defeatImage;
            bossData.reward = t.reward;
            
            bossData.iceFrozenUntil = state.buffs ? (state.buffs.iceFrozenUntil || 0) : 0;
            bossData.fogActiveUntil = state.buffs ? (state.buffs.fogActiveUntil || 0) : 0;

            hasJoined = (localStorage.getItem('hasJoined_' + todayStr) === 'true');
            battleLogs = [];
            document.getElementById('battle-log').innerHTML = ""; 
        } else {
            await initBossState(dayIndex);
            hasJoined = false;
            localStorage.removeItem('hasJoined_' + todayStr);
        }
    } catch(e) { }
}

function clearTimers() {
    if (bossAttackIntervalId) clearInterval(bossAttackIntervalId);
    if (bossPassiveIntervalId) clearInterval(bossPassiveIntervalId);
    if (uiUpdateIntervalId) clearInterval(uiUpdateIntervalId);
    if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
    if (waitIntervalId) clearInterval(waitIntervalId); 
    if (bossSyncInterval) clearInterval(bossSyncInterval);
    bossSyncInterval = null;
}

async function startBoss(dayIndex) {
    const today = typeof getLogicalDay === 'function' ? getLogicalDay() : new Date().getDay(); 
    let isUnlocked = false;

    try {
        let res = await fetch('/api/global_state');
        let stateRes = await res.json();
        let state = stateRes.state || {};
        const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
        if (state.unlockedDaysData && state.unlockedDaysData.date === todayStr) {
            if ((state.unlockedDaysData.days || []).includes(dayIndex)) isUnlocked = true;
        }
    } catch(e) {}

    if (dayIndex !== today && !isUnlocked) {
        alert("本日はこのボスには挑戦できません！");
        return;
    }

    document.getElementById('boss-select-container').style.display = 'none';
    document.getElementById('boss-battle-container').style.display = 'block';

    await loadBossState(dayIndex);
    
    if(typeof resetAbilities === 'function') resetAbilities();
    togglePlayerFreeze(false);
    
    document.getElementById('boss-image').src = bossData.isDefeated ? bossData.defeatImage : bossData.image;
    document.getElementById('boss-name-display').innerText = bossData.name;
    
    if (bossData.isDefeated || (bossData.participants > 0 && bossData.playerCurrentHp <= 0)) {
        document.getElementById('join-boss-overlay').style.display = 'none';
        disableActions();
        clearTimers(); 
    } 
    else if (hasJoined) {
        document.getElementById('join-boss-overlay').style.display = 'none';
        if(!bossSyncInterval) {
            bossSyncInterval = setInterval(() => { sendBossAction('poll', 0); }, 2000);
        }
        checkAndStartBattle();
    } 
    else {
        document.getElementById('join-boss-overlay').style.display = 'flex';
        document.getElementById('battle-actions-container').style.pointerEvents = 'none';
        document.getElementById('battle-actions-container').style.opacity = '0.5';
        clearTimers(); 
    }

    updateBossUI();
}

function joinBoss() {
    if (hasJoined) return;
    
    hasJoined = true;
    const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
    localStorage.setItem('hasJoined_' + todayStr, 'true');

    document.getElementById('join-boss-overlay').style.display = 'none';
    
    const pName = document.getElementById("player-name").innerText;
    logBattle(`${pName} が戦闘に参加した！`, false);
    
    sendBossAction('join', 0); 
    
    if(!bossSyncInterval) {
        bossSyncInterval = setInterval(() => { sendBossAction('poll', 0); }, 2000);
    }
    checkAndStartBattle();
}

function checkAndStartBattle() {
    const now = new Date();
    if (now.getHours() < 10) {
        waitingForStart = true;
        document.getElementById('boss-waiting-overlay').style.display = 'flex';
        document.getElementById('battle-actions-container').style.pointerEvents = 'none';
        document.getElementById('battle-actions-container').style.opacity = '0.5';
        
        if (!waitIntervalId) {
            waitIntervalId = setInterval(() => {
                const checkNow = new Date();
                if (checkNow.getHours() >= 10) {
                    clearInterval(waitIntervalId);
                    waitIntervalId = null;
                    waitingForStart = false;
                    startBattleTimers(); 
                }
            }, 1000);
        }
    } else {
        startBattleTimers(); 
    }
}

function startBattleTimers() {
    document.getElementById('boss-waiting-overlay').style.display = 'none';
    document.getElementById('battle-actions-container').style.pointerEvents = 'auto';
    document.getElementById('battle-actions-container').style.opacity = '1';

    if (bossAttackIntervalId) clearInterval(bossAttackIntervalId);
    if (bossPassiveIntervalId) clearInterval(bossPassiveIntervalId);
    if (uiUpdateIntervalId) clearInterval(uiUpdateIntervalId);
    
    bossAttackIntervalId = setInterval(bossAttackLoop, 10000);
    bossPassiveIntervalId = setInterval(bossPassiveLoop, 1000);
    uiUpdateIntervalId = setInterval(updateSkillCooldownUI, 200);
}

function returnToMenuFromBattle() {
    clearTimers();
    if(typeof resetAbilities === 'function') resetAbilities();
    document.getElementById('boss-battle-container').style.display = 'none';
    document.getElementById('main-menu').style.display = 'block';
}

function logBattle(message, isLocalOnly = false) {
    if (isLocalOnly) {
        const logBox = document.getElementById('battle-log');
        const isBottom = logBox.scrollHeight - logBox.clientHeight <= logBox.scrollTop + 5;
        const p = document.createElement('p');
        p.style.margin = "4px 0";
        p.innerText = `> ${message}`;
        logBox.appendChild(p);
        if (isBottom) logBox.scrollTop = logBox.scrollHeight; 
    } else {
        if (typeof sendBossAction === 'function') {
            sendBossAction('add_log', 0, { message: message });
        }
    }
}

function updateBossUI() {
    const bossHpPercent = bossData.maxHp > 0 ? (bossData.currentHp / bossData.maxHp) * 100 : 0;
    document.getElementById('boss-hp-bar').style.width = `${bossHpPercent}%`;
    document.getElementById('boss-hp-text').innerText = `${Math.floor(bossData.currentHp)} / ${bossData.maxHp}`;
    
    document.getElementById('participant-count').innerText = `参加者数: ${bossData.participants}人`;
    
    const playerHpPercent = bossData.playerMaxHp > 0 ? (bossData.playerCurrentHp / bossData.playerMaxHp) * 100 : 0;
    document.getElementById('player-hp-bar').style.width = `${playerHpPercent}%`;
    document.getElementById('player-hp-text').innerText = `${Math.floor(bossData.playerCurrentHp)} / ${bossData.playerMaxHp}`;

    if (bossData.dayIndex === 4 && bossData.clones && bossData.clones.length > 0) {
        if (bossData.clones[0] && bossData.clones[0].currentHp > 0) {
            document.getElementById('clone-left').style.display = 'block';
            document.getElementById('clone-left-img').src = bossData.image;
            let p = (bossData.clones[0].currentHp / bossData.clones[0].maxHp) * 100;
            document.getElementById('clone-left-hp-bar').style.width = `${p}%`;
        } else {
            document.getElementById('clone-left').style.display = 'none';
        }
        
        if (bossData.clones[1] && bossData.clones[1].currentHp > 0) {
            document.getElementById('clone-right').style.display = 'block';
            document.getElementById('clone-right-img').src = bossData.image;
            let p = (bossData.clones[1].currentHp / bossData.clones[1].maxHp) * 100;
            document.getElementById('clone-right-hp-bar').style.width = `${p}%`;
        } else {
            document.getElementById('clone-right').style.display = 'none';
        }
    } else {
        document.getElementById('clone-left').style.display = 'none';
        document.getElementById('clone-right').style.display = 'none';
    }
}

function setSkillCooldown(skill, baseSec) {
    let ms = baseSec * 1000;
    if (bossData.dayIndex === 2 && (skill === 'fireball' || skill === 'accel')) ms *= 1.5;
    if (typeof window.sunchaliceActive !== 'undefined' && window.sunchaliceActive) ms *= 0.7;
    skillCooldowns[skill] = Date.now() + ms;
}

function updateSkillCooldownUI() {
    const now = Date.now();
    
    // ★追加：バフの色をHPバーに反映
    const hpBar = document.getElementById('player-hp-bar');
    if (hpBar) {
        if (now < bossData.fogActiveUntil) {
            hpBar.style.backgroundColor = '#b0bec5'; // 霧（灰色）
        } else if (now < playerShieldUntil) {
            hpBar.style.backgroundColor = '#00d4ff'; // 盾（水色）
        } else {
            hpBar.style.backgroundColor = '#4CAF50'; 
        }
    }
    const bossHpBar = document.getElementById('boss-hp-bar');
    if (bossHpBar) {
        bossHpBar.style.backgroundColor = (now < bossData.iceFrozenUntil) ? '#90caf9' : '#ff4444'; // 氷で水色に
    }

    if (!hasJoined || waitingForStart || bossData.isDefeated || bossData.playerCurrentHp <= 0) return;
    
    if (playerFrozen) {
        ['fireball', 'shield', 'accel', 'relic', 'ice', 'fog'].forEach(skill => {
            let btn = document.querySelector(`.btn-${skill}`);
            if (btn) btn.disabled = true;
        });
        return;
    }

    // ★追加：氷と霧のスキルボタン判定
    ['fireball', 'shield', 'accel', 'relic', 'ice', 'fog'].forEach(skill => {
        let btn = document.querySelector(`.btn-${skill}`);
        if (btn) {
            if (now >= skillCooldowns[skill]) {
                if (skill === 'relic' && bossData.sealedRelics && bossData.sealedRelics.includes(relicsData[currentRelicIndex].name)) {
                    btn.disabled = true;
                    document.getElementById('lbl-relic').innerText = "封印中...";
                    document.getElementById('lbl-relic').style.color = "#ff4444";
                } else {
                    btn.disabled = false;
                    if (skill === 'relic') {
                        document.getElementById('lbl-relic').innerText = relicsData[currentRelicIndex].name;
                        document.getElementById('lbl-relic').style.color = "#fff";
                    } else if (skill === 'ice') {
                        document.getElementById('lbl-ice').innerText = "氷";
                    } else if (skill === 'fog') {
                        document.getElementById('lbl-fog').innerText = "霧";
                    }
                }
            } else {
                btn.disabled = true;
                if (skill === 'ice' || skill === 'fog') {
                    document.getElementById(`lbl-${skill}`).innerText = Math.ceil((skillCooldowns[skill] - now) / 1000) + "s";
                }
            }
        }
    });
}

function disableActions() {
    document.getElementById('battle-actions-container').style.pointerEvents = 'none';
    document.getElementById('battle-actions-container').style.opacity = '0.5';
    document.querySelectorAll('.skill-btn').forEach(btn => btn.disabled = true);
}

function togglePlayerFreeze(isFrozen) {
    playerFrozen = isFrozen;
    const btns = document.querySelectorAll('.skill-btn');
    const labels = document.querySelectorAll('.skill-label');

    if (isFrozen) {
        btns.forEach(b => {
            if (!b.classList.contains('btn-return')) {
                b.disabled = true;
            }
        });
        labels.forEach(l => {
            if (l.id !== 'lbl-relic' && l.id !== 'lbl-ice' && l.id !== 'lbl-fog') {
                l.innerText = "凍結/麻痺中";
                l.style.color = "#55aaff";
            }
        });
    } else {
        btns.forEach(b => b.disabled = false);
        document.getElementById('lbl-fireball').innerText = "ファイヤーボール";
        document.getElementById('lbl-shield').innerText = "シールド";
        document.getElementById('lbl-accel').innerText = "集団加速";
        
        if (Date.now() < skillCooldowns.ice) {
            document.getElementById('lbl-ice').innerText = Math.ceil((skillCooldowns.ice - Date.now()) / 1000) + "s";
        } else {
            document.getElementById('lbl-ice').innerText = "氷";
        }
        
        if (Date.now() < skillCooldowns.fog) {
            document.getElementById('lbl-fog').innerText = Math.ceil((skillCooldowns.fog - Date.now()) / 1000) + "s";
        } else {
            document.getElementById('lbl-fog').innerText = "霧";
        }

        const relic = relicsData[currentRelicIndex];
        if(relic) {
            if (bossData.sealedRelics && bossData.sealedRelics.includes(relic.name)) {
                document.getElementById('lbl-relic').innerText = "封印中...";
                document.getElementById('lbl-relic').style.color = "#ff4444";
            } else {
                document.getElementById('lbl-relic').innerText = relic.name;
                document.getElementById('lbl-relic').style.color = "#fff";
                document.querySelector('.btn-relic').style.backgroundPosition = `${relic.bgX} ${relic.bgY}`;
            }
        }
        
        labels.forEach(l => {
            if(l.id !== 'lbl-relic' || (bossData.sealedRelics && !bossData.sealedRelics.includes(relicsData[currentRelicIndex].name))) {
                 l.style.color = "#fff";
            }
        });
        updateSkillCooldownUI();
    }
}

function bossPassiveLoop() {
    if (bossData.isDefeated || bossData.playerCurrentHp <= 0 || bossData.participants === 0) return;
    
    // ★追加：氷の効果中はボスのパッシブ行動を停止
    if (Date.now() < bossData.iceFrozenUntil) return;

    const now = Date.now();
    const hpPercent = bossData.maxHp > 0 ? bossData.currentHp / bossData.maxHp : 0;

    if (bossData.dayIndex === 1) healBoss(10);
    if (bossData.dayIndex === 3) healBoss(hpPercent >= 0.5 ? 30 : 40);

    if (bossData.dayIndex === 2 && playerDebuffs.burnUntil > now) {
        if (Math.floor(now / 1000) % 5 === 0) {
            dealDamageToPlayer(10, "燃焼", false); 
        }
    }

    if (bossData.dayIndex === 4) {
        if (!bossData.lastCloneSummonTime || now >= bossData.lastCloneSummonTime + 6 * 60 * 60 * 1000) {
            let aliveClones = bossData.clones ? bossData.clones.filter(c => c.currentHp > 0) : [];
            if (aliveClones.length === 0) {
                logBattle("【能力発動】砂の蛇王が分身を2体召喚し、挑発の構えをとった！", true);
                bossData.clones = [
                    { currentHp: bossData.maxHp * 0.03, maxHp: bossData.maxHp * 0.03 },
                    { currentHp: bossData.maxHp * 0.03, maxHp: bossData.maxHp * 0.03 }
                ];
                bossData.lastCloneSummonTime = now;
                updateBossUI();
            }
        }
        if (playerDebuffs.shockCount > 0) {
            dealDamageToPlayer(500 * playerDebuffs.shockCount, "電撃", false);
        }
    }

    if (bossData.dayIndex === 6) {
        if (!bossData.lastSealTime || now >= bossData.lastSealTime + 60 * 60 * 1000) {
            let available = relicsData.map(r => r.name);
            bossData.sealedRelics = [];
            for (let i = 0; i < 3; i++) {
                let idx = Math.floor(Math.random() * available.length);
                bossData.sealedRelics.push(available.splice(idx, 1)[0]);
            }
            logBattle(`【スキル封印】福臨により、1時間「${bossData.sealedRelics.join('」「')}」が封印された！`, true);
            bossData.lastSealTime = now;
            updateBossUI();
        }
    }
}

function healBoss(amount) {
    sendBossAction('heal_boss', amount);
}

function dealDamageToPlayer(amount, reason, isNormalAttack) {
    let finalDmg = amount;
    const now = Date.now();
    let hasShield = (playerShieldUntil > now);

    // ★追加：霧による10%回避
    if (isNormalAttack && now < bossData.fogActiveUntil && Math.random() < 0.1) {
        logBattle(`【回避】霧に紛れてボスの攻撃（${reason}）を回避した！`, true);
        return; 
    }

    if (hasShield) {
        if (isNormalAttack) finalDmg = Math.floor(amount * 0.8); 
        if (reason === "燃焼" && bossData.dayIndex === 2) finalDmg = Math.floor(amount * 0.5); 
        if (reason === "電撃" && bossData.dayIndex === 4) finalDmg = Math.floor(amount * 0.7); 
    }

    sendBossAction('damage_player', finalDmg, { isNormalAttack: isNormalAttack });
    if (isNormalAttack) {
        logBattle(`プレイヤー全体に ${finalDmg} のダメージ！`, true); 
    }
}

function bossAttackLoop() {
    if (bossData.isDefeated || bossData.playerCurrentHp <= 0 || bossData.participants === 0) return;
    
    // ★追加：氷の効果中はボスの攻撃行動を停止
    if (Date.now() < bossData.iceFrozenUntil) return;

    logBattle(`【${bossData.name}の攻撃！】`, true);
    let dmg = 1500 + Math.floor(Math.random() * 801);
    dealDamageToPlayer(dmg, "通常", true);

    if (bossData.dayIndex === 2) {
        playerDebuffs.burnUntil = Date.now() + 60 * 60 * 1000;
        logBattle("邪地ノ炎魔の攻撃により、プレイヤーに1時間の燃焼が付与された！", true);
    }

    if (bossData.dayIndex === 4 && Math.random() < 0.3) {
        playerDebuffs.shockCount = Math.min(bossData.participants, 3);
        logBattle("【雷連鎖】プレイヤーに電撃が付与され、10秒間行動不能！", true);
        
        togglePlayerFreeze(true);
        if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
        freezeTimeoutId = setTimeout(() => {
            if(!bossData.isDefeated && bossData.playerCurrentHp > 0) {
                togglePlayerFreeze(false);
                playerDebuffs.shockCount = 0; 
                logBattle("電撃の麻痺から回復した！", true);
            }
        }, 10000); 
    }

    let dispelChance = 0;
    if (bossData.dayIndex === 1 || bossData.dayIndex === 4) dispelChance = 0.3; 
    if (bossData.dayIndex === 2 || bossData.dayIndex === 6) dispelChance = 0.1; 
    if (bossData.dayIndex === 0) dispelChance = 0.6; 

    if (dispelChance > 0 && Math.random() < dispelChance) {
        if (typeof window.activeBurnIntervals !== 'undefined' && window.activeBurnIntervals.length > 0) {
            logBattle("【能力発動】ボスは自身にかかっているデバフ(燃焼など)を解除した！", true);
            if(typeof resetAbilities === 'function') resetAbilities();
            sendBossAction('apply_buff', 0, { bossEvasion: 0, crescentPercent: 5.0 }); 
        }
    }

    if (bossData.dayIndex === 5 && !playerFrozen && Math.random() < 0.4) { 
        logBattle("冷気が襲いかかる！プレイヤーは凍結され、15秒間行動不能になった！", true);
        togglePlayerFreeze(true);
        if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
        freezeTimeoutId = setTimeout(() => {
            if(!bossData.isDefeated && bossData.playerCurrentHp > 0) {
                togglePlayerFreeze(false);
                logBattle("凍結が解除された！", true);
            }
        }, 15000); 
    }
    
    checkBossPhase();
}

function switchRelic() {
    if (bossData.isDefeated || bossData.playerCurrentHp <= 0 || !hasJoined) return;
    
    currentRelicIndex++;
    if (currentRelicIndex >= relicsData.length) currentRelicIndex = 0;
    
    const relic = relicsData[currentRelicIndex];
    document.getElementById('lbl-relic').innerText = relic.name;
    document.querySelector('.btn-relic').style.backgroundPosition = `${relic.bgX} ${relic.bgY}`;
}

function useSkill(skillType) {
    if (playerFrozen || bossData.isDefeated || bossData.playerCurrentHp <= 0 || !hasJoined || waitingForStart) return;
    if (Date.now() < skillCooldowns[skillType]) return;

    const pName = document.getElementById("player-name").innerText;

    if (skillType === 'fireball') {
        let baseDamage = 50; 
        if(typeof window.fbBonusDamage !== 'undefined') baseDamage += window.fbBonusDamage;
        window.dealDamageToBoss(baseDamage, false, 'fireball', 'ファイヤーボール', pName);
        setSkillCooldown('fireball', 1);
    } 
    else if (skillType === 'shield') {
        playerShieldUntil = Date.now() + 15 * 60 * 1000;
        sendBossAction('apply_buff', 0, { playerShieldUntil: playerShieldUntil }); 
        logBattle(`【盾】${pName}のシールド展開！（15分間、ボスの通常攻撃を20%軽減）`, false);
        setSkillCooldown('shield', 1);
        updateSkillCooldownUI(); 
    } 
    else if (skillType === 'accel') {
        let dmg = bossData.participants * 200;
        window.dealDamageToBoss(dmg, false, 'accel', '集団加速', pName);
        setSkillCooldown('accel', 20);
    } 
    else if (skillType === 'relic') {
        const relicName = relicsData[currentRelicIndex].name;
        if (typeof executeRelicAbility === 'function') {
            executeRelicAbility(relicName, pName);
        }
        setSkillCooldown('relic', 10);
    }
    // ★追加：氷のスキル
    else if (skillType === 'ice') {
        bossData.iceFrozenUntil = Date.now() + 30 * 1000;
        sendBossAction('apply_buff', 0, { iceFrozenUntil: bossData.iceFrozenUntil });
        logBattle(`【氷】${pName}が氷の魔力を解き放った！敵の動きが30秒間停止する！`, false);
        setSkillCooldown('ice', 300); // 5分 = 300秒
    }
    // ★追加：霧のスキル
    else if (skillType === 'fog') {
        bossData.fogActiveUntil = Date.now() + 5 * 60 * 1000;
        sendBossAction('apply_buff', 0, { fogActiveUntil: bossData.fogActiveUntil });
        logBattle(`【霧】${pName}が戦場を霧で覆った！5分間、ボスの攻撃を10%の確率で回避する！`, false);
        setSkillCooldown('fog', 300); // 5分 = 300秒
    }
}

window.dealDamageToBoss = function(baseAmount, isAoe, type, skillName, pName = "誰か") {
    if (bossData.isDefeated) return 0;
    let amount = baseAmount;
    const hpPercent = bossData.maxHp > 0 ? bossData.currentHp / bossData.maxHp : 0;

    if (bossData.dayIndex === 0) {
        if (hpPercent >= 0.5 && (type === 'fireball' || type === 'accel')) {
            logBattle(`【無効化】日曜ボスの能力により ${pName} の ${skillName} は無効化された！`, false);
            return 0;
        }
        if (hpPercent <= 0.5 && type === 'relic') {
            logBattle(`【無効化】日曜ボスの能力により ${pName} の 聖遺物のダメージが無効化された！`, false);
            return 0;
        }
    }
    
    if (type === 'relic') {
        if (bossData.dayIndex === 1 || bossData.dayIndex === 2) amount *= 0.7; 
        if (bossData.dayIndex === 6 && hpPercent <= 0.5) amount *= 0.9;        
    }
    if (bossData.dayIndex === 2 && hpPercent <= 0.5) {
        amount *= 0.95;
    }
    if (bossData.dayIndex === 5 && bossData.shieldActive) {
        amount *= 0.7;
    }

    if (bossData.evasion > 0 && Math.random() < (bossData.evasion / 100)) {
        logBattle(`${pName} の攻撃をかわされた！（ボスの回避率: ${bossData.evasion}%）`, false);
        return 0;
    }

    amount = Math.floor(amount);

    if (!isAoe && bossData.clones && bossData.clones.length > 0) {
        let aliveClones = bossData.clones.filter(c => c.currentHp > 0);
        if (aliveClones.length > 0) {
            let targetClone = aliveClones[Math.floor(Math.random() * aliveClones.length)];
            targetClone.currentHp -= amount;
            logBattle(`【挑発】分身体が ${pName} の攻撃を身代わりした！ 分身に ${amount} ダメージ！`, false);
            updateBossUI();
            return amount;
        }
    }

    if (bossData.dayIndex === 0 && hpPercent <= 0.5) {
        let absorbAmount = Math.floor(amount * 0.45);
        bossData.absorbShields.push({ amount: absorbAmount, expires: Date.now() + 10 * 60 * 1000 });
        
        let remainingDamage = amount;
        for (let i = 0; i < bossData.absorbShields.length; i++) {
            let shield = bossData.absorbShields[i];
            if (shield.expires > Date.now() && shield.amount > 0) {
                if (shield.amount >= remainingDamage) {
                    shield.amount -= remainingDamage;
                    remainingDamage = 0;
                    break;
                } else {
                    remainingDamage -= shield.amount;
                    shield.amount = 0;
                }
            }
        }
        amount = remainingDamage;
        if (amount <= 0) {
            logBattle(`【吸収】${pName} の攻撃はボスのシールドに完全に防がれた！`, false);
            updateBossUI();
            return 0;
        }
    }

    sendBossAction('damage_boss', amount);
    logBattle(`【${pName}の${skillName}！】 本体に ${amount} のダメージ！`, false); 
    
    return amount;
};

function checkBossPhase() {
    const hpPercent = bossData.maxHp > 0 ? bossData.currentHp / bossData.maxHp : 0;

    if (bossData.dayIndex === 1 && hpPercent <= 0.5 && bossData.evasion < 40) {
        sendBossAction('apply_buff', 0, { bossEvasion: 40 });
        logBattle("【能力発動】潜淵の主の回避率が40%にUP！", true);
    }
    if (bossData.dayIndex === 6 && bossData.evasion < 60) {
        sendBossAction('apply_buff', 0, { bossEvasion: 60 });
    }
    if (bossData.dayIndex === 5 && hpPercent <= 0.6 && !bossData.shieldActive) {
        bossData.shieldActive = true;
        logBattle("【能力発動】ギルドボスがシールドを展開！（被ダメージ30%カット）", true);
    }
    if (bossData.dayIndex === 5 && hpPercent <= 0.3 && bossData.evasionIntervalId === null) {
        let newEvasion = Math.min(20, bossData.evasion + 20);
        sendBossAction('apply_buff', 0, { bossEvasion: newEvasion });
        logBattle(`【バフ】ボスの回避率がアップ！（現在: ${newEvasion}% / 上限20%）`, true);
        
        bossData.evasionIntervalId = setInterval(() => {
            if (bossData.isDefeated) return clearInterval(bossData.evasionIntervalId);
            
            if (bossData.evasion < 20) {
                let nextEvasion = Math.min(20, bossData.evasion + 20);
                sendBossAction('apply_buff', 0, { bossEvasion: nextEvasion });
                logBattle(`【バフ】ボスの回避率が再びアップ！（現在: ${nextEvasion}% / 上限20%）`, true);
            }
        }, 600000); 
    }
}

async function defeatBoss() {
    bossData.isDefeated = true;
    clearTimers();
    if(typeof resetAbilities === 'function') resetAbilities();

    document.getElementById('boss-image').src = bossData.defeatImage;
    disableActions();
    document.querySelectorAll('.skill-label').forEach(lbl => lbl.innerText = "討伐完了");
    
    logBattle(`見事 ${bossData.name} を討伐した！！！`, true);
    logBattle(`討伐報酬として ${bossData.reward} G を獲得中...`, true);
    updateBossUI();

    try {
        const response = await fetch('/api/boss_reward', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reward: bossData.reward })
        });
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('player-gold').innerText = result.newGold;
            logBattle(`報酬受け取り完了！現在の所持金: ${result.newGold} G`, true);
        } else {
            logBattle("【警告】セッション切れにより報酬が受け取れませんでした。", true);
            let pending = parseInt(localStorage.getItem('pendingReward') || '0');
            localStorage.setItem('pendingReward', pending + bossData.reward);
            alert("ログインの有効期限が切れてしまったため、報酬を一時保留しました。\nページを更新（リロード）して再ログインすると自動的に付与されます！");
        }
    } catch(e) {
        logBattle("通信エラーにより報酬が受け取れませんでした。", true);
        let pending = parseInt(localStorage.getItem('pendingReward') || '0');
        localStorage.setItem('pendingReward', pending + bossData.reward);
        alert("通信エラーが発生し、報酬を一時保留しました。\nページを更新（リロード）して再ログインすると自動的に付与されます！");
    }
}

function adminReviveBoss() {
    sendBossAction('set_state', 0, { bossHp: bossData.maxHp, isDefeated: false, hasRevived: false }).then(() => {
        alert("現在のボスを全回復して復活させました。（再度ボス画面に入ると反映されます）");
    });
}

function adminSetBossHp() {
    const hp = parseInt(document.getElementById('admin-boss-hp').value);
    if (!isNaN(hp)) {
        sendBossAction('set_state', 0, { bossHp: hp, isDefeated: false, hasRevived: false }).then(() => {
            alert(`ボスのHPを ${hp} に設定しました。（再度ボス画面に入ると反映されます）`);
            document.getElementById('admin-boss-hp').value = '';
        });
    }
}

function adminSetPlayerHp() {
    const hp = parseInt(document.getElementById('admin-player-hp').value);
    if (!isNaN(hp)) {
        sendBossAction('set_state', 0, { playerHp: hp }).then(() => {
            alert(`プレイヤーHPを ${hp} に設定しました。（再度ボス画面に入ると反映されます）`);
            document.getElementById('admin-player-hp').value = '';
        });
    }
}

function adminUnlockSelectedBosses() {
    const checkboxes = document.querySelectorAll('input[name="unlock-boss-day"]:checked');
    const selectedDays = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (typeof getLogicalDateString === 'function') {
        const unlockData = {
            date: getLogicalDateString(),
            days: selectedDays 
        };
        sendBossAction('unlock_days', 0, unlockData).then(() => {
            alert("選択したボスの解放状態をサーバーに保存しました。\n（チェックしていないボスは挑戦不可になります）");
            checkboxes.forEach(cb => cb.checked = false);
        });
    }
}