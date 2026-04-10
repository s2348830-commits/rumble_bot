const express = require('express');
const { MongoClient } = require('mongodb');
const session = require('express-session');
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']); 

const app = express();
const port = 3000;

// ==========================================
const MONGO_URI = "mongodb+srv://nakimusispec_db_user:20060403@cluster0.tueqe88.mongodb.net/?appName=Cluster0"; 
const CLIENT_ID = "1491471551512449255"; 
const CLIENT_SECRET = "h2HAw_NEwR5TirXfELAsFM_ohg2XR_Ed"; 
const REDIRECT_URI = "https://rumble-bot-w6wv.onrender.com/api/callback";
// ==========================================

app.use(express.json()); 
app.use(express.static(__dirname));

app.use(session({
    secret: 'rpg-shop-super-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

const client = new MongoClient(MONGO_URI);

const defaultItems = [
    { name: "チケット", price: 50, desc: "おみくじが引ける", icon: "icon-ticket" },
    { name: "スペシャルチケット", price: 500, desc: "スペシャルおみくじが引ける", icon: "icon-special" },
    { name: "消しゴム", price: 10, desc: "ベバを消せる", icon: "icon-eraser" }
];
const defaultWeapons = [
    { name: "ドーンロッド", price: 1200, desc: "範囲ダメージ(固定300ダメージ)", icon: "weapon-sprite icon-w1" },
    { name: "ピュアブレード", price: 3000, desc: "単体にダメージ(600)", icon: "weapon-sprite icon-w2" },
    { name: "シルバーナイト", price: 5000, desc: "ランダムな敵に5発打つ\n(現在の敵HPの0.2％のダメージ)", icon: "weapon-sprite icon-w3" },
    { name: "サンチャリス", price: 4000, desc: "クールタイム短縮(30%短縮)", icon: "weapon-sprite icon-w4" },
    { name: "フェイトスピア", price: 4500, desc: "全体に燃焼を10分間付与\n(燃焼ダメージ30/10s)", icon: "weapon-sprite icon-w5" },
    { name: "ブラッディ", price: 5000, desc: "FBダメージ増加(50→150)", icon: "weapon-sprite icon-w6" },
    { name: "ステラアリア", price: 6000, desc: "範囲に敵のバフ解除デバフ付与(デバフは敵の攻撃力40%低下)", icon: "weapon-sprite icon-w7" },
    { name: "クレセント", price: 7000, desc: "単体に割合ダメージ(現在の敵のHPの5%)(使う度に1%づつ減る最低0.2%)", icon: "weapon-sprite icon-w8" },
    { name: "秩序の双輝刃", price: 10000, desc: "使った敵に永続に燃焼を付与する。(燃焼ダメージ5/10s)", icon: "weapon-sprite icon-w9" }
];
const defaultOthers = [
    { name: "博打猫", price: 500, desc: "30%の確率でGが2倍になる\n70%の確率で貯金猫に貯金される", icon: "icon-bakuchi" },
    { name: "貯金猫", price: 1000, desc: "1%の確率で貯金が全額手に入る。", icon: "icon-chokin" }
];

async function setupDatabase() {
    try {
        await client.connect();
        const db = client.db('rpg_game');
        
        for (let item of defaultItems) {
            await db.collection('items').updateOne({ name: item.name }, { $setOnInsert: item }, { upsert: true });
        }
        for (let w of defaultWeapons) {
            await db.collection('weapons').updateOne({ name: w.name }, { $setOnInsert: w }, { upsert: true });
        }
        for (let o of defaultOthers) {
            await db.collection('others').updateOne({ name: o.name }, { $setOnInsert: o }, { upsert: true });
        }
    } catch (err) {
        console.error("DB初期化エラー:", err);
    }
}

app.get('/api/login', (req, res) => {
    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify`;
    res.redirect(discordAuthUrl);
});

app.get('/api/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send("キャンセルされました。");
    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT_URI })
        });
        const tokenData = await tokenResponse.json();

        const userResponse = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${tokenData.access_token}` } });
        const discordUser = await userResponse.json();

        await client.connect();
        const usersCollection = client.db('rpg_game').collection('users');

        let user = await usersCollection.findOne({ discordId: discordUser.id });
        if (!user) {
            user = { discordId: discordUser.id, name: discordUser.username, gold: 50000, inventory: {} }; 
            await usersCollection.insertOne(user);
        } else {
            await usersCollection.updateOne({ discordId: discordUser.id }, { $set: { name: discordUser.username } });
            user.name = discordUser.username;
        }

        req.session.user = { discordId: user.discordId, name: user.name, gold: user.gold, inventory: user.inventory || {} };
        res.redirect('/');
    } catch (error) { res.status(500).send("認証エラー"); }
});

