// 曜日別ボスのテンプレート
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
    
    // 曜日ごとの特殊状態
    hasRevived: false,
    clones: [],
    lastCloneSummonTime: 0,
    absorbShields: [],
    sealedRelics: [],
    lastSealTime: 0
};

let playerDebuffs = {
    burnUntil: 0,
    shockCount: 0 
};
let playerShieldUntil = 0; // プレイヤーのシールド効果時間

// ★修正: fb を fireball に統一
let skillCooldowns = { fireball: 0, shield: 0, accel: 0, relic: 0 };

let hasJoined = false;
let battleLogs = [];
let playerFrozen = false;
let bossAttackIntervalId = null;
let bossPassiveIntervalId = null;
let uiUpdateIntervalId = null;
let freezeTimeoutId = null;
let currentRelicIndex = 0; 

// --- localStorage 保存/復元 ---
function loadBossState() {
    const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
    const saved = localStorage.getItem('bossState_' + todayStr);
    
    if (saved) {
        const state = JSON.parse(saved);
        bossData = Object.assign(bossData, state.bossData);
        hasJoined = state.hasJoined || false;
        battleLogs = state.logs || [];
        
        const logBox = document.getElementById('battle-log');
        logBox.innerHTML = "";
        battleLogs.forEach(msg => {
            const p = document.createElement('p');
            p.style.margin = "4px 0";
            p.innerText = `> ${msg}`;
            logBox.appendChild(p);
        });
        logBox.scrollTop = logBox.scrollHeight; 
    } else {
        initBossState();
    }
}

function saveBossState() {
    const todayStr = typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString();
    const state = {
        bossData: bossData,
        hasJoined: hasJoined,
        logs: battleLogs
    };
    localStorage.setItem('bossState_' + todayStr, JSON.stringify(state));
}

function initBossState(dayIndex = 5) {
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
        lastSealTime: 0
    };
    hasJoined = false;
    battleLogs = [];
    document.getElementById('battle-log').innerHTML = ""; 
}

function clearTimers() {
    if (bossAttackIntervalId) clearInterval(bossAttackIntervalId);
    if (bossPassiveIntervalId) clearInterval(bossPassiveIntervalId);
    if (uiUpdateIntervalId) clearInterval(uiUpdateIntervalId);
    if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
}

// ----------------------------------------
// ボス開始・UI更新
// ----------------------------------------
function startBoss(dayIndex) {
    const today = typeof getLogicalDay === 'function' ? getLogicalDay() : new Date().getDay(); 
    
    let isUnlocked = false;
    if (typeof getLogicalDateString === 'function') {
        const unlockDataStr = localStorage.getItem('admin_unlocked_bosses');
        if (unlockDataStr) {
            const unlockData = JSON.parse(unlockDataStr);
            if (unlockData.date === getLogicalDateString() && unlockData.days.includes(dayIndex)) {
                isUnlocked = true;
            }
        }
    }

    if (dayIndex !== today && !isUnlocked) {
        alert("本日はこのボスには挑戦できません！");
        return;
    }

    document.getElementById('boss-select-container').style.display = 'none';
    document.getElementById('boss-battle-container').style.display = 'block';

    const saved = localStorage.getItem('bossState_' + (typeof getLogicalDateString === 'function' ? getLogicalDateString() : new Date().toDateString()));
    if (!saved) {
        initBossState(dayIndex);
    } else {
        loadBossState();
        if(bossData.dayIndex !== dayIndex) initBossState(dayIndex); 
    }
    
    if(typeof resetAbilities === 'function') resetAbilities();
    togglePlayerFreeze(false);
    
    document.getElementById('boss-image').src = bossData.isDefeated ? bossData.defeatImage : bossData.image;
    document.getElementById('boss-name-display').innerText = bossData.name;
    
    if (bossData.isDefeated || (bossData.participants > 0 && bossData.playerCurrentHp <= 0)) {
        document.getElementById('join-boss-overlay').style.display = 'none';
        disableActions();
    } 
    else if (hasJoined) {
        document.getElementById('join-boss-overlay').style.display = 'none';
        document.getElementById('battle-actions-container').style.pointerEvents = 'auto';
        document.getElementById('battle-actions-container').style.opacity = '1';
    } 
    else {
        document.getElementById('join-boss-overlay').style.display = 'flex';
        document.getElementById('battle-actions-container').style.pointerEvents = 'none';
        document.getElementById('battle-actions-container').style.opacity = '0.5';
    }

    updateBossUI();
    
    if (battleLogs.length === 0) logBattle(`凶悪な ${bossData.name} が現れた！`);

    clearTimers();
    if (!bossData.isDefeated && bossData.playerCurrentHp > 0) {
        bossAttackIntervalId = setInterval(bossAttackLoop, 10000);
        bossPassiveIntervalId = setInterval(bossPassiveLoop, 1000);
        uiUpdateIntervalId = setInterval(updateSkillCooldownUI, 200);
    }
}

