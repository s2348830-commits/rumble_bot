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
            await db.collection('items').updateOne({ name: item.name }, { $set: item }, { upsert: true });
        }
        for (let w of defaultWeapons) {
            await db.collection('weapons').updateOne({ name: w.name }, { $set: w }, { upsert: true });
        }
        for (let o of defaultOthers) {
            await db.collection('others').updateOne({ name: o.name }, { $set: o }, { upsert: true });
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

        const oldNamesMap = {
            "古代の金貨": "緋石の仮面", "エルフの秘薬": "黄金のホルン", "ドワーフの鉄": "宵闇の神灯",
            "魔力結晶": "輝く白鳴琴", "星屑の砂": "血晶の棘", "竜の牙": "原初の蛇環",
            "不死鳥の羽": "至高の聖杯", "マーメイドの涙": "流雲の法螺", "ゴーレムの心臓": "暁の王冠",
            "精霊の銀": "野火の灼刃", "暗黒物質": "朝露の連星", "女神の涙": "蒼露の星儀"
        };

        let user = await usersCollection.findOne({ discordId: discordUser.id });
        if (!user) {
            // ★ notifications 配列も初期化
            user = { discordId: discordUser.id, name: discordUser.username, gold: 50000, inventory: {}, bankState: { active: false }, notifications: [] }; 
            await usersCollection.insertOne(user);
        } else {
            let inventoryModified = false;
            let currentInv = user.inventory || {};
            for (let oldName in oldNamesMap) {
                if (currentInv[oldName]) {
                    const newName = oldNamesMap[oldName];
                    currentInv[newName] = (currentInv[newName] || 0) + currentInv[oldName];
                    delete currentInv[oldName];
                    inventoryModified = true;
                }
            }
            if (inventoryModified) {
                await usersCollection.updateOne({ discordId: discordUser.id }, { $set: { name: discordUser.username, inventory: currentInv } });
                user.inventory = currentInv;
            } else {
                await usersCollection.updateOne({ discordId: discordUser.id }, { $set: { name: discordUser.username } });
            }
            user.name = discordUser.username;
        }

        req.session.user = { 
            discordId: user.discordId, 
            name: user.name, 
            gold: user.gold, 
            inventory: user.inventory || {}, 
            bankState: user.bankState || { active: false } 
        };
        req.session.save(() => {
            res.redirect('/');
        });
    } catch (error) { res.status(500).send("認証エラー"); }
});

app.get('/api/me', async (req, res) => {
    if (req.session.user) { 
        try {
            await client.connect();
            const dbUser = await client.db('rpg_game').collection('users').findOne({ discordId: req.session.user.discordId });
            if (dbUser) {
                req.session.user.gold = dbUser.gold;
                req.session.user.inventory = dbUser.inventory || {};
                req.session.user.name = dbUser.name;
                req.session.user.bankState = dbUser.bankState || { active: false };
            }
            res.json({ loggedIn: true, user: req.session.user }); 
        } catch(e) {
            res.json({ loggedIn: true, user: req.session.user }); 
        }
    } 
    else { res.json({ loggedIn: false }); }
});

// ★新規：ギフトなどの通知をチェックして取得し、DBからは消去するAPI
app.get('/api/check_notifications', async (req, res) => {
    if (!req.session.user) return res.json({ success: false });
    try {
        await client.connect();
        const dbUser = await client.db('rpg_game').collection('users').findOne({ discordId: req.session.user.discordId });
        
        if (dbUser && dbUser.notifications && dbUser.notifications.length > 0) {
            // 通知があれば、空配列にしてリセット
            await client.db('rpg_game').collection('users').updateOne(
                { discordId: req.session.user.discordId },
                { $set: { notifications: [] } }
            );
            
            // ついでに最新のインベントリ情報も返す（アイテムが増えているため）
            req.session.user.inventory = dbUser.inventory || {};
            req.session.save(() => {
                res.json({ success: true, notifications: dbUser.notifications, newInventory: dbUser.inventory });
            });
        } else {
            res.json({ success: true, notifications: [] });
        }
    } catch(e) {
        res.json({ success: false });
    }
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
            
            req.session.save(() => {
                res.json({ success: true, message: `${itemNames.join(", ")} を手に入れた！`, newGold: newGold, newInventory: currentInventory });
            });
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

        req.session.save(() => {
            res.json({ success: true, newGold: newGold, newInventory: newInventory });
        });
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
            await usersCollection.updateOne(
                { discordId: discordId },
                { $set: { gold: newGold } }
            );

            req.session.user.gold = newGold;
            req.session.save(() => {
                res.json({ success: true, newGold: newGold });
            });
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

        await usersCollection.updateOne(
            { discordId: discordId },
            { $set: { gold: newGold, inventory: newInventory } }
        );

        req.session.user.gold = newGold;
        req.session.user.inventory = newInventory;
        
        req.session.save(() => {
            res.json({ success: true });
        });
    } catch (error) { 
        console.error(error);
        res.status(500).send("DBエラー"); 
    }
});