app.get('/api/me', (req, res) => {
    if (req.session.user) { res.json({ loggedIn: true, user: req.session.user }); } 
    else { res.json({ loggedIn: false }); }
});

app.get('/api/items', async (req, res) => {
    try { await client.connect(); res.json(await client.db('rpg_game').collection('items').find({}).toArray()); } catch (e) { res.status(500).send("DBエラー"); }
});
app.get('/api/weapons', async (req, res) => {
    try { await client.connect(); res.json(await client.db('rpg_game').collection('weapons').find({}).toArray()); } catch (e) { res.status(500).send("DBエラー"); }
});
app.get('/api/others', async (req, res) => {
    try { await client.connect(); res.json(await client.db('rpg_game').collection('others').find({}).toArray()); } catch (e) { res.status(500).send("DBエラー"); }
});

app.post('/api/buy', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "ログインしていません！" });

    try {
        const discordId = req.session.user.discordId; 
        const cart = req.body.cart;
        let totalCost = 0; let itemNames = [];

        await client.connect();
        const db = client.db('rpg_game');
        
        let allItems = await db.collection('items').find({}).toArray();
        let allWeapons = await db.collection('weapons').find({}).toArray();
        let allOthers = await db.collection('others').find({}).toArray();
        let catalogMap = {};
        [...allItems, ...allWeapons, ...allOthers].forEach(i => catalogMap[i.name] = i);

        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ discordId: discordId });
        let currentInventory = user.inventory || {}; 

        for (const [name, item] of Object.entries(cart)) {
            totalCost += item.price * item.quantity;
            itemNames.push(`${name}×${item.quantity}`);
            
            let currentQty = currentInventory[name] || 0;
            let catItem = catalogMap[name];
            let maxLimit = (catItem && catItem.maxQty !== undefined) ? catItem.maxQty : 99;
            if (currentQty + item.quantity > maxLimit) {
                return res.json({ success: false, message: `${name} は上限（${maxLimit}個）を超えるため買えません！` });
            }
        }

        if (totalCost === 0) return res.json({ success: false, message: "商品は選ばれていないようだ。" });

        if (user && user.gold >= totalCost) {
            const newGold = user.gold - totalCost;
            
            for (const [name, item] of Object.entries(cart)) {
                currentInventory[name] = (currentInventory[name] || 0) + item.quantity;
            }

            await usersCollection.updateOne(
                { discordId: discordId }, 
                { $set: { gold: newGold, inventory: currentInventory } }
            );

            req.session.user.gold = newGold;
            req.session.user.inventory = currentInventory;
            
            res.json({ success: true, message: `${itemNames.join(", ")} を手に入れた！`, newGold: newGold, newInventory: currentInventory });
        } else {
            res.json({ success: false, message: "お金が足りないようだ..." });
        }
    } catch (error) { res.status(500).send("DBエラー"); }
});