function joinBoss() {
    if (hasJoined) return;
    
    hasJoined = true;
    bossData.participants += 1;
    bossData.playerMaxHp += 1000000;
    bossData.playerCurrentHp += 1000000; 
    
    document.getElementById('join-boss-overlay').style.display = 'none';
    document.getElementById('battle-actions-container').style.pointerEvents = 'auto';
    document.getElementById('battle-actions-container').style.opacity = '1';
    
    const pName = document.getElementById("player-name").innerText;
    logBattle(`${pName} が戦闘に参加した！（参加者数: ${bossData.participants}人）`);
    updateBossUI();
    
    clearTimers();
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

function logBattle(message, dontSave = false) {
    const logBox = document.getElementById('battle-log');
    const p = document.createElement('p');
    p.style.margin = "4px 0";
    p.innerText = `> ${message}`;
    logBox.appendChild(p);
    logBox.scrollTop = logBox.scrollHeight; 
    
    battleLogs.push(message);
    if (!dontSave) saveBossState();
}

function updateBossUI() {
    const bossHpPercent = (bossData.currentHp / bossData.maxHp) * 100;
    document.getElementById('boss-hp-bar').style.width = `${bossHpPercent}%`;
    document.getElementById('boss-hp-text').innerText = `${Math.floor(bossData.currentHp)} / ${bossData.maxHp}`;
    
    document.getElementById('participant-count').innerText = `参加者数: ${bossData.participants}人`;
    
    const playerHpPercent = bossData.playerMaxHp > 0 ? (bossData.playerCurrentHp / bossData.playerMaxHp) * 100 : 0;
    document.getElementById('player-hp-bar').style.width = `${playerHpPercent}%`;
    document.getElementById('player-hp-text').innerText = `${Math.floor(bossData.playerCurrentHp)} / ${bossData.playerMaxHp}`;
    
    // 木曜の分身UI更新
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

    saveBossState(); 
}

// ----------------------------------------
// スキル・クールタイム管理
// ----------------------------------------
function setSkillCooldown(skill, baseSec) {
    let ms = baseSec * 1000;
    
    // ★修正: fireball に統一
    if (bossData.dayIndex === 2 && (skill === 'fireball' || skill === 'accel')) {
        ms *= 1.5;
    }
    // サンチャリス: CT30%短縮
    if (typeof window.sunchaliceActive !== 'undefined' && window.sunchaliceActive) {
        ms *= 0.7;
    }
    
    skillCooldowns[skill] = Date.now() + ms;
}

function updateSkillCooldownUI() {
    const now = Date.now();
    const hpBar = document.getElementById('player-hp-bar');
    
    // ★追加: シールド中はHPバーを水色にする
    if (hpBar) {
        if (now < playerShieldUntil) {
            hpBar.style.backgroundColor = '#00d4ff'; // 水色
        } else {
            hpBar.style.backgroundColor = '#4CAF50'; // 緑色に戻す
        }
    }

    // 全滅時や未参加時はボタンの更新を行わない
    if (!hasJoined || bossData.isDefeated || playerFrozen || bossData.playerCurrentHp <= 0) return;
    
    // ★修正: fb から fireball に変更
    ['fireball', 'shield', 'accel', 'relic'].forEach(skill => {
        let btn = document.querySelector(`.btn-${skill}`);
        if (btn) {
            if (now >= skillCooldowns[skill]) {
                // 土曜: スキル封印チェック
                if (skill === 'relic' && bossData.sealedRelics && bossData.sealedRelics.includes(relicsData[currentRelicIndex].name)) {
                    btn.disabled = true;
                    document.getElementById('lbl-relic').innerText = "封印中...";
                    document.getElementById('lbl-relic').style.color = "#ff4444";
                } else {
                    btn.disabled = false;
                    if (skill === 'relic') {
                        document.getElementById('lbl-relic').innerText = relicsData[currentRelicIndex].name;
                        document.getElementById('lbl-relic').style.color = "#fff";
                    }
                }
            } else {
                btn.disabled = true;
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
        btns.forEach(b => b.disabled = true);
        labels.forEach(l => {
            l.innerText = "凍結/麻痺中";
            l.style.color = "#55aaff";
        });
    } else {
        document.getElementById('lbl-fireball').innerText = "ファイヤーボール";
        document.getElementById('lbl-shield').innerText = "シールド";
        document.getElementById('lbl-accel').innerText = "集団加速";
        const relic = relicsData[currentRelicIndex];
        if(relic) {
            document.getElementById('lbl-relic').innerText = relic.name;
            document.querySelector('.btn-relic').style.backgroundPosition = `${relic.bgX} ${relic.bgY}`;
        }
        labels.forEach(l => l.style.color = "#fff");
    }
}

// ----------------------------------------
// ボスのループ処理 (パッシブ / アクティブ)
// ----------------------------------------
function bossPassiveLoop() {
    if (bossData.isDefeated || bossData.playerCurrentHp <= 0 || bossData.participants === 0) return;
    
    const now = Date.now();
    const hpPercent = bossData.currentHp / bossData.maxHp;

    // 月曜・水曜：自己再生
    if (bossData.dayIndex === 1) healBoss(10);
    if (bossData.dayIndex === 3) healBoss(hpPercent >= 0.5 ? 30 : 40);

    // 火曜：燃焼ダメージ (10ダメージ/5s。パッシブは1秒ごとなので5回に1回処理)
    if (bossData.dayIndex === 2 && playerDebuffs.burnUntil > now) {
        if (Math.floor(now / 1000) % 5 === 0) {
            dealDamageToPlayer(10, "燃焼", false); // 軽減処理は内部で行う
        }
    }

    // 木曜：分身召喚 ＆ 電撃ダメージ
    if (bossData.dayIndex === 4) {
        // 6時間ごとに再召喚
        if (!bossData.lastCloneSummonTime || now >= bossData.lastCloneSummonTime + 6 * 60 * 60 * 1000) {
            let aliveClones = bossData.clones ? bossData.clones.filter(c => c.currentHp > 0) : [];
            if (aliveClones.length === 0) {
                logBattle("【能力発動】砂の蛇王が分身を2体召喚し、挑発の構えをとった！");
                bossData.clones = [
                    { currentHp: bossData.maxHp * 0.03, maxHp: bossData.maxHp * 0.03 },
                    { currentHp: bossData.maxHp * 0.03, maxHp: bossData.maxHp * 0.03 }
                ];
                bossData.lastCloneSummonTime = now;
                updateBossUI();
            }
        }
        // 電撃ダメージ (500/s × 感染人数)
        if (playerDebuffs.shockCount > 0) {
            dealDamageToPlayer(500 * playerDebuffs.shockCount, "電撃", false);
        }
    }

    // 土曜：スキル封印
    if (bossData.dayIndex === 6) {
        if (!bossData.lastSealTime || now >= bossData.lastSealTime + 60 * 60 * 1000) {
            let available = relicsData.map(r => r.name);
            bossData.sealedRelics = [];
            for (let i = 0; i < 3; i++) {
                let idx = Math.floor(Math.random() * available.length);
                bossData.sealedRelics.push(available.splice(idx, 1)[0]);
            }
            logBattle(`【スキル封印】福臨により、1時間「${bossData.sealedRelics.join('」「')}」が封印された！`);
            bossData.lastSealTime = now;
            updateBossUI();
        }
    }
}

function healBoss(amount) {
    if (bossData.currentHp < bossData.maxHp) {
        bossData.currentHp = Math.min(bossData.maxHp, bossData.currentHp + amount);
        updateBossUI();
    }
}

function dealDamageToPlayer(amount, reason, isNormalAttack) {
    let finalDmg = amount;
    const now = Date.now();
    let hasShield = (playerShieldUntil > now);

    if (hasShield) {
        if (isNormalAttack) finalDmg = Math.floor(amount * 0.8); // 20%軽減
        if (reason === "燃焼" && bossData.dayIndex === 2) finalDmg = Math.floor(amount * 0.5); // 50%軽減
        if (reason === "電撃" && bossData.dayIndex === 4) finalDmg = Math.floor(amount * 0.7); // 30%軽減
    }

    bossData.playerCurrentHp -= finalDmg;
    if (bossData.playerCurrentHp < 0) bossData.playerCurrentHp = 0;
    
    if (isNormalAttack) {
        logBattle(`プレイヤー全体に ${finalDmg} のダメージ！`);
    }

    updateBossUI();

    if (bossData.playerCurrentHp <= 0) {
        logBattle(`【全滅】プレイヤーのHPが0になった...`);
        disableActions();
    }
}

function bossAttackLoop() {
    if (bossData.isDefeated || bossData.playerCurrentHp <= 0 || bossData.participants === 0) return;

    logBattle(`【${bossData.name}の攻撃！】`);
    
    // 基本攻撃: 1500〜2300のダメージ
    let dmg = 1500 + Math.floor(Math.random() * 801);
    dealDamageToPlayer(dmg, "通常", true);

    // 火曜：攻撃時燃焼付与
    if (bossData.dayIndex === 2) {
        playerDebuffs.burnUntil = Date.now() + 60 * 60 * 1000;
        logBattle("邪地ノ炎魔の攻撃により、プレイヤーに1時間の燃焼が付与された！");
    }

    // 木曜：雷連鎖
    if (bossData.dayIndex === 4 && Math.random() < 0.3) {
        playerDebuffs.shockCount = Math.min(bossData.participants, 3);
        logBattle("【雷連鎖】プレイヤーに電撃が付与され、10秒間行動不能！");
        
        togglePlayerFreeze(true);
        if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
        freezeTimeoutId = setTimeout(() => {
            if(!bossData.isDefeated && bossData.playerCurrentHp > 0) {
                togglePlayerFreeze(false);
                playerDebuffs.shockCount = 0; 
                logBattle("電撃の麻痺から回復した！");
            }
        }, 10000); 
    }

    // デバフ解除処理
    let dispelChance = 0;
    if (bossData.dayIndex === 1 || bossData.dayIndex === 4) dispelChance = 0.3; // 中
    if (bossData.dayIndex === 2 || bossData.dayIndex === 6) dispelChance = 0.1; // 小/低
    if (bossData.dayIndex === 0) dispelChance = 0.6; // 高

    if (dispelChance > 0 && Math.random() < dispelChance) {
        if (typeof window.activeBurnIntervals !== 'undefined' && window.activeBurnIntervals.length > 0) {
            logBattle("【能力発動】ボスは自身にかかっているデバフ(燃焼など)を解除した！");
            if(typeof resetAbilities === 'function') resetAbilities();
            bossData.evasion = 0; // ステラアリアの解除等のためリセット
        }
    }

    // 金曜：凍結
    if (bossData.dayIndex === 5 && !playerFrozen && Math.random() < 0.4) { 
        logBattle("冷気が襲いかかる！プレイヤーは凍結され、30秒間行動不能になった！");
        togglePlayerFreeze(true);
        if (freezeTimeoutId) clearTimeout(freezeTimeoutId);
        freezeTimeoutId = setTimeout(() => {
            if(!bossData.isDefeated && bossData.playerCurrentHp > 0) {
                togglePlayerFreeze(false);
                logBattle("凍結が解除された！");
            }
        }, 30000); 
    }
    
    checkBossPhase();
}

// ----------------------------------------
// プレイヤースキル ＆ ダメージ処理
// ----------------------------------------
function switchRelic() {
    if (playerFrozen || bossData.isDefeated || bossData.playerCurrentHp <= 0 || !hasJoined) return;
    
    currentRelicIndex++;
    if (currentRelicIndex >= relicsData.length) currentRelicIndex = 0;
    
    const relic = relicsData[currentRelicIndex];
    document.getElementById('lbl-relic').innerText = relic.name;
    document.querySelector('.btn-relic').style.backgroundPosition = `${relic.bgX} ${relic.bgY}`;
}

function useSkill(skillType) {
    if (playerFrozen || bossData.isDefeated || bossData.playerCurrentHp <= 0 || !hasJoined) return;
    if (Date.now() < skillCooldowns[skillType]) return;

    // ★修正: fb から fireball に変更
    if (skillType === 'fireball') {
        let baseDamage = 50; 
        if(typeof window.fbBonusDamage !== 'undefined') baseDamage += window.fbBonusDamage;
        window.dealDamageToBoss(baseDamage, false, 'fireball', 'ファイヤーボール');
        setSkillCooldown('fireball', 1);
    } 
    else if (skillType === 'shield') {
        playerShieldUntil = Date.now() + 15 * 60 * 1000;
        logBattle("【シールド】を展開した！（15分間、ボスの通常攻撃を20%軽減）");
        setSkillCooldown('shield', 1);
        updateSkillCooldownUI(); // 即座に色を変えるため
    } 
    else if (skillType === 'accel') {
        let dmg = bossData.participants * 200;
        window.dealDamageToBoss(dmg, false, 'accel', '集団加速');
        setSkillCooldown('accel', 20);
    } 
    else if (skillType === 'relic') {
        const relicName = relicsData[currentRelicIndex].name;
        if (typeof executeRelicAbility === 'function') {
            executeRelicAbility(relicName);
        }
        setSkillCooldown('relic', 10);
    }
}

// 統合ダメージ関数（ability.jsからも呼ばれる）
window.dealDamageToBoss = function(baseAmount, isAoe, type, skillName) {
    if (bossData.isDefeated) return 0;
    let amount = baseAmount;
    const hpPercent = bossData.currentHp / bossData.maxHp;

    // --- ボスの無効化・軽減バフ ---
    // 日曜
    if (bossData.dayIndex === 0) {
        // ★修正: fireball に統一
        if (hpPercent >= 0.5 && (type === 'fireball' || type === 'accel')) {
            logBattle(`【無効化】日曜ボスの能力により ${skillName} は無効化された！`);
            return 0;
        }
        if (hpPercent <= 0.5 && type === 'relic') {
            logBattle(`【無効化】日曜ボスの能力により聖遺物のダメージが無効化された！`);
            return 0;
        }
    }
    // 聖遺物ダメージ軽減
    if (type === 'relic') {
        if (bossData.dayIndex === 1 || bossData.dayIndex === 2) amount *= 0.7; // 月、火 30%減
        if (bossData.dayIndex === 6 && hpPercent <= 0.5) amount *= 0.9;        // 土 10%減
    }
    // 火曜：HP50%以下で全てのダメージ5%減
    if (bossData.dayIndex === 2 && hpPercent <= 0.5) {
        amount *= 0.95;
    }
    // 金曜：シールド(既存) 30%減
    if (bossData.dayIndex === 5 && bossData.shieldActive) {
        amount *= 0.7;
    }

    // 回避率チェック
    if (bossData.evasion > 0 && Math.random() < (bossData.evasion / 100)) {
        logBattle(`攻撃をかわされた！（ボスの回避率: ${bossData.evasion}%）`);
        return 0;
    }

    amount = Math.floor(amount);

    // --- 木曜：分身の身代わり処理 ---
    if (!isAoe && bossData.clones && bossData.clones.length > 0) {
        let aliveClones = bossData.clones.filter(c => c.currentHp > 0);
        if (aliveClones.length > 0) {
            let targetClone = aliveClones[Math.floor(Math.random() * aliveClones.length)];
            targetClone.currentHp -= amount;
            logBattle(`【挑発】分身体が攻撃を身代わりした！ 分身に ${amount} ダメージ！`);
            updateBossUI();
            return amount;
        }
    }

    // --- 日曜：攻撃吸収シールド処理 ---
    if (bossData.dayIndex === 0 && hpPercent <= 0.5) {
        // ダメージを与える前に、45%分のシールドを「次回以降用」に生成する
        let absorbAmount = Math.floor(amount * 0.45);
        bossData.absorbShields.push({ amount: absorbAmount, expires: Date.now() + 10 * 60 * 1000 });
        
        // 現在あるシールドでダメージを相殺
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
            logBattle(`【吸収】攻撃はボスのシールドに完全に防がれた！`);
            updateBossUI();
            return 0;
        }
    }

    // --- 本体へダメージ ---
    bossData.currentHp -= amount;
    logBattle(`【${skillName}】 本体に ${amount} のダメージ！`);
    
    // --- 蘇生チェック ---
    if (bossData.currentHp <= 0 && !bossData.hasRevived) {
        if (bossData.dayIndex === 3) { bossData.currentHp = bossData.maxHp * 0.60; bossData.hasRevived = true; logBattle("【蘇生】突風の鹿鬼がHP60%で復活した！"); }
        else if (bossData.dayIndex === 4) { bossData.currentHp = bossData.maxHp * 0.40; bossData.hasRevived = true; logBattle("【蘇生】砂の蛇王がHP40%で復活した！"); }
        else if (bossData.dayIndex === 0) { bossData.currentHp = bossData.maxHp * 0.10; bossData.hasRevived = true; logBattle("【蘇生】日曜ボスがHP10%で復活した！"); }
    }

    if (bossData.currentHp < 0) bossData.currentHp = 0;
    
    updateBossUI();
    checkBossPhase();

    if (bossData.currentHp <= 0) {
        defeatBoss();
    }
    return amount;
};

function checkBossPhase() {
    const hpPercent = bossData.currentHp / bossData.maxHp;

    // 月曜：回避率UP
    if (bossData.dayIndex === 1 && hpPercent <= 0.5 && bossData.evasion < 40) {
        bossData.evasion = 40;
        logBattle("【能力発動】潜淵の主の回避率が40%にUP！");
    }
    // 土曜：回避率UP(デフォ)
    if (bossData.dayIndex === 6 && bossData.evasion < 60) {
        bossData.evasion = 60;
    }
    // 金曜：シールド展開(既存)
    if (bossData.dayIndex === 5 && hpPercent <= 0.6 && !bossData.shieldActive) {
        bossData.shieldActive = true;
        logBattle("【能力発動】ギルドボスがシールドを展開！（被ダメージ30%カット）");
    }
    // 金曜：回避率UPループ(既存)
    if (bossData.dayIndex === 5 && hpPercent <= 0.3 && bossData.evasionIntervalId === null) {
        bossData.evasion += 20;
        logBattle(`【バフ】ボスの回避率が20%アップ！（現在: ${bossData.evasion}%）`);
        bossData.evasionIntervalId = setInterval(() => {
            if (bossData.isDefeated) return clearInterval(bossData.evasionIntervalId);
            bossData.evasion += 20;
            logBattle(`【バフ】ボスの回避率がさらに20%アップ！（現在: ${bossData.evasion}%）`);
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
    
    logBattle(`見事 ${bossData.name} を討伐した！！！`);
    logBattle(`討伐報酬として ${bossData.reward} G を獲得中...`);
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
            logBattle(`報酬受け取り完了！現在の所持金: ${result.newGold} G`);
        } else {
            logBattle("エラー：報酬の受け取りに失敗しました。");
        }
    } catch(e) {
        logBattle("通信エラーが発生しました。");
    }
}

// =========================================
// 管理者画面用のボス操作関数
// =========================================
function adminReviveBoss() {
    loadBossState();
    bossData.currentHp = bossData.maxHp;
    bossData.isDefeated = false;
    bossData.hasRevived = false;
    saveBossState();
    alert("現在のボスを全回復して復活させました。（再度ボス画面に入ると反映されます）");
    document.getElementById('admin-boss-hp').value = '';
}

function adminSetBossHp() {
    const hp = parseInt(document.getElementById('admin-boss-hp').value);
    if (!isNaN(hp)) {
        loadBossState();
        bossData.currentHp = hp;
        if(bossData.currentHp <= 0) bossData.currentHp = 0;
        bossData.isDefeated = false; 
        saveBossState();
        alert(`ボスのHPを ${hp} に設定しました。（再度ボス画面に入ると反映されます）`);
        document.getElementById('admin-boss-hp').value = '';
    }
}

function adminSetPlayerHp() {
    const hp = parseInt(document.getElementById('admin-player-hp').value);
    if (!isNaN(hp)) {
        loadBossState();
        bossData.playerCurrentHp = hp;
        if(hp > bossData.playerMaxHp) bossData.playerMaxHp = hp; 
        saveBossState();
        alert(`プレイヤーHPを ${hp} に設定しました。（再度ボス画面に入ると反映されます）`);
        document.getElementById('admin-player-hp').value = '';
    }
}

function adminUnlockSelectedBosses() {
    const checkboxes = document.querySelectorAll('input[name="unlock-boss-day"]:checked');
    const selectedDays = Array.from(checkboxes).map(cb => parseInt(cb.value));
    
    if (selectedDays.length === 0) {
        alert("解放するボスを選択してください。");
        return;
    }

    if (typeof getLogicalDateString === 'function') {
        const unlockData = {
            date: getLogicalDateString(),
            days: selectedDays
        };
        localStorage.setItem('admin_unlocked_bosses', JSON.stringify(unlockData));
        
        checkboxes.forEach(cb => cb.checked = false);
        alert("選択したボスを本日の朝5時まで解放しました。");
    }
}