app.post('/api/bank/sync', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const { bankState } = req.body;
        await client.connect();
        await client.db('rpg_game').collection('users').updateOne(
            { discordId: req.session.user.discordId },
            { $set: { bankState: bankState } }
        );
        req.session.user.bankState = bankState;
        res.json({ success: true });
    } catch(e) {
        res.json({ success: false });
    }
});

app.post('/api/gift', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    try {
        const { targetName, itemName, amount } = req.body;
        const senderId = req.session.user.discordId;
        const senderName = req.session.user.name;

        if (senderName === targetName) return res.json({ success: false, message: "自分自身には送れません。" });
        if (amount <= 0) return res.json({ success: false, message: "1個以上指定してください。" });

        await client.connect();
        const usersCol = client.db('rpg_game').collection('users');

        const sender = await usersCol.findOne({ discordId: senderId });
        const receiver = await usersCol.findOne({ name: targetName });

        if (!receiver) return res.json({ success: false, message: "指定された名前のプレイヤーが見つかりません。" });
        if (!sender.inventory || (sender.inventory[itemName] || 0) < amount) {
            return res.json({ success: false, message: "アイテムの所持数が足りません。" });
        }

        // 送る側から引く
        sender.inventory[itemName] -= amount;
        if (sender.inventory[itemName] <= 0) delete sender.inventory[itemName];

        // 受け取る側に足す
        receiver.inventory = receiver.inventory || {};
        receiver.inventory[itemName] = (receiver.inventory[itemName] || 0) + amount;

        // ★新規：受け取る側に通知メッセージを追加
        receiver.notifications = receiver.notifications || [];
        receiver.notifications.push(`${senderName} さんから「${itemName}」が ${amount}個 送られました！`);

        await usersCol.updateOne({ _id: sender._id }, { $set: { inventory: sender.inventory } });
        await usersCol.updateOne({ _id: receiver._id }, { $set: { inventory: receiver.inventory, notifications: receiver.notifications } });

        req.session.user.inventory = sender.inventory;
        req.session.save(() => {
            res.json({ success: true, newInventory: sender.inventory });
        });

    } catch(e) {
        res.json({ success: false, message: "システムエラー" });
    }
});

// ==========================================
// ★管理者用API（他プレイヤーの操作）
// ==========================================

app.post('/api/admin/player_info', async (req, res) => {
    try {
        const { targetName } = req.body;
        await client.connect();
        const target = await client.db('rpg_game').collection('users').findOne({ name: targetName });
        if (target) {
            res.json({ success: true, gold: target.gold, inventory: target.inventory, bankState: target.bankState });
        } else {
            res.json({ success: false, message: "プレイヤーが見つかりません" });
        }
    } catch(e) { res.json({ success: false, message: "通信エラー" }); }
});

app.post('/api/admin/set_gold', async (req, res) => {
    try {
        const { targetName, gold } = req.body;
        await client.connect();
        const result = await client.db('rpg_game').collection('users').updateOne(
            { name: targetName },
            { $set: { gold: gold } }
        );
        res.json({ success: result.modifiedCount > 0 });
    } catch(e) { res.json({ success: false }); }
});

app.post('/api/admin/bank_reset', async (req, res) => {
    try {
        const { targetName } = req.body;
        const todayStr = getJSTLogicalDate();
        await client.connect();
        const target = await client.db('rpg_game').collection('users').findOne({ name: targetName });
        
        if (target && target.bankState && target.bankState.active) {
            target.bankState.lastUpdateDate = todayStr;
            target.bankState.lastRepaymentDate = null;
            await client.db('rpg_game').collection('users').updateOne(
                { name: targetName },
                { $set: { bankState: target.bankState } }
            );
            res.json({ success: true });
        } else {
            res.json({ success: false, message: "対象プレイヤーは現在借入していません。" });
        }
    } catch(e) { res.json({ success: false, message: "通信エラー" }); }
});