app.post('/api/sell', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "ログインしていません！" });

    try {
        const discordId = req.session.user.discordId;
        const itemName = req.body.name; 

        await client.connect();
        const db = client.db('rpg_game');
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ discordId: discordId });

        if (!user || !user.inventory || !user.inventory[itemName] || user.inventory[itemName] <= 0) {
            return res.json({ success: false, message: "そのアイテムは持っていない！" });
        }

        let itemData = await db.collection('items').findOne({name: itemName}) ||
                       await db.collection('weapons').findOne({name: itemName}) ||
                       await db.collection('others').findOne({name: itemName});
        
        let sellPrice = itemData ? Math.max(1, Math.floor(itemData.price / 20)) : 1;

        const newGold = user.gold + sellPrice;
        let newInventory = user.inventory;
        newInventory[itemName] -= 1;
        
        if (newInventory[itemName] <= 0) {
            delete newInventory[itemName];
        }

        await usersCollection.updateOne(
            { discordId: discordId },
            { $set: { gold: newGold, inventory: newInventory } }
        );

        req.session.user.gold = newGold;
        req.session.user.inventory = newInventory;

        res.json({ success: true, newGold: newGold, newInventory: newInventory });
    } catch (error) { res.status(500).send("DBエラー"); }
});

app.post('/api/boss_reward', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const discordId = req.session.user.discordId;
        const reward = req.body.reward; 
        await client.connect();
        const usersCollection = client.db('rpg_game').collection('users');
        const user = await usersCollection.findOne({ discordId: discordId });

        if (user) {
            const newGold = user.gold + reward;
            await usersCollection.updateOne({ discordId: discordId }, { $set: { gold: newGold } });
            req.session.user.gold = newGold;
            res.json({ success: true, newGold: newGold });
        } else {
            res.json({ success: false });
        }
    } catch (error) { 
        console.error(error);
        res.status(500).send("DBエラー"); 
    }
});

app.post('/api/update_player', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const discordId = req.session.user.discordId;
        const newGold = req.body.gold; 
        const newInventory = req.body.inventory; 
        await client.connect();
        const usersCollection = client.db('rpg_game').collection('users');
        await usersCollection.updateOne({ discordId: discordId }, { $set: { gold: newGold, inventory: newInventory } });
        req.session.user.gold = newGold;
        req.session.user.inventory = newInventory;
        res.json({ success: true });
    } catch (error) { 
        console.error(error);
        res.status(500).send("DBエラー"); 
    }
});

app.post('/api/admin/shop', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const name = req.body.name;
        const price = req.body.price !== '' ? parseInt(req.body.price) : undefined;
        const maxQty = req.body.maxQty !== '' ? parseInt(req.body.maxQty) : undefined;

        await client.connect();
        const db = client.db('rpg_game');

        let updated = false;
        for (let col of ['items', 'weapons', 'others']) {
            const item = await db.collection(col).findOne({ name: name });
            if (item) {
                let updateFields = {};
                if (price !== undefined && !isNaN(price)) updateFields.price = price;
                if (maxQty !== undefined && !isNaN(maxQty)) updateFields.maxQty = maxQty;

                if (Object.keys(updateFields).length > 0) {
                    await db.collection(col).updateOne({ name: name }, { $set: updateFields });
                    updated = true;
                }
                break;
            }
        }
        res.json({ success: updated });
    } catch (error) { 
        console.error(error);
        res.status(500).send("DBエラー"); 
    }
});

// ==========================================
// ★修正：共有状態（ログとバフ）を追加
// ==========================================
let globalBossState = {
    dateStr: "", dayIndex: 5, bossHp: 1020000, bossMaxHp: 1020000, 
    playerHp: 0, playerMaxHp: 0, participants: 0, isDefeated: false, hasRevived: false,
    unlockedDaysData: {},
    logs: [],
    buffs: {
        sunchaliceUntil: 0, fbBonusDamage: 0, crescentPercent: 5.0,
        playerShieldUntil: 0, bossEvasion: 0, stellaUsed: false
    }
};
let isGlobalStateLoaded = false;
let lastBossHealTime = 0;
let lastBossAttackTime = 0;

