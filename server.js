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
// あなたのRenderのURL（https://〜.onrender.com）に書き換えてください
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

// --- ログイン関連 ---
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

// --- 商品データ取得 ---
app.get('/api/items', async (req, res) => {
    try { await client.connect(); res.json(await client.db('rpg_game').collection('items').find({}).toArray()); } catch (e) { res.status(500).send("DBエラー"); }
});
app.get('/api/weapons', async (req, res) => {
    try { await client.connect(); res.json(await client.db('rpg_game').collection('weapons').find({}).toArray()); } catch (e) { res.status(500).send("DBエラー"); }
});
app.get('/api/others', async (req, res) => {
    try { await client.connect(); res.json(await client.db('rpg_game').collection('others').find({}).toArray()); } catch (e) { res.status(500).send("DBエラー"); }
});

// --- 買い物処理 ---
app.post('/api/buy', async (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false, message: "ログインしていません！" });

    try {
        const discordId = req.session.user.discordId; 
        const cart = req.body.cart;
        let totalCost = 0; let itemNames = [];

        for (const [name, item] of Object.entries(cart)) {
            totalCost += item.price * item.quantity;
            itemNames.push(`${name}×${item.quantity}`);
        }
        if (totalCost === 0) return res.json({ success: false, message: "商品は選ばれていないようだ。" });

        await client.connect();
        const usersCollection = client.db('rpg_game').collection('users');
        const user = await usersCollection.findOne({ discordId: discordId });
        let currentInventory = user.inventory || {}; 

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

// --- 売却処理 ---
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

// ==========================================
// ボス討伐報酬の受け取り処理
// ==========================================
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
            res.json({ success: true, newGold: newGold });
        } else {
            res.json({ success: false });
        }
    } catch (error) { 
        console.error(error);
        res.status(500).send("DBエラー"); 
    }
});

// ==========================================
// ★新規追加：プレイヤー状態（G・インベントリ）の任意同期処理
// （消費者金融や猫アイテムなどでの変動をDBに保存する）
// ==========================================
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
        
        res.json({ success: true });
    } catch (error) { 
        console.error(error);
        res.status(500).send("DBエラー"); 
    }
});

app.listen(port, () => {
    console.log(`お店のサーバーが起動しました！ http://localhost:${port}`);
    setupDatabase(); 
});