app.post('/api/admin/bank_clear', async (req, res) => {
    try {
        const { targetName } = req.body;
        await client.connect();
        const result = await client.db('rpg_game').collection('users').updateOne(
            { name: targetName },
            { $set: { bankState: { active: false } } }
        );
        res.json({ success: result.modifiedCount > 0, message: "対象プレイヤーの借金データをクリアしました。" });
    } catch(e) { res.json({ success: false, message: "通信エラー" }); }
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
// ★ボスおよび全体共有ステータス管理
// ==========================================
let globalBossState = {
    dateStr: "", dayIndex: 5, bossHp: 1020000, bossMaxHp: 1020000, 
    playerHp: 0, playerMaxHp: 0, participants: 0, isDefeated: false, hasRevived: false,
    unlockedDaysData: {},
    logs: [],
    buffs: {
        sunchaliceUntil: 0, fbBonusDamage: 0, bloodyUntil: 0, crescentPercent: 5.0,
        playerShieldUntil: 0, bossEvasion: 0, stellaUsed: false,
        iceFrozenUntil: 0, fogActiveUntil: 0 
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
            if (data.resetBuffs) {
                globalBossState.logs = [];
                globalBossState.buffs = {
                    sunchaliceUntil: 0, fbBonusDamage: 0, bloodyUntil: 0, crescentPercent: 5.0,
                    playerShieldUntil: 0, bossEvasion: 0, stellaUsed: false,
                    iceFrozenUntil: 0, fogActiveUntil: 0 
                };
            }
        } else if (type === 'unlock_days') {
            globalBossState.unlockedDaysData = data;
        } else if (type === 'add_log') {
            if (data && data.message) {
                globalBossState.logs.push(data.message);
                if (globalBossState.logs.length > 50) globalBossState.logs.shift(); 
            }
        } else if (type === 'apply_buff') {
            globalBossState.buffs = { ...globalBossState.buffs, ...data };
        }
        
        db.collection('global').updateOne({ _id: 'boss_state' }, { $set: globalBossState }, { upsert: true }).catch(console.error);
        
        res.json({ success: true, state: globalBossState });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// ==========================================
// ★特別市場（投資）のDBと価格変動ロジック
// ==========================================

function getJSTLogicalDate() {
    const now = new Date();
    const jstTime = now.getTime() + (9 * 60 * 60 * 1000); 
    const jstDate = new Date(jstTime);
    if (jstDate.getUTCHours() < 5) {
        jstDate.setUTCDate(jstDate.getUTCDate() - 1);
    }
    return `${jstDate.getUTCFullYear()}-${String(jstDate.getUTCMonth()+1).padStart(2, '0')}-${String(jstDate.getUTCDate()).padStart(2, '0')}`;
}

const marketItemsDef = [
    { id: "m10", name: "野火の灼刃", basePrice: 15000, imgIndex: 2, posIndex: 4 },
    { id: "m5",  name: "血晶の棘", basePrice: 3000, imgIndex: 1, posIndex: 5 },
    { id: "m1",  name: "緋石の仮面", basePrice: 500, imgIndex: 1, posIndex: 1 },
    { id: "m2",  name: "黄金のホルン", basePrice: 1000, imgIndex: 1, posIndex: 2 },
    { id: "m6",  name: "原初の蛇環", basePrice: 5000, imgIndex: 1, posIndex: 6 },
    { id: "m7",  name: "至高の聖杯", basePrice: 7500, imgIndex: 2, posIndex: 1 },
    { id: "m9",  name: "暁の王冠", basePrice: 12000, imgIndex: 2, posIndex: 3 },
    { id: "m3",  name: "宵闇の神灯", basePrice: 1500, imgIndex: 1, posIndex: 3 },
    { id: "m4",  name: "輝く白鳴琴", basePrice: 2000, imgIndex: 1, posIndex: 4 },
    { id: "m8",  name: "流雲の法螺", basePrice: 10000, imgIndex: 2, posIndex: 2 },
    { id: "m12", name: "蒼露の星儀", basePrice: 30000, imgIndex: 2, posIndex: 6 },
    { id: "m11", name: "朝露の連星", basePrice: 20000, imgIndex: 2, posIndex: 5 }
];

function simulateMarketDay(itemState, def) {
    const minPrice = Math.max(10, Math.floor(def.basePrice * 0.3));
    const maxPrice = Math.floor(def.basePrice * 3.0);
    
    let currentPrice = itemState.history[itemState.history.length - 1].close;

    if (!itemState.trend || itemState.trendDays <= 0) {
        itemState.trend = (Math.random() > 0.5 ? 1 : -1);
        itemState.trendDays = Math.floor(Math.random() * 3) + 1; 
    }

    if (currentPrice > maxPrice * 0.8) itemState.trend = -1;
    else if (currentPrice < minPrice * 1.2) itemState.trend = 1;

    itemState.trendDays--;

    const volatility = currentPrice * 0.05; 
    const trendMove = itemState.trend * volatility * (Math.random() * 0.5 + 0.5);
    const randomMove = (Math.random() - 0.5) * volatility;

    let newClose = Math.floor(currentPrice + trendMove + randomMove);
    newClose = Math.max(minPrice, Math.min(maxPrice, newClose)); 

    let open = currentPrice;
    let close = newClose;

    let high = Math.floor(Math.max(open, close) + Math.random() * volatility);
    let low = Math.floor(Math.min(open, close) - Math.random() * volatility);

    itemState.history.push({ open, high, low, close });
    if (itemState.history.length > 30) itemState.history.shift();
}

app.get('/api/market', async (req, res) => {
    try {
        await client.connect();
        const db = client.db('rpg_game');
        let state = await db.collection('global').findOne({ _id: 'market_state' });
        const todayStr = getJSTLogicalDate();

        if (!state) {
            state = { _id: 'market_state', date: todayStr, items: {} };
            for (let def of marketItemsDef) {
                state.items[def.id] = {
                    name: def.name,
                    imgIndex: def.imgIndex,
                    posIndex: def.posIndex,
                    trend: 1,
                    trendDays: 2,
                    history: [{ open: def.basePrice, high: def.basePrice*1.05, low: def.basePrice*0.95, close: def.basePrice }]
                };
                for (let i = 0; i < 29; i++) {
                    simulateMarketDay(state.items[def.id], def);
                }
            }
            await db.collection('global').insertOne(state);
        } else {
            let needsUpdate = false;
            for (let def of marketItemsDef) {
                if (state.items[def.id] && state.items[def.id].name !== def.name) {
                    state.items[def.id].name = def.name;
                    needsUpdate = true;
                }
            }

            if (state.date !== todayStr) {
                const oldDate = new Date(state.date);
                const newDate = new Date(todayStr);
                let diffDays = Math.floor((newDate - oldDate) / (1000 * 60 * 60 * 24));
                if (diffDays > 0) {
                    if (diffDays > 30) diffDays = 30; 
                    for (let i = 0; i < diffDays; i++) {
                        for (let def of marketItemsDef) {
                            simulateMarketDay(state.items[def.id], def);
                        }
                    }
                    state.date = todayStr;
                    await db.collection('global').updateOne({ _id: 'market_state' }, { $set: state });
                }
            } else if (needsUpdate) {
                await db.collection('global').updateOne({ _id: 'market_state' }, { $set: state });
            }
        }
        res.json({ success: true, state: state });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

app.post('/api/market/trade', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "ログインしていません！" });

    try {
        const { action, itemId, itemName, price } = req.body;
        const discordId = req.session.user.discordId;

        await client.connect();
        const usersCollection = client.db('rpg_game').collection('users');
        const user = await usersCollection.findOne({ discordId: discordId });
        let inventory = user.inventory || {};
        let currentQty = inventory[itemName] || 0;

        if (action === 'buy') {
            if (currentQty >= 99) return res.json({ success: false, message: "これ以上所持できません（上限99個）" });
            if (user.gold < price) return res.json({ success: false, message: "お金が足りないようだ..." });
            
            user.gold -= price;
            inventory[itemName] = currentQty + 1;
            
        } else if (action === 'sell') {
            if (currentQty <= 0) return res.json({ success: false, message: "そのアイテムは持っていない！" });
            
            user.gold += price;
            inventory[itemName] = currentQty - 1;
            if (inventory[itemName] <= 0) delete inventory[itemName];
        }

        await usersCollection.updateOne({ discordId: discordId }, { $set: { gold: user.gold, inventory: inventory } });
        req.session.user.gold = user.gold;
        req.session.user.inventory = inventory;

        req.session.save(() => {
            res.json({ success: true, message: action === 'buy' ? "購入しました！" : "売却しました！", newGold: user.gold, newInventory: inventory });
        });

    } catch (e) {
        res.status(500).json({ success: false, message: "DBエラー" });
    }
});

app.listen(port, () => {
    console.log(`お店のサーバーが起動しました！ http://localhost:${port}`);
    setupDatabase(); 
});