app.get('/api/global_state', async (req, res) => {
    try {
        await client.connect();
        const db = client.db('rpg_game');
        if (!isGlobalStateLoaded) {
            const savedState = await db.collection('global').findOne({ _id: 'boss_state' });
            if (savedState) globalBossState = { ...globalBossState, ...savedState };
            isGlobalStateLoaded = true;
        }
        res.json({ success: true, state: globalBossState });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.post('/api/boss/action', async (req, res) => {
    try {
        await client.connect();
        const db = client.db('rpg_game');
        
        if (!isGlobalStateLoaded) {
            const savedState = await db.collection('global').findOne({ _id: 'boss_state' });
            if (savedState) globalBossState = { ...globalBossState, ...savedState };
            isGlobalStateLoaded = true;
        }

        const { type, amount, data } = req.body;
        const now = Date.now();
        
        if (type === 'damage_boss') {
            globalBossState.bossHp = Math.max(0, globalBossState.bossHp - amount);
            if (globalBossState.bossHp === 0 && !globalBossState.hasRevived) {
                if (globalBossState.dayIndex === 3) { globalBossState.bossHp = globalBossState.bossMaxHp * 0.60; globalBossState.hasRevived = true; }
                else if (globalBossState.dayIndex === 4) { globalBossState.bossHp = globalBossState.bossMaxHp * 0.40; globalBossState.hasRevived = true; }
                else if (globalBossState.dayIndex === 0) { globalBossState.bossHp = globalBossState.bossMaxHp * 0.10; globalBossState.hasRevived = true; }
                else { globalBossState.isDefeated = true; }
            } else if (globalBossState.bossHp === 0) {
                globalBossState.isDefeated = true;
            }
        } else if (type === 'damage_player') {
            if (data && data.isNormalAttack) {
                if (now - lastBossAttackTime > 9000) {
                    globalBossState.playerHp = Math.max(0, globalBossState.playerHp - amount);
                    lastBossAttackTime = now;
                }
            } else {
                globalBossState.playerHp = Math.max(0, globalBossState.playerHp - amount);
            }
        } else if (type === 'heal_boss') {
            if (now - lastBossHealTime > 900) {
                globalBossState.bossHp = Math.min(globalBossState.bossMaxHp || 1020000, globalBossState.bossHp + amount);
                lastBossHealTime = now;
            }
        } else if (type === 'join') {
            globalBossState.participants += 1;
            globalBossState.playerMaxHp += 1000000;
            globalBossState.playerHp += 1000000;
        } else if (type === 'set_state') {
            globalBossState = { ...globalBossState, ...data }; 
            // 日を跨いでリセットされる場合などにバフ・ログもクリアする
            if (data.resetBuffs) {
                globalBossState.logs = [];
                globalBossState.buffs = {
                    sunchaliceUntil: 0, fbBonusDamage: 0, crescentPercent: 5.0,
                    playerShieldUntil: 0, bossEvasion: 0, stellaUsed: false
                };
            }
        } else if (type === 'unlock_days') {
            globalBossState.unlockedDaysData = data;
        } else if (type === 'add_log') {
            // ★新規：ログの追加
            if (data && data.message) {
                globalBossState.logs.push(data.message);
                if (globalBossState.logs.length > 50) globalBossState.logs.shift(); // 50件まで保持
            }
        } else if (type === 'apply_buff') {
            // ★新規：バフの適用
            globalBossState.buffs = { ...globalBossState.buffs, ...data };
        }
        
        db.collection('global').updateOne({ _id: 'boss_state' }, { $set: globalBossState }, { upsert: true }).catch(console.error);
        
        res.json({ success: true, state: globalBossState });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

app.listen(port, () => {
    console.log(`お店のサーバーが起動しました！ http://localhost:${port}`);
    setupDatabase(); 
});