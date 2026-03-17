// ============================================================
//  DARK ABYSS  ─  ダーク プラットフォーム シューター
//  WASD: 移動  |  マウス: 照準  |  クリック: 射撃
//  敵の上から踏みつけても倒せる
// ============================================================

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
canvas.width  = 960;
canvas.height = 540;
ctx.imageSmoothingEnabled = false;

// 8bit ピクセル描画ヘルパー
const PX = 2; // 1ドット=2px
function px(x,y,w,h,c) { ctx.fillStyle=c; ctx.fillRect(Math.round(x),Math.round(y),w*PX,h*PX); }
function pxRect(x,y,w,h,c) { ctx.fillStyle=c; ctx.fillRect(Math.round(x),Math.round(y),w,h); }

// ============================================================
//  8bit サウンドシステム（Web Audio API チップチューン）
// ============================================================
let audioCtx = null;
let masterGain = null;
let bgmPlaying = false;
let bgmOscs = [];
let bgmInterval = null;

function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(audioCtx.destination);
}

// 基本チップチューン音生成
function playTone(freq, duration, type='square', vol=0.3, slide=0) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    if (slide) osc.frequency.linearRampToValueAtTime(freq+slide, audioCtx.currentTime+duration);
    gain.gain.setValueAtTime(vol * 0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + duration);
}

// ノイズ（爆発・被弾用）
function playNoise(duration, vol=0.3) {
    if (!audioCtx) return;
    const bufSize = audioCtx.sampleRate * duration;
    const buf = audioCtx.createBuffer(1, bufSize, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<bufSize;i++) data[i] = Math.random()*2-1;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(vol * 0.3, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration);
    src.connect(gain);
    gain.connect(masterGain);
    src.start(audioCtx.currentTime);
}

// ---- 効果音 ----
function sfxJump() {
    playTone(200, 0.15, 'square', 0.3, 400);
}
function sfxShoot() {
    playTone(800, 0.06, 'square', 0.25);
    playNoise(0.04, 0.15);
}
function sfxShotgun() {
    playNoise(0.08, 0.4);
    playTone(200, 0.08, 'square', 0.2);
}
function sfxEnemyHit() {
    playTone(300, 0.08, 'square', 0.2, -100);
}
function sfxEnemyDie() {
    playTone(400, 0.08, 'square', 0.3);
    setTimeout(()=>playTone(300, 0.08, 'square', 0.3), 50);
    setTimeout(()=>playTone(200, 0.12, 'square', 0.25), 100);
    playNoise(0.15, 0.2);
}
function sfxPlayerHit() {
    playTone(150, 0.15, 'square', 0.35, -80);
    playNoise(0.1, 0.25);
}
function sfxItemPickup() {
    playTone(523, 0.07, 'square', 0.25);
    setTimeout(()=>playTone(659, 0.07, 'square', 0.25), 70);
    setTimeout(()=>playTone(784, 0.1, 'square', 0.3), 140);
}
function sfxStomp() {
    playTone(500, 0.05, 'square', 0.3);
    setTimeout(()=>playTone(800, 0.1, 'square', 0.25), 50);
}
function sfxGoal() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n,i) => setTimeout(()=>playTone(n, 0.15, 'square', 0.3), i*120));
}
function sfxDeath() {
    const notes = [400, 350, 300, 250, 200, 150];
    notes.forEach((n,i) => setTimeout(()=>playTone(n, 0.2, 'square', 0.3), i*150));
}

// ---- BGM（ステージ別8bitループ） ----
const NOTE = {
    C3:131,D3:147,Eb3:156,E3:165,F3:175,G3:196,Ab3:208,A3:220,Bb3:233,B3:247,
    C4:262,D4:294,Eb4:311,E4:330,F4:349,G4:392,Ab4:415,A4:440,Bb4:466,B4:494,
    C5:523,D5:587,Eb5:622,E5:659,F5:698,G5:784,Ab5:831,
    R:0
};

// Stage1: Cマイナー ダークテーマ (BPM180)
const BGM1 = {
    tempo:180,
    mel:[NOTE.C4,NOTE.Eb4,NOTE.G4,NOTE.C4, NOTE.Ab3,NOTE.Eb4,NOTE.G4,NOTE.R,
         NOTE.Bb3,NOTE.D4,NOTE.F4,NOTE.Bb3, NOTE.G3,NOTE.D4,NOTE.F4,NOTE.R,
         NOTE.C4,NOTE.Eb4,NOTE.Ab4,NOTE.G4, NOTE.F4,NOTE.Eb4,NOTE.D4,NOTE.C4,
         NOTE.Bb3,NOTE.D4,NOTE.G4,NOTE.F4, NOTE.Eb4,NOTE.D4,NOTE.C4,NOTE.R],
    bas:[NOTE.C3,NOTE.R,NOTE.C3,NOTE.G3, NOTE.Ab3,NOTE.R,NOTE.Ab3,NOTE.Eb3,
         NOTE.Bb3,NOTE.R,NOTE.Bb3,NOTE.F3, NOTE.G3,NOTE.R,NOTE.G3,NOTE.D3,
         NOTE.C3,NOTE.R,NOTE.C3,NOTE.G3, NOTE.F3,NOTE.R,NOTE.F3,NOTE.C3,
         NOTE.Bb3,NOTE.R,NOTE.Bb3,NOTE.F3, NOTE.G3,NOTE.R,NOTE.G3,NOTE.R],
};
// Stage2: Eマイナー 氷のワルツ風 (BPM150)
const BGM2 = {
    tempo:150,
    mel:[NOTE.E4,NOTE.G4,NOTE.B4,NOTE.E4, NOTE.D4,NOTE.G4,NOTE.B4,NOTE.R,
         NOTE.C4,NOTE.E4,NOTE.A4,NOTE.C4, NOTE.B3,NOTE.E4,NOTE.G4,NOTE.R,
         NOTE.E4,NOTE.Ab4,NOTE.B4,NOTE.E5, NOTE.D5,NOTE.B4,NOTE.G4,NOTE.E4,
         NOTE.C4,NOTE.E4,NOTE.A4,NOTE.G4, NOTE.E4,NOTE.D4,NOTE.B3,NOTE.R],
    bas:[NOTE.E3,NOTE.R,NOTE.B3,NOTE.E3, NOTE.D3,NOTE.R,NOTE.G3,NOTE.D3,
         NOTE.C3,NOTE.R,NOTE.E3,NOTE.A3, NOTE.B3,NOTE.R,NOTE.E3,NOTE.B3,
         NOTE.E3,NOTE.R,NOTE.B3,NOTE.E3, NOTE.D3,NOTE.R,NOTE.G3,NOTE.D3,
         NOTE.C3,NOTE.R,NOTE.A3,NOTE.E3, NOTE.B3,NOTE.R,NOTE.E3,NOTE.R],
};
// Stage3: Aマイナー 灼熱のアグレッシブ (BPM210)
const BGM3 = {
    tempo:210,
    mel:[NOTE.A4,NOTE.C5,NOTE.E5,NOTE.A4, NOTE.G4,NOTE.C5,NOTE.E5,NOTE.R,
         NOTE.F4,NOTE.A4,NOTE.D5,NOTE.F4, NOTE.E4,NOTE.A4,NOTE.C5,NOTE.R,
         NOTE.A4,NOTE.C5,NOTE.F5,NOTE.E5, NOTE.D5,NOTE.C5,NOTE.A4,NOTE.G4,
         NOTE.F4,NOTE.A4,NOTE.D5,NOTE.C5, NOTE.A4,NOTE.G4,NOTE.E4,NOTE.R],
    bas:[NOTE.A3,NOTE.R,NOTE.A3,NOTE.E3, NOTE.G3,NOTE.R,NOTE.G3,NOTE.C3,
         NOTE.F3,NOTE.R,NOTE.F3,NOTE.D3, NOTE.E3,NOTE.R,NOTE.E3,NOTE.A3,
         NOTE.A3,NOTE.R,NOTE.A3,NOTE.E3, NOTE.D3,NOTE.R,NOTE.D3,NOTE.F3,
         NOTE.F3,NOTE.R,NOTE.F3,NOTE.D3, NOTE.E3,NOTE.R,NOTE.A3,NOTE.R],
};

// 村BGM: 穏やかな牧歌的メロディ (BPM100)
const BGM_HUB = {
    tempo:100,
    mel:[NOTE.E4,NOTE.G4,NOTE.A4,NOTE.G4, NOTE.E4,NOTE.D4,NOTE.E4,NOTE.R,
         NOTE.C4,NOTE.E4,NOTE.G4,NOTE.E4, NOTE.D4,NOTE.C4,NOTE.D4,NOTE.R,
         NOTE.E4,NOTE.G4,NOTE.B4,NOTE.A4, NOTE.G4,NOTE.E4,NOTE.D4,NOTE.E4,
         NOTE.C4,NOTE.D4,NOTE.E4,NOTE.G4, NOTE.E4,NOTE.D4,NOTE.C4,NOTE.R],
    bas:[NOTE.C3,NOTE.R,NOTE.E3,NOTE.R, NOTE.A3,NOTE.R,NOTE.G3,NOTE.R,
         NOTE.F3,NOTE.R,NOTE.A3,NOTE.R, NOTE.G3,NOTE.R,NOTE.E3,NOTE.R,
         NOTE.C3,NOTE.R,NOTE.E3,NOTE.R, NOTE.F3,NOTE.R,NOTE.G3,NOTE.R,
         NOTE.A3,NOTE.R,NOTE.G3,NOTE.R, NOTE.E3,NOTE.R,NOTE.C3,NOTE.R],
};

const BGMS = [BGM1, BGM2, BGM3];
let bgmStep = 0;
let currentBgmIdx = 0;

function startBGM(stageIdx) {
    if (bgmPlaying) return;
    bgmPlaying = true;
    bgmStep = 0;
    currentBgmIdx = stageIdx || 0;
    const bgm = BGMS[currentBgmIdx] || BGMS[0];
    const beat = 60000 / bgm.tempo;
    bgmInterval = setInterval(()=>{
        if (!audioCtx || state === S.TITLE || state === S.HUB) return;
        const i = bgmStep % bgm.mel.length;
        const mel = bgm.mel[i];
        const bas = bgm.bas[i];
        if (mel > 0) playTone(mel, beat/1000 * 0.8, 'square', 0.12);
        if (bas > 0) playTone(bas, beat/1000 * 0.8, 'triangle', 0.15);
        if (i%4===0) playNoise(0.06, 0.12);
        if (i%2===1) playNoise(0.02, 0.06);
        bgmStep++;
    }, beat);
}

// 村専用BGM
let hubBgmInterval = null;
let hubBgmStep = 0;
function startHubBGM() {
    if (hubBgmInterval) return;
    hubBgmStep = 0;
    const bgm = BGM_HUB;
    const beat = 60000 / bgm.tempo;
    hubBgmInterval = setInterval(()=>{
        if (!audioCtx || state !== S.HUB) return;
        const i = hubBgmStep % bgm.mel.length;
        const mel = bgm.mel[i];
        const bas = bgm.bas[i];
        if (mel > 0) playTone(mel, beat/1000 * 0.9, 'triangle', 0.08);
        if (bas > 0) playTone(bas, beat/1000 * 0.9, 'sine', 0.06);
        // 軽いパーカッション（柔らかく）
        if (i%8===0) playNoise(0.03, 0.04);
        hubBgmStep++;
    }, beat);
}
function stopHubBGM() {
    if (hubBgmInterval) { clearInterval(hubBgmInterval); hubBgmInterval = null; }
}

function stopBGM() {
    bgmPlaying = false;
    if (bgmInterval) { clearInterval(bgmInterval); bgmInterval = null; }
}

// ---- 定数 ----
const GRAVITY     = 0.20;    // ふわっとジャンプ（滞空1.5倍）
const FRICTION    = 0.78;
const BASE_MOVE_SPEED = 0.65;
const BASE_JUMP_FORCE = -7.4; // ふわっとジャンプ（滞空1.5倍）
const TILE        = 40;
const COLS        = Math.ceil(canvas.width  / TILE);
const ROWS        = Math.ceil(canvas.height / TILE);

// ---- ゲーム状態 ----
const S = { TITLE:'title', PLAY:'play', OVER:'over', CLEAR:'clear', READY:'ready', REWARD:'reward', DEBUG_MENU:'debug_menu', HUB:'hub' };
let state    = S.TITLE;
let score    = 0;
let wave     = 1;           // ウェーブ（敵を全滅で次へ）
let enemies  = [];
let bullets  = [];
let items    = [];
let particles= [];
let movingPlatforms = [];   // 動く床
let crumblingBlocks = [];   // 崩れる床
let cameraX  = 0;
let shakeAmt = 0;
let levelMap = [];
let goal     = null;
let currentLevelIdx = 0;
let enemyBullets = [];  // 敵弾
let lives = 5;
let readyTimer = 0;
let savedUpgrades = null; // 面開始時の能力バックアップ
let savedWeapon = 'PISTOL';
let savedHp = 100;
let savedMaxHp = 100;
let savedEpic = {};

// ---- 拠点（ハブ）システム ----
let gold = 0;
let materials = 0;
let highestLevelCleared = -1; // クリアした最高レベル
const HUB_UPGRADES = {
    maxHp:       { level:0, max:10, baseCost:400,  costMul:1.5, label:'最大HP',       desc:'+20 HP',         icon:'♥',  color:'#ff8844' },
    attack:      { level:0, max:10, baseCost:500,  costMul:1.6, label:'攻撃力',       desc:'+15% ダメージ',  icon:'⚔',  color:'#ff4444' },
    moveSpeed:   { level:0, max:8,  baseCost:300,  costMul:1.4, label:'移動速度',     desc:'+8% 速度',       icon:'»',  color:'#44ffaa' },
    jumpPower:   { level:0, max:6,  baseCost:350,  costMul:1.4, label:'跳躍力',       desc:'+6% ジャンプ',   icon:'↑',  color:'#88ffff' },
    fireRate:    { level:0, max:8,  baseCost:450,  costMul:1.5, label:'攻撃速度',     desc:'+10% 速射',      icon:'⚡',  color:'#ffdd00' },
    bulletSize:  { level:0, max:6,  baseCost:400,  costMul:1.4, label:'弾サイズ',     desc:'+10% 弾肥大',    icon:'◎',  color:'#ff44cc' },
    multiShot:   { level:0, max:5,  baseCost:750,  costMul:1.8, label:'弾数',         desc:'+1 弾',          icon:'◉',  color:'#00e5ff' },
    shield:      { level:0, max:5,  baseCost:1000, costMul:2.0, label:'バリア',       desc:'+20 シールド',   icon:'◇',  color:'#00ccff' },
    extraLife:   { level:0, max:3,  baseCost:1500, costMul:2.5, label:'残機',         desc:'+1 残機',        icon:'♥♥', color:'#fc0'    },
};
let hubCursor = 0;
let hubScroll = 0;
let hubMessage = '';
let hubMessageTimer = 0;
// 面クリア時の報酬
let stageRewardGold = 0;
let stageRewardMaterials = 0;

function getUpgradeCost(key) {
    const u = HUB_UPGRADES[key];
    return Math.floor(u.baseCost * Math.pow(u.costMul, u.level));
}
function getMaterialCost(key) {
    const u = HUB_UPGRADES[key];
    return Math.floor((u.level * 2 + 3) * 2);
}

// ---- 報酬選択（ローグライク） ----
let rewardChoices = [];   // 3つのアイテムキー
let rewardSelected = 0;   // 現在のカーソル位置

// ---- マウス ----
const mouse = { x: canvas.width/2, y: canvas.height/2, down: false };
canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width  / r.width);
    mouse.y = (e.clientY - r.top)  * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', e => {
    if (e.button === 0) {
        mouse.down = true; initAudio();
        // 報酬画面でのクリック選択
        if (state === S.REWARD) {
            const numC = rewardChoices.length;
            const cardW = 170, cardH = 310, gap = 24;
            const totalW = cardW * numC + gap * (numC - 1);
            const startX = (canvas.width - totalW) / 2;
            const cardY = 110;
            for (let i = 0; i < numC; i++) {
                const cx = startX + i * (cardW + gap);
                if (mouse.x >= cx && mouse.x <= cx+cardW && mouse.y >= cardY && mouse.y <= cardY+cardH) {
                    rewardSelected = i;
                    applyReward();
                    break;
                }
            }
        }
        // マップエディタでのクリック
        if (mapEditorActive && state === S.PLAY) {
            mapEditorHandleClick();
        }
        // デバッグメニューでのクリック選択
        if (state === S.DEBUG_MENU) {
            handleDebugMenuClick();
        }
        // 拠点でのクリック選択
        if (state === S.HUB) {
            handleHubClick();
        }
    }
});
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouse.down = false; });

// ---- キー ----
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
    initAudio(); // 初回ユーザー操作でAudio初期化
    if (state === S.TITLE && e.code === 'Space') enterHub();
    if (state === S.OVER  && e.code === 'Space') enterHub();
    if (state === S.CLEAR && e.code === 'Space') enterHub();
    if (state === S.READY && e.code === 'Space') { readyTimer = 1; } // スキップ
    // 報酬選択
    if (state === S.REWARD) {
        const n = rewardChoices.length || 3;
        if (e.code === 'ArrowLeft'  || e.code === 'KeyA') rewardSelected = (rewardSelected + n - 1) % n;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') rewardSelected = (rewardSelected + 1) % n;
        if (e.code === 'Space' || e.code === 'Enter') applyReward();
    }
    // デバッグメニュー
    if (state === S.DEBUG_MENU) {
        handleDebugMenuKey(e);
    }
    // 拠点キー操作
    if (state === S.HUB) {
        handleHubKey(e);
    }
    // デバッグメニュー開閉 (F1)
    if (e.code === 'F1' && (state === S.PLAY || state === S.HUB)) {
        e.preventDefault();
        openDebugMenu();
    }
    // マップエディタ開閉 (F2)
    if (e.code === 'F2' && (state === S.PLAY || state === S.HUB)) {
        e.preventDefault();
        if (mapEditorActive) closeMapEditor();
        else if (state === S.PLAY) openMapEditor();
    }
    // マップエディタキー操作
    if (mapEditorActive) {
        mapEditorHandleKey(e);
    }
});
window.addEventListener('keyup', e => keys[e.code] = false);

// ============================================================
//  武器定義
// ============================================================
const WEAPONS = {
    PISTOL:  { name:'ピストル',   dmg:28,  cd:30, spd:14, spread:0.04, color:'#00e5ff', glow:'#003344', pellets:1, piercing:false, bouncing:false, explosive:false, melee:false },
    SHOTGUN: { name:'ショットガン',dmg:45,  cd:60, spd:10, spread:0.25, color:'#ff6a00', glow:'#332000', pellets:6, piercing:false, bouncing:false, explosive:false, melee:false },
    SMG:     { name:'SMG',        dmg:14,  cd:12, spd:16, spread:0.11, color:'#00ff88', glow:'#003322', pellets:1, piercing:false, bouncing:false, explosive:false, melee:false },
    SNIPER:  { name:'スナイパー', dmg:200, cd:75, spd:22, spread:0.00, color:'#ff00ff', glow:'#220033', pellets:1, piercing:true,  bouncing:false, explosive:false, melee:false },
    PLASMA:  { name:'プラズマ',   dmg:70,  cd:45, spd:9,  spread:0.09, color:'#aa00ff', glow:'#110022', pellets:1, piercing:false, bouncing:true,  explosive:true,  explodeR:65, melee:false },
    SWORD:   { name:'魔剣',       dmg:120, cd:20, spd:0,  spread:0,    color:'#ff4444', glow:'#330000', pellets:1, piercing:true,  bouncing:false, explosive:false, melee:true, range:60 },
    LASER:   { name:'レーザー',   dmg:8,   cd:2,  spd:30, spread:0.00, color:'#ff0044', glow:'#440011', pellets:1, piercing:true,  bouncing:false, explosive:false, melee:false, laser:true },
};

// ============================================================
//  レアリティシステム
// ============================================================
const RARITY_DEFS = {
    1: { label:'コモン',     color:'#bbbbbb', glow:'#555555', mult: 0.6 },
    2: { label:'アンコモン', color:'#44ff66', glow:'#116622', mult: 1.0 },
    3: { label:'レア',       color:'#4488ff', glow:'#112266', mult: 1.6 },
    4: { label:'エピック',   color:'#cc44ff', glow:'#440088', mult: 2.5 },
};
const RARITY_WEIGHTS = [
    { rarity:1, weight:50 },
    { rarity:2, weight:35 },
    { rarity:3, weight:10 },
    { rarity:4, weight:5 },
];
function rollRarity() {
    let r = Math.random() * 100, acc = 0;
    for (const rw of RARITY_WEIGHTS) { acc += rw.weight; if (r < acc) return rw.rarity; }
    return 1;
}

// ============================================================
//  プレイヤー
// ============================================================
const player = {
    x:80, y:0, w:24, h:34,
    vx:0, vy:0,
    onGround:false, facing:1,
    invincible:0,
    hp:100, maxHp:100,
    weapon:'PISTOL',
    fireCd:0,
    upgrades:{ multiShot:1, fireRate:1.0, bulletSize:1.0, moveSpeed:1.0, jumpPower:1.0 },
    extraJumps:0, maxExtraJumps:0, // エピック:空中ジャンプ
    hasMagnet:false, // エピック:アイテム磁石
    hasShield:false, shieldHp:0, // エピック:シールド
    hasLifeSteal:false, // エピック:吸血
    animTimer:0,
    stomping:false,
};

// ============================================================
//  弾丸クラス
// ============================================================
class Bullet {
    constructor(x, y, vx, vy, wKey, sizeScale) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.alive = true;
        const W = WEAPONS[wKey];
        this.dmg       = Math.floor(W.dmg * getHubAttackMul());
        this.color     = W.color;
        this.glow      = W.glow;
        this.piercing  = W.piercing;
        this.bouncing  = W.bouncing;
        this.explosive = W.explosive;
        this.explodeR  = W.explodeR || 0;
        this.laser     = W.laser || false;
        this.size      = (wKey === 'SNIPER' ? 4 : wKey === 'PLASMA' ? 7 : wKey === 'LASER' ? 2 : 3.5) * sizeScale;
        this.bounceLeft= this.bouncing ? 4 : 0;
        this.trail     = [];
        this.age       = 0;
    }
    update() {
        if (!this.alive) return;
        this.age++;
        this.trail.push({x:this.x, y:this.y});
        if (this.trail.length > 10) this.trail.shift();
        this.x += this.vx;
        this.y += this.vy;
        if (!this.piercing) this.vy += 0.04;
        // 画面外
        const maxX = levelMap[0] ? levelMap[0].length * TILE + 200 : 9999;
        if (this.x < -200 || this.x > maxX || this.y < -300 || this.y > canvas.height + 100)
            this.alive = false;
        // タイル衝突
        this._checkTiles();
    }
    _checkTiles() {
        const col = Math.floor(this.x / TILE);
        const row = Math.floor(this.y / TILE);
        if (row >= 0 && row < levelMap.length && col >= 0 && col < levelMap[0].length) {
            if (levelMap[row][col] === 1 || levelMap[row][col] === 2) {
                if (this.bouncing && this.bounceLeft > 0) {
                    this.vy *= -0.85;
                    this.vx *= 0.9;
                    this.bounceLeft--;
                    spawnParticles(this.x, this.y, this.color, 4, 2);
                } else {
                    this.kill();
                }
            }
        }
    }
    kill() {
        this.alive = false;
        if (this.explosive) this._explode();
        spawnParticles(this.x, this.y, this.color, 6, 3);
    }
    _explode() {
        shakeAmt = 12;
        spawnParticles(this.x, this.y, this.color, 25, 8);
        for (const e of enemies) {
            if (!e.alive) continue;
            const dx = e.x + e.w/2 - this.x, dy = e.y + e.h/2 - this.y;
            if (Math.sqrt(dx*dx+dy*dy) < this.explodeR) {
                e.takeDamage(this.dmg * 0.6);
            }
        }
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = this.x - camX;
        if (sx < -60 || sx > canvas.width + 60) return;
        const s = Math.max(2, this.size);
        // トレイル（ドット）
        for (let i = 0; i < this.trail.length; i+=2) {
            const a = (i / this.trail.length) * 0.6;
            ctx.globalAlpha = a;
            px(this.trail[i].x - camX - 1, this.trail[i].y - 1, 1, 1, this.color);
        }
        ctx.globalAlpha = 1;
        // 本体
        if (this.laser) {
            // レーザー: 長い線として描画
            for (let i = 0; i < this.trail.length; i++) {
                pxRect(this.trail[i].x - camX - 1, this.trail[i].y - 1, 2, 2, this.color);
            }
            pxRect(sx - 1, this.y - 1, 3, 3, '#fff');
            pxRect(sx - s, this.y - s, s*2, s*2, this.color);
        } else {
            pxRect(sx - s, this.y - s, s*2, s*2, this.color);
        }
        // 中心ハイライト
        pxRect(sx - 1, this.y - 1, 2, 2, '#fff');
    }
}

// ============================================================
//  敵弾クラス（ゆっくり・大きく・光る警告弾）
// ============================================================
class EnemyBullet {
    constructor(x, y, vx, vy, size, color) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.alive = true;
        this.size = size || 8;
        this.color = color || '#ffaa00';
        this.t = 0;
        this.dmg = Math.floor(15 * getEnemyDmgScale());
    }
    update() {
        if (!this.alive) return;
        this.t++;
        this.x += this.vx;
        this.y += this.vy;
        // タイル衝突
        const col = Math.floor(this.x / TILE);
        const row = Math.floor(this.y / TILE);
        if (row >= 0 && row < levelMap.length && col >= 0 && col < (levelMap[0]||[]).length) {
            if (levelMap[row][col] === 1 || levelMap[row][col] === 2) {
                this.alive = false;
                spawnParticles(this.x, this.y, this.color, 5, 3);
            }
        }
        // 画面外
        const maxX = levelMap[0] ? levelMap[0].length * TILE + 200 : 9999;
        if (this.x < -200 || this.x > maxX || this.y < -200 || this.y > canvas.height + 200)
            this.alive = false;
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = this.x - camX;
        if (sx < -40 || sx > canvas.width + 40) return;
        const s = Math.max(4, this.size);
        const blink = Math.floor(this.t/4)%2;
        // 外枠（点滅）
        if (blink) pxRect(sx-s-2, this.y-s-2, s*2+4, s*2+4, this.color);
        // 本体
        pxRect(sx-s, this.y-s, s*2, s*2, blink ? '#fff' : this.color);
        // 十字
        pxRect(sx-s-4, this.y-1, s*2+8, 2, this.color);
        pxRect(sx-1, this.y-s-4, 2, s*2+8, this.color);
    }
}

// 敵が弾をプレイヤー方向に撃つヘルパー
function enemyShoot(ex, ey, speed, size, color, count, spreadAngle) {
    const dx = player.x + player.w/2 - ex;
    const dy = player.y + player.h/2 - ey;
    const base = Math.atan2(dy, dx);
    count = count || 1;
    spreadAngle = spreadAngle || 0;
    for (let i = 0; i < count; i++) {
        const a = count > 1
            ? base + (i - (count-1)/2) * spreadAngle
            : base;
        enemyBullets.push(new EnemyBullet(
            ex, ey,
            Math.cos(a) * speed,
            Math.sin(a) * speed,
            size, color
        ));
    }
}

// ============================================================
//  パーティクル
// ============================================================
class Particle {
    constructor(x, y, color, speed, size) {
        this.x = x; this.y = y;
        this.vx = (Math.random()-0.5)*speed;
        this.vy = (Math.random()-0.5)*speed - Math.random()*speed*0.5;
        this.color = color;
        this.size  = Math.random()*size + 1;
        this.life  = 35 + Math.random()*20 | 0;
        this.maxL  = this.life;
    }
    update() { this.x+=this.vx; this.y+=this.vy; this.vy+=0.15; this.life--; }
    draw(camX) {
        const a = this.life / this.maxL;
        ctx.globalAlpha = a;
        const s = Math.max(PX, Math.round(this.size * a / PX) * PX);
        pxRect(this.x - camX - s/2, this.y - s/2, s, s, this.color);
        ctx.globalAlpha = 1;
    }
}
function spawnParticles(x, y, color, count, size=3) {
    for (let i=0; i<count; i++) particles.push(new Particle(x, y, color, 5, size));
}

// ============================================================
//  アイテムクラス
// ============================================================
const ITEM_DEFS = {
    // 通常アイテム (コモン～レアで出現)
    MULTISHOT:      { label:'+弾数',       color:'#00e5ff', icon:'◉',      maxRarity:3 },
    FIRERATE:       { label:'+速射',       color:'#ffdd00', icon:'⚡',     maxRarity:3 },
    BULLETSIZE:     { label:'+弾肥大化',   color:'#ff44cc', icon:'◎',      maxRarity:3 },
    SPEED_UP:       { label:'+移動速度',   color:'#44ffaa', icon:'»',      maxRarity:3 },
    JUMP_UP:        { label:'+跳躍力',     color:'#88ffff', icon:'↑',      maxRarity:3 },
    HEAL:           { label:'HP回復',      color:'#22ff44', icon:'+',      maxRarity:3 },
    MAXHP_UP:       { label:'+最大HP',     color:'#ff8844', icon:'♥',      maxRarity:3 },
    WEAPON_SHOTGUN: { label:'ショットガン', color:'#ff6a00', icon:'shotgun', maxRarity:3 },
    WEAPON_SMG:     { label:'SMG',         color:'#00ff88', icon:'smg',     maxRarity:3 },
    WEAPON_SNIPER:  { label:'スナイパー',   color:'#ff00ff', icon:'sniper', maxRarity:3 },
    WEAPON_PLASMA:  { label:'プラズマ',    color:'#aa00ff', icon:'plasma',  maxRarity:3 },
    WEAPON_SWORD:   { label:'魔剣',        color:'#ff4444', icon:'sword',   maxRarity:3 },
    // エピック専用
    EXTRA_JUMP:     { label:'空中ジャンプ', color:'#cc44ff', icon:'⇈',     minRarity:4, maxRarity:4 },
    WEAPON_LASER:   { label:'レーザー',    color:'#ff0044', icon:'laser',   minRarity:4, maxRarity:4 },
    MAGNET:         { label:'磁力フィールド', color:'#ffcc00', icon:'⊕',   minRarity:4, maxRarity:4 },
    SHIELD:         { label:'バリア',      color:'#00ccff', icon:'◇',      minRarity:4, maxRarity:4 },
    LIFE_STEAL:     { label:'吸血',        color:'#cc0044', icon:'♦',      minRarity:4, maxRarity:4 },
};
class Item {
    constructor(x, y, type, rarity) {
        this.x = x; this.y = y;
        this.type = type;
        this.rarity = rarity || 2;
        this.collected = false;
        this.t = Math.random()*Math.PI*2;
        this.w = 30; this.h = 30;
    }
    update() { this.t += 0.05; }
    draw(camX) {
        if (this.collected) return;
        const sx = this.x - camX;
        if (sx < -40 || sx > canvas.width+40) return;
        const d = ITEM_DEFS[this.type];
        if (!d) return;
        const rd = RARITY_DEFS[this.rarity];
        const hover = Math.round(Math.sin(this.t)*4);
        const bx = Math.round(sx-12), by = Math.round(this.y-12+hover);
        // 箱（黒背景+レアリティ色枠）
        pxRect(bx, by, 24, 24, '#000');
        pxRect(bx, by, 24, 2, rd.color);
        pxRect(bx, by+22, 24, 2, rd.color);
        pxRect(bx, by, 2, 24, rd.color);
        pxRect(bx+22, by, 2, 24, rd.color);
        // アイコン描画
        drawItemIcon(d.icon, sx, this.y+hover, d.color);
        // レアリティ名表示
        if (this.rarity >= 3) {
            ctx.fillStyle = rd.color; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
            ctx.fillText(rd.label, sx, this.y - 16 + hover);
            ctx.textAlign = 'left';
        }
    }
    applyTo() {
        applyItemEffect(this.type, this.rarity);
        this.collected = true;
        const d = ITEM_DEFS[this.type];
        const rd = RARITY_DEFS[this.rarity];
        spawnParticles(this.x, this.y, d.color, 14, 4);
        showPickupText(`${rd.label} ${d.label}`, rd.color);
    }
}

// アイテム効果適用（共通関数）
function applyItemEffect(type, rarity) {
    const m = RARITY_DEFS[rarity].mult;
    if      (type === 'MULTISHOT')  player.upgrades.multiShot   = Math.min(player.upgrades.multiShot + Math.max(1, Math.round(1 * m)), 12);
    else if (type === 'FIRERATE')   player.upgrades.fireRate     = Math.min(player.upgrades.fireRate  * (1 + 0.15 * m), 6);
    else if (type === 'BULLETSIZE') player.upgrades.bulletSize   = Math.min(player.upgrades.bulletSize* (1 + 0.2 * m), 5);
    else if (type === 'SPEED_UP')   player.upgrades.moveSpeed    = Math.min(player.upgrades.moveSpeed * (1 + 0.12 * m), 3);
    else if (type === 'JUMP_UP')    player.upgrades.jumpPower    = Math.min(player.upgrades.jumpPower * (1 + 0.1 * m), 2.5);
    else if (type === 'HEAL')       player.hp = Math.min(player.hp + Math.round(15 * m), player.maxHp);
    else if (type === 'MAXHP_UP')  { const v = Math.round(10 * m); player.maxHp += v; player.hp = Math.min(player.hp + v, player.maxHp); }
    else if (type === 'EXTRA_JUMP') { player.maxExtraJumps += 1; player.extraJumps = player.maxExtraJumps; }
    else if (type === 'MAGNET')     player.hasMagnet = true;
    else if (type === 'SHIELD')    { player.hasShield = true; player.shieldHp = Math.min(player.shieldHp + 50, 100); }
    else if (type === 'LIFE_STEAL') player.hasLifeSteal = true;
    else if (type === 'WEAPON_LASER') player.weapon = 'LASER';
    else if (type.startsWith('WEAPON_')) player.weapon = type.replace('WEAPON_','');
    sfxItemPickup();
}

// ステージ中の身体能力系アイテム（拠点で強化するもの）を低確率に
const BODY_STAT_ITEMS = new Set(['SPEED_UP','JUMP_UP','MAXHP_UP']);

// レアリティに適合するアイテムをランダムに選出
function rollItemWithRarity(forReward) {
    const rarity = rollRarity();
    let keys = Object.keys(ITEM_DEFS).filter(k => {
        const d = ITEM_DEFS[k];
        const minR = d.minRarity || 1;
        const maxR = d.maxRarity || 4;
        return rarity >= minR && rarity <= maxR;
    });
    // ステージ中は身体能力アイテムの出現率を大幅低下（70%の確率で除外）
    if (!forReward && Math.random() < 0.7) {
        const filtered = keys.filter(k => !BODY_STAT_ITEMS.has(k));
        if (filtered.length > 0) keys = filtered;
    }
    const key = keys[Math.floor(Math.random() * keys.length)];
    return { type: key, rarity };
}

// 武器ピクセルアイコン描画
function drawItemIcon(icon, cx, cy, color) {
    const x = Math.round(cx), y = Math.round(cy);
    if (icon === 'shotgun') {
        // ショットガン: 太い銃身+ストック
        pxRect(x-8, y-1, 16, 4, color);
        pxRect(x-10, y-2, 4, 6, '#864');
        pxRect(x+6, y+1, 4, 4, '#864');
    } else if (icon === 'smg') {
        // SMG: 短い銃身+マガジン
        pxRect(x-6, y-1, 14, 3, color);
        pxRect(x-2, y+2, 3, 5, color);
        pxRect(x-8, y-2, 4, 5, '#864');
    } else if (icon === 'sniper') {
        // スナイパー: 長い銃身+スコープ
        pxRect(x-10, y, 22, 2, color);
        pxRect(x+2, y-3, 4, 3, color);
        pxRect(x-10, y-1, 4, 4, '#864');
    } else if (icon === 'plasma') {
        // プラズマ: SF風の太い砲身
        pxRect(x-6, y-2, 14, 6, color);
        pxRect(x+6, y-3, 4, 8, color);
        pxRect(x-8, y-1, 4, 4, '#648');
    } else if (icon === 'sword') {
        // 剣: 刃+鍔+柄
        pxRect(x-1, y-10, 3, 14, '#ddd'); // 刃
        pxRect(x-1, y-11, 3, 2, '#fff');  // 先端
        pxRect(x-4, y+3, 9, 2, color);    // 鍔
        pxRect(x, y+5, 2, 5, '#864');     // 柄
    } else if (icon === 'laser') {
        // レーザー: SF風レーザー砲
        pxRect(x-10, y-1, 20, 3, color);
        pxRect(x-12, y-3, 6, 7, '#622');
        pxRect(x+6, y-2, 6, 5, color);
        px(x+10, y-1, 3, 3, '#fff');
    } else {
        // その他のアイテム: テキストアイコン
        ctx.fillStyle = color;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(icon, cx, cy + 5);
        ctx.textAlign = 'left';
    }
}

// ============================================================
//  通貨ドロップ（物理アイテム）
// ============================================================
let currencyDrops = [];
class CurrencyDrop {
    constructor(x, y, type, amount) {
        this.x = x; this.y = y;
        this.type = type; // 'gold' or 'material'
        this.amount = amount;
        this.vy = -3 - Math.random()*3;
        this.vx = (Math.random()-0.5)*4;
        this.collected = false;
        this.t = 0;
        this.onGround = false;
    }
    update() {
        this.t++;
        if (!this.onGround) {
            this.vy += GRAVITY;
            this.y += this.vy;
            this.x += this.vx;
            this.vx *= 0.98;
            // 地面衝突
            const row = Math.floor((this.y+8)/TILE);
            const col = Math.floor(this.x/TILE);
            if (row>=0 && row<levelMap.length && col>=0 && col<(levelMap[0]||[]).length) {
                if (levelMap[row][col]===1||levelMap[row][col]===2) {
                    this.y = row*TILE - 8;
                    this.vy = 0;
                    this.onGround = true;
                }
            }
            if (this.y > canvas.height + 50) this.collected = true; // 落下消滅
        }
        // 磁石効果（プレイヤーに引き寄せ）
        if (player.hasMagnet || this.t > 60) {
            const dx = (player.x+player.w/2) - this.x;
            const dy = (player.y+player.h/2) - this.y;
            const dist = Math.sqrt(dx*dx+dy*dy);
            const range = player.hasMagnet ? 250 : 120;
            if (dist < range) {
                const spd = player.hasMagnet ? 4 : 2;
                this.x += dx/dist * spd;
                this.y += dy/dist * spd;
                this.onGround = false;
            }
        }
        // プレイヤーとの接触
        if (Math.abs(player.x+player.w/2 - this.x) < 20 && Math.abs(player.y+player.h/2 - this.y) < 20) {
            this.collected = true;
            if (this.type === 'gold') {
                gold += this.amount;
                showPickupText(`+${this.amount}G`, '#fc0');
            } else {
                materials += this.amount;
                showPickupText(`+${this.amount}素材`, '#8cf');
            }
            sfxItemPickup();
        }
    }
    draw(camX) {
        if (this.collected) return;
        const sx = this.x - camX;
        if (sx < -20 || sx > canvas.width+20) return;
        const hover = Math.sin(this.t*0.1)*2;
        if (this.type === 'gold') {
            // コイン
            pxRect(Math.round(sx-5), Math.round(this.y-5+hover), 10, 10, '#da0');
            pxRect(Math.round(sx-3), Math.round(this.y-3+hover), 6, 6, '#fc0');
            px(Math.round(sx-1), Math.round(this.y-1+hover), 2, 2, '#fe8');
        } else {
            // 素材（結晶）
            pxRect(Math.round(sx-4), Math.round(this.y-6+hover), 8, 12, '#48c');
            pxRect(Math.round(sx-2), Math.round(this.y-8+hover), 4, 4, '#6af');
            px(Math.round(sx-1), Math.round(this.y-3+hover), 2, 2, '#adf');
        }
    }
}

// アイテム取得テキスト演出
let pickupTexts = [];
function showPickupText(text, color) {
    pickupTexts.push({ text, color, x:player.x, y:player.y - 20, life:60, maxL:60 });
}

// ============================================================
//  敵クラス群
// ============================================================

// 基底クラス
class Enemy {
    constructor(x, y, w, h, hp, spd, col, dropRate) {
        this.x=x; this.y=y; this.w=w; this.h=h;
        this.hp=hp; this.maxHp=hp; this.spd=spd;
        this.color=col; this.dropRate=dropRate;
        this.vx=0; this.vy=0;
        this.alive=true; this.onGround=false;
        this.t=Math.random()*100;
        this.sleeping=false; // trueの間は動かない
        this.activateRange=800; // プレイヤーがこの距離以内で覚醒（画面に入る前に起動）
    }
    _checkWake() {
        if (!this.sleeping) return true;
        const dx = player.x - this.x, dy = player.y - this.y;
        if (Math.sqrt(dx*dx+dy*dy) < this.activateRange) {
            this.sleeping = false;
            return true;
        }
        return false;
    }
    rect() { return {x:this.x,y:this.y,w:this.w,h:this.h}; }
    takeDamage(dmg) {
        this.hp -= dmg;
        shakeAmt = Math.max(shakeAmt, 3);
        spawnParticles(this.x+this.w/2, this.y+this.h/2, '#cc0000', 5, 3);
        if (this.hp <= 0) this.die(); else sfxEnemyHit();
    }
    die() {
        this.alive = false;
        score += this.scoreVal || 100;
        sfxEnemyDie();
        spawnParticles(this.x+this.w/2, this.y+this.h/2, this.color, 18, 5);
        spawnParticles(this.x+this.w/2, this.y+this.h/2, '#660000', 12, 4);
        shakeAmt = Math.max(shakeAmt, 6);
        if (Math.random() < this.dropRate) this._dropItem();
        // ゴールド＆素材を物理ドロップ
        const cx = this.x+this.w/2, cy = this.y+this.h/2;
        const stageMultiplier = 1 + getStageIdx() * 0.8;
        const baseGold = (this.scoreVal || 100) / 10;
        const goldAmt = Math.floor(baseGold * stageMultiplier * (0.8 + Math.random() * 0.4));
        // ゴールドを複数コインに分割ドロップ
        const coinCount = Math.min(5, Math.max(1, Math.floor(goldAmt / 3)));
        const perCoin = Math.ceil(goldAmt / coinCount);
        for (let i=0; i<coinCount; i++) {
            const amt = (i === coinCount-1) ? goldAmt - perCoin*(coinCount-1) : perCoin;
            if (amt > 0) currencyDrops.push(new CurrencyDrop(cx, cy, 'gold', amt));
        }
        // 素材ドロップ
        if (Math.random() < 0.3 + getStageIdx() * 0.1) {
            const mat = Math.floor((1 + getStageIdx()) * (0.5 + Math.random() * 1.0));
            currencyDrops.push(new CurrencyDrop(cx, cy, 'material', mat));
        }
    }
    _dropItem() {
        const rolled = rollItemWithRarity();
        items.push(new Item(this.x+this.w/2, this.y, rolled.type, rolled.rarity));
    }
    _applyGravity() {
        this.vy += GRAVITY;
        if (this.vy > 14) this.vy = 14;
    }
    // 崖端検出: 進行方向の足元に床がなければ反転
    _edgeCheck() {
        if (!this.onGround) return;
        const ahead = this.vx > 0 ? this.x + this.w + 2 : this.x - 2;
        const below = this.y + this.h + 4;
        const col = Math.floor(ahead / TILE);
        const row = Math.floor(below / TILE);
        if (row >= 0 && row < levelMap.length && col >= 0 && col < (levelMap[0]||[]).length) {
            if (levelMap[row][col] !== 1 && levelMap[row][col] !== 2) {
                this.vx *= -1; // 床がないので反転
            }
        } else {
            this.vx *= -1; // マップ外なので反転
        }
    }
    _moveX() {
        this.x += this.vx;
        const tiles = getTilesAround(this.x, this.y, this.w, this.h);
        for (const t of tiles) {
            if (rectsOverlap({x:this.x,y:this.y,w:this.w,h:this.h}, t)) {
                if (this.vx > 0) { this.x = t.x - this.w; this.vx *= -1; }
                else             { this.x = t.x + t.w;    this.vx *= -1; }
            }
        }
    }
    _moveY() {
        this.y += this.vy;
        this.onGround = false;
        const tiles = getTilesAround(this.x, this.y, this.w, this.h);
        for (const t of tiles) {
            if (rectsOverlap({x:this.x,y:this.y,w:this.w,h:this.h}, t)) {
                if (this.vy > 0) { this.y = t.y - this.h; this.vy=0; this.onGround=true; }
                else             { this.y = t.y + t.h;    this.vy=0; }
            }
        }
        if (this.y > canvas.height + 100) this.die();
    }
    _drawHpBar(camX) {
        const sx = Math.round(this.x - camX);
        const bw = this.w;
        pxRect(sx-1, this.y-9, bw+2, 6, '#000');
        pxRect(sx, this.y-8, bw, 4, '#300');
        pxRect(sx, this.y-8, Math.round(bw*(this.hp/this.maxHp)), 4, '#e00');
    }
}

// ゾンビ（低速・壁で折り返し・たまに射撃）
class Zombie extends Enemy {
    constructor(x, y) {
        super(x, y, 30, 40, 60, 0.7, '#4a0e0e', 0.5);
        this.vx = (Math.random()<0.5?1:-1)*this.spd;
        this.scoreVal = 120;
        this.shootCd = 120 + Math.random()*60|0;
    }
    update() {
        if (!this._checkWake()) return;
        this.t++;
        this._applyGravity();
        this._moveX();
        this._moveY();
        this._edgeCheck();
        // プレイヤー方向に少し引き寄せ
        const dx = player.x - this.x;
        this.vx += Math.sign(dx) * 0.04;
        this.vx = Math.max(-this.spd, Math.min(this.spd, this.vx));
        // 射撃（遅い単発弾）
        this.shootCd--;
        if (this.shootCd <= 0) {
            this.shootCd = 150 + Math.random()*80|0;
            const dist = Math.abs(player.x - this.x);
            if (dist < 500) enemyShoot(this.x+this.w/2, this.y+this.h/3, 2.5, 7, '#ff6633', 1);
        }
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = Math.round(this.x - camX);
        const sy = Math.round(this.y);
        const bob = Math.round(Math.sin(this.t*0.12)*2);
        const y = sy + bob;
        // 体（ピクセルゾンビ）
        pxRect(sx+4, y, 22, 4, '#2a4a0a');       // 頭
        pxRect(sx+2, y+4, 26, 4, '#1a3a06');      // 頭下
        px(sx+6, y+2, 3, 2, '#f00');               // 左目
        px(sx+18, y+2, 3, 2, '#f00');              // 右目
        pxRect(sx+8, y+8, 14, 4, '#1a3a06');       // 首
        pxRect(sx+2, y+12, 26, 16, '#143006');     // 胴体
        pxRect(sx, y+14, 4, 12, '#143006');        // 左腕
        pxRect(sx+26, y+14, 4, 12, '#143006');     // 右腕
        // 脚（歩行アニメ）
        const walk = Math.floor(this.t/8)%2;
        if (walk) {
            pxRect(sx+4, y+28, 8, 12, '#0e200a');
            pxRect(sx+16, y+28, 8, 8, '#0e200a');
        } else {
            pxRect(sx+4, y+28, 8, 8, '#0e200a');
            pxRect(sx+16, y+28, 8, 12, '#0e200a');
        }
        this._drawHpBar(camX);
    }
}

// シェード（飛行・上空旋回→急降下攻撃）
class Shade extends Enemy {
    constructor(x, y) {
        super(x, y, 26, 26, 35, 0.5, '#2200aa', 0.4);
        this.scoreVal = 150;
        this.angle = 0;
        this.mode = 'hover';
        this.hoverTimer = 0;
        this.hoverAngle = Math.random() * Math.PI * 2;
        this.diveTimer = 0;
        this.targetX = 0;
        this.targetY = 0;
    }
    update() {
        if (!this._checkWake()) return;
        this.t++;
        const px = player.x + player.w/2;
        const py = player.y + player.h/2;
        const cx = this.x + this.w/2;
        const cy = this.y + this.h/2;

        if (this.mode === 'hover') {
            // プレイヤーの上空を旋回（80-120px上）
            this.hoverAngle += 0.012;
            this.hoverTimer++;
            const orbitR = 80;
            const targetX = px + Math.cos(this.hoverAngle) * orbitR;
            const targetY = py - 110 + Math.sin(this.hoverAngle * 2) * 20;
            this.vx += (targetX - cx) * 0.008;
            this.vy += (targetY - cy) * 0.008;
            this.vx *= 0.94;
            this.vy *= 0.94;
            // 一定時間旋回したら急降下
            if (this.hoverTimer > 120 + Math.random() * 60) {
                this.mode = 'dive';
                this.diveTimer = 0;
                this.targetX = px;
                this.targetY = py;
            }
        } else if (this.mode === 'dive') {
            // プレイヤーの位置へ急降下
            this.diveTimer++;
            const dx = this.targetX - cx;
            const dy = this.targetY - cy;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            this.vx += (dx/dist) * 0.18;
            this.vy += (dy/dist) * 0.18;
            const spd = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
            const maxDiveSpd = 1.8;
            if (spd > maxDiveSpd) { this.vx = this.vx/spd*maxDiveSpd; this.vy = this.vy/spd*maxDiveSpd; }
            // 突っ込んだか時間切れで上昇帰還
            if (this.diveTimer > 60 || dist < 20) {
                this.mode = 'retreat';
                this.diveTimer = 0;
            }
        } else if (this.mode === 'retreat') {
            // 上空へ戻る
            this.diveTimer++;
            this.vx *= 0.95;
            this.vy -= 0.12;
            this.vy *= 0.95;
            if (this.diveTimer > 50) {
                this.mode = 'hover';
                this.hoverTimer = 0;
                this.hoverAngle = Math.atan2(cy - py, cx - px);
            }
        }

        // 壁との衝突（貫通防止）
        this.x += this.vx;
        const tilesX = getTilesAround(this.x, this.y, this.w, this.h);
        for (const t of tilesX) {
            if (rectsOverlap({x:this.x,y:this.y,w:this.w,h:this.h}, t)) {
                if (this.vx > 0) this.x = t.x - this.w;
                else this.x = t.x + t.w;
                this.vx *= -0.5;
            }
        }
        this.y += this.vy;
        const tilesY = getTilesAround(this.x, this.y, this.w, this.h);
        for (const t of tilesY) {
            if (rectsOverlap({x:this.x,y:this.y,w:this.w,h:this.h}, t)) {
                if (this.vy > 0) this.y = t.y - this.h;
                else this.y = t.y + t.h;
                this.vy *= -0.5;
                if (this.mode === 'dive') { this.mode = 'retreat'; this.diveTimer = 0; }
            }
        }

        this.angle = Math.atan2(this.vy, this.vx);
        if (this.y > canvas.height + 100) this.die();
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = Math.round(this.x - camX);
        const sy = Math.round(this.y);
        const diving = this.mode === 'dive';
        const c1 = diving ? '#a02' : '#40c';
        const c2 = diving ? '#f60' : '#80f';
        const flap = Math.floor(this.t/6)%2;
        // 体（コウモリ風ピクセル）
        pxRect(sx+8, sy+6, 10, 10, c1);           // 胴体
        // 翼
        if (flap) {
            pxRect(sx, sy+4, 8, 6, c1);           // 左翼上
            pxRect(sx+18, sy+4, 8, 6, c1);        // 右翼上
        } else {
            pxRect(sx, sy+10, 8, 6, c1);          // 左翼下
            pxRect(sx+18, sy+10, 8, 6, c1);       // 右翼下
        }
        // 目
        px(sx+9, sy+8, 2, 2, c2);
        px(sx+14, sy+8, 2, 2, c2);
        this._drawHpBar(camX);
    }
}

// デーモン（巨大・高耐久・確定ドロップ・3way射撃）
class Demon extends Enemy {
    constructor(x, y) {
        super(x, y, 48, 56, 350, 0.5, '#880000', 1.0);
        this.vx = (Math.random()<0.5?1:-1)*this.spd;
        this.scoreVal = 600;
        this.shootCd = 80 + Math.random()*40|0;
    }
    update() {
        if (!this._checkWake()) return;
        this.t++;
        this._applyGravity();
        this._moveX();
        this._moveY();
        this._edgeCheck();
        // 定期的にダッシュ
        if (this.t % 180 === 0) {
            const dx = player.x - this.x;
            this.vx = Math.sign(dx) * 4;
        }
        this.vx *= 0.98;
        // 3way射撃
        this.shootCd--;
        if (this.shootCd <= 0) {
            this.shootCd = 100 + Math.random()*60|0;
            const dist = Math.abs(player.x - this.x);
            if (dist < 600) enemyShoot(this.x+this.w/2, this.y+this.h/3, 2.0, 10, '#ff2200', 3, 0.35);
        }
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = Math.round(this.x - camX);
        const sy = Math.round(this.y);
        const bob = Math.round(Math.sin(this.t*0.08)*2);
        const y = sy + bob;
        // 角
        pxRect(sx+2, y-8, 6, 8, '#800');
        pxRect(sx+40, y-8, 6, 8, '#800');
        // 頭
        pxRect(sx+4, y, 40, 12, '#400');
        // 目（点滅）
        const blink = Math.floor(this.t/30)%8!==0;
        if (blink) {
            pxRect(sx+10, y+4, 8, 6, '#f30');
            pxRect(sx+30, y+4, 8, 6, '#f30');
            px(sx+12, y+5, 2, 2, '#ff0');
            px(sx+32, y+5, 2, 2, '#ff0');
        }
        // 胴体
        pxRect(sx+2, y+12, 44, 28, '#300');
        pxRect(sx+6, y+14, 36, 24, '#400');
        // 腕
        pxRect(sx-4, y+16, 8, 20, '#300');
        pxRect(sx+44, y+16, 8, 20, '#300');
        // 牙
        for (let i=0;i<3;i++) {
            pxRect(sx+10+i*12, y+40, 4, 8, '#ccc');
        }
        // 脚
        pxRect(sx+6, y+40, 12, 16, '#200');
        pxRect(sx+30, y+40, 12, 16, '#200');
        this._drawHpBar(camX);
    }
}

// スポーナー（固定・リング弾のみ）
class Spawner extends Enemy {
    constructor(x, y) {
        super(x, y, 36, 36, 180, 0, '#330022', 0.8);
        this.shootCd = 90;
        this.scoreVal = 300;
    }
    update() {
        if (!this._checkWake()) return;
        this.t++;
        // リング弾（8方向・ゆっくり）
        this.shootCd--;
        if (this.shootCd <= 0) {
            this.shootCd = 130 + Math.random()*40|0;
            const cx = this.x + this.w/2, cy = this.y + this.h/2;
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 / 8) * i + this.t * 0.01;
                enemyBullets.push(new EnemyBullet(cx, cy, Math.cos(a)*1.8, Math.sin(a)*1.8, 6, '#cc00aa'));
            }
        }
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = Math.round(this.x - camX);
        const sy = Math.round(this.y);
        const pulse = Math.floor(this.t/8)%2;
        // 外枠
        pxRect(sx+2, sy+2, 32, 32, '#202');
        pxRect(sx+4, sy+4, 28, 28, pulse ? '#306' : '#204');
        // 中央の核
        pxRect(sx+12, sy+12, 12, 12, '#c0a');
        pxRect(sx+14, sy+14, 8, 8, '#f0f');
        // 角のドット装飾
        px(sx+4, sy+4, 2, 2, '#f0f');
        px(sx+28, sy+4, 2, 2, '#f0f');
        px(sx+4, sy+28, 2, 2, '#f0f');
        px(sx+28, sy+28, 2, 2, '#f0f');
        this._drawHpBar(camX);
    }
}

// ============================================================
//  ボスクラス
// ============================================================
class Boss extends Enemy {
    constructor(x, y, bossType) {
        // bossType: 1=骸骨王, 2=氷龍, 3=魔王
        const stats = {
            1: { w:56, h:64, hp:800, spd:0.8, col:'#660', name:'骸骨王' },
            2: { w:64, h:56, hp:1200, spd:0.6, col:'#069', name:'氷龍' },
            3: { w:72, h:72, hp:2000, spd:0.5, col:'#600', name:'魔王' },
        }[bossType];
        super(x, y, stats.w, stats.h, stats.hp, stats.spd, stats.col, 1.0);
        this.bossType = bossType;
        this.bossName = stats.name;
        this.scoreVal = bossType * 1000;
        this.phase = 0; // 0: normal, 1: rage (hp<50%)
        this.attackCd = 60;
        this.pattern = 0;
        this.vx = (Math.random()<0.5?1:-1)*this.spd;
    }
    update() {
        this.t++;
        if (this.hp < this.maxHp * 0.5 && this.phase === 0) this.phase = 1;
        this._applyGravity();
        this._moveX();
        this._moveY();
        // プレイヤー方向に移動
        const dx = player.x - this.x;
        const spdMul = this.phase === 1 ? 1.5 : 1;
        this.vx += Math.sign(dx) * 0.06 * spdMul;
        this.vx = Math.max(-this.spd*2*spdMul, Math.min(this.spd*2*spdMul, this.vx));
        this.vx *= 0.97;
        // ジャンプ（ランダム）
        if (this.onGround && this.t % 120 < 2 && Math.random() < 0.3) {
            this.vy = -8;
        }
        // 攻撃パターン
        this.attackCd--;
        if (this.attackCd <= 0) {
            this.pattern = (this.pattern + 1) % 3;
            const cdBase = this.phase === 1 ? 50 : 80;
            this.attackCd = cdBase + Math.random()*40|0;
            const cx = this.x+this.w/2, cy = this.y+this.h/3;
            const dist = Math.abs(player.x - this.x);
            if (dist > 800) return;
            if (this.bossType === 1) {
                // 骸骨王: 扇状5way弾 + 地面波
                if (this.pattern === 0) enemyShoot(cx, cy, 2.5, 8, '#ff0', 5, 0.3);
                else if (this.pattern === 1) {
                    for (let i=-2;i<=2;i++) enemyBullets.push(new EnemyBullet(cx+i*40, this.y, 0, 3, 10, '#fa0'));
                }
                else enemyShoot(cx, cy, 3, 6, '#f80', 3, 0.2);
            } else if (this.bossType === 2) {
                // 氷龍: 8方向放射 + 追尾氷弾
                if (this.pattern === 0) {
                    for (let i=0;i<8;i++) {
                        const a = (Math.PI*2/8)*i + this.t*0.02;
                        enemyBullets.push(new EnemyBullet(cx,cy, Math.cos(a)*2, Math.sin(a)*2, 7, '#4df'));
                    }
                } else if (this.pattern === 1) enemyShoot(cx, cy, 2, 10, '#0af', 3, 0.25);
                else {
                    for (let i=0;i<12;i++) {
                        const a = (Math.PI*2/12)*i;
                        enemyBullets.push(new EnemyBullet(cx,cy, Math.cos(a)*1.5, Math.sin(a)*1.5, 5, '#8ef'));
                    }
                }
            } else {
                // 魔王: 全方向16way + 3way連射 + 召喚
                if (this.pattern === 0) {
                    for (let i=0;i<16;i++) {
                        const a = (Math.PI*2/16)*i + this.t*0.01;
                        enemyBullets.push(new EnemyBullet(cx,cy, Math.cos(a)*2, Math.sin(a)*2, 8, '#f0f'));
                    }
                } else if (this.pattern === 1) enemyShoot(cx, cy, 3, 10, '#f00', 5, 0.2);
                else {
                    // ミニゾンビ召喚（最大3体）
                    if (enemies.filter(e=>e.alive&&!(e instanceof Boss)).length < 4) {
                        for (let i=0;i<2;i++) enemies.push(new Zombie(this.x+(Math.random()-0.5)*80, this.y-20));
                    }
                }
            }
        }
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = Math.round(this.x - camX);
        const sy = Math.round(this.y);
        const bob = Math.round(Math.sin(this.t*0.06)*3);
        const y = sy + bob;
        const rage = this.phase === 1;
        const blink = Math.floor(this.t/4)%2;
        if (this.bossType === 1) {
            // 骸骨王
            pxRect(sx+8, y, 40, 12, '#cc8'); // 頭蓋
            pxRect(sx+4, y+12, 48, 36, rage&&blink?'#a80':'#860'); // 胴体
            pxRect(sx+16, y+4, 8, 6, '#000'); pxRect(sx+32, y+4, 8, 6, '#000'); // 目穴
            px(sx+18, y+5, 2, 2, rage?'#f00':'#fa0'); px(sx+34, y+5, 2, 2, rage?'#f00':'#fa0'); // 目の火
            pxRect(sx, y+16, 8, 24, '#860'); pxRect(sx+48, y+16, 8, 24, '#860'); // 腕
            // 王冠
            for (let i=0;i<3;i++) pxRect(sx+14+i*10, y-8, 6, 8, '#ff0');
            pxRect(sx+8, y+48, 14, 16, '#640'); pxRect(sx+34, y+48, 14, 16, '#640'); // 脚
        } else if (this.bossType === 2) {
            // 氷龍
            pxRect(sx+16, y, 32, 16, '#4ad'); // 頭
            pxRect(sx+8, y+16, 48, 28, rage&&blink?'#28a':'#369'); // 胴
            pxRect(sx, y+12, 12, 8, '#4ad'); pxRect(sx+52, y+12, 12, 8, '#4ad'); // 翼
            pxRect(sx+4, y+8, 16, 4, '#6cf'); pxRect(sx+44, y+8, 16, 4, '#6cf'); // 翼先
            px(sx+22, y+4, 3, 3, rage?'#f44':'#fff'); px(sx+36, y+4, 3, 3, rage?'#f44':'#fff'); // 目
            // 角
            pxRect(sx+18, y-8, 4, 8, '#8df'); pxRect(sx+42, y-8, 4, 8, '#8df');
            pxRect(sx+12, y+44, 12, 12, '#258'); pxRect(sx+40, y+44, 12, 12, '#258'); // 脚
        } else {
            // 魔王
            pxRect(sx+12, y, 48, 20, '#400'); // 頭
            pxRect(sx+4, y+20, 64, 36, rage&&blink?'#800':'#500'); // 胴
            pxRect(sx, y+24, 8, 28, '#400'); pxRect(sx+64, y+24, 8, 28, '#400'); // 腕
            // 角（大）
            pxRect(sx+8, y-16, 8, 16, '#a00'); pxRect(sx+56, y-16, 8, 16, '#a00');
            pxRect(sx+4, y-20, 8, 8, '#c00'); pxRect(sx+60, y-20, 8, 8, '#c00');
            // 目
            pxRect(sx+20, y+6, 10, 8, '#000');pxRect(sx+42, y+6, 10, 8, '#000');
            px(sx+22, y+8, 3, 3, '#f00'); px(sx+44, y+8, 3, 3, '#f00');
            // マント
            pxRect(sx+8, y+56, 56, 16, '#300');
            pxRect(sx+16, y+56, 12, 16, '#200'); pxRect(sx+44, y+56, 12, 16, '#200');
        }
        // ボスHPバー（画面上部中央に大きく表示）
        const bw = 300;
        const bx = (canvas.width - bw)/2;
        pxRect(bx-2, canvas.height-32, bw+4, 18, '#000');
        pxRect(bx, canvas.height-30, bw, 14, '#200');
        pxRect(bx, canvas.height-30, Math.round(bw*(this.hp/this.maxHp)), 14, rage?'#f00':'#f80');
        pxRect(bx, canvas.height-30, bw, 2, '#f44');
        ctx.fillStyle='#fff'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
        ctx.fillText(`${this.bossName}`, canvas.width/2, canvas.height-20);
        ctx.textAlign='left';
    }
}

// ============================================================
//  衝突ヘルパー
// ============================================================
function rectsOverlap(a, b) {
    return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
}
function getTilesAround(px, py, pw, ph) {
    const result = [];
    const c0 = Math.floor(px/TILE)-1, c1 = Math.ceil((px+pw)/TILE)+1;
    const r0 = Math.floor(py/TILE)-1, r1 = Math.ceil((py+ph)/TILE)+1;
    for (let r=r0; r<=r1; r++) for (let c=c0; c<=c1; c++) {
        if (r>=0 && r<levelMap.length && c>=0 && c<(levelMap[0]||[]).length) {
            const v = levelMap[r][c];
            if (v===1||v===2) result.push({x:c*TILE, y:r*TILE, w:TILE, h:TILE});
        }
    }
    return result;
}

// ============================================================
//  動く床・崩れる床・スパイク
// ============================================================
class MovingPlatform {
    constructor(x, y, w, dir, dist, spd) {
        // dir: 'h'=水平, 'v'=垂直
        this.ox = x; this.oy = y; // 起点
        this.x = x; this.y = y;
        this.w = w; this.h = TILE/2;
        this.dir = dir;
        this.dist = dist; // 移動距離(px)
        this.spd = spd || 1;
        this.t = 0;
        this.prevX = x; this.prevY = y;
    }
    update() {
        this.prevX = this.x; this.prevY = this.y;
        this.t += this.spd;
        const progress = Math.sin(this.t * 0.02) * 0.5 + 0.5;
        if (this.dir === 'h') {
            this.x = this.ox + progress * this.dist;
        } else {
            this.y = this.oy + progress * this.dist;
        }
    }
    rect() { return {x:this.x, y:this.y, w:this.w, h:this.h}; }
    draw(camX) {
        const sx = Math.round(this.x - camX), sy = Math.round(this.y);
        if (sx < -this.w-20 || sx > canvas.width+20) return;
        const theme = getStageTheme();
        pxRect(sx, sy, this.w, this.h, theme.tileFg2);
        pxRect(sx, sy, this.w, 3, theme.tileHi2);
        pxRect(sx, sy+this.h-2, this.w, 2, theme.tileSh2);
        // レール装飾
        for (let i = 8; i < this.w-4; i += 12) {
            px(sx+i, sy+this.h/2-1, 4, 2, theme.tileSh2);
        }
    }
}

class CrumblingBlock {
    constructor(x, y, w) {
        this.x = x; this.y = y;
        this.w = w || TILE; this.h = TILE;
        this.state = 'solid'; // 'solid','shaking','crumbling','gone','regen'
        this.timer = 0;
        this.regenTimer = 0;
        this.shakeOff = 0;
    }
    stepped() {
        if (this.state === 'solid') {
            this.state = 'shaking';
            this.timer = 40; // 0.66秒後に崩壊
        }
    }
    update() {
        if (this.state === 'shaking') {
            this.timer--;
            this.shakeOff = (Math.random()-0.5) * 3;
            if (this.timer <= 0) {
                this.state = 'crumbling';
                this.timer = 8;
                spawnParticles(this.x+this.w/2, this.y+this.h/2, '#886644', 10, 3);
            }
        } else if (this.state === 'crumbling') {
            this.timer--;
            if (this.timer <= 0) {
                this.state = 'gone';
                this.regenTimer = 300; // 5秒で再生
            }
        } else if (this.state === 'gone') {
            this.regenTimer--;
            if (this.regenTimer <= 0) {
                this.state = 'solid';
                this.shakeOff = 0;
            }
        }
    }
    isSolid() { return this.state === 'solid' || this.state === 'shaking'; }
    rect() { return this.isSolid() ? {x:this.x, y:this.y, w:this.w, h:this.h} : null; }
    draw(camX) {
        const sx = Math.round(this.x - camX + this.shakeOff), sy = Math.round(this.y);
        if (sx < -this.w-20 || sx > canvas.width+20) return;
        const theme = getStageTheme();
        if (this.state === 'solid' || this.state === 'shaking') {
            const alpha = this.state === 'shaking' ? 0.6 + Math.random()*0.4 : 1.0;
            ctx.globalAlpha = alpha;
            pxRect(sx, sy, this.w, this.h, '#665544');
            pxRect(sx, sy, this.w, 3, '#887766');
            pxRect(sx, sy+this.h-2, this.w, 2, '#443322');
            // 亀裂パターン
            px(sx+this.w/3, sy+4, 1, this.h-8, '#44332266');
            px(sx+this.w*2/3, sy+6, 1, this.h-10, '#44332266');
            ctx.globalAlpha = 1;
        } else if (this.state === 'crumbling') {
            ctx.globalAlpha = this.timer / 8;
            pxRect(sx, sy, this.w, this.h, '#554433');
            ctx.globalAlpha = 1;
        }
        // gone状態: 何も描画しない（再生中はうっすら表示）
        if (this.state === 'gone' && this.regenTimer < 60) {
            ctx.globalAlpha = (60 - this.regenTimer) / 60 * 0.3;
            pxRect(Math.round(this.x-camX), sy, this.w, this.h, '#665544');
            ctx.globalAlpha = 1;
        }
    }
}

// スパイクタイル(v=3)のダメージ処理
function checkSpikeDamage() {
    const pc = Math.floor((player.x + player.w/2) / TILE);
    const pr = Math.floor((player.y + player.h - 2) / TILE);
    if (pr >= 0 && pr < levelMap.length && pc >= 0 && pc < (levelMap[0]||[]).length) {
        if (levelMap[pr][pc] === 3 && player.invincible <= 0) {
            playerHit(15);
            player.vy = BASE_JUMP_FORCE * 0.5; // 弾き飛ばし
        }
    }
}

// 動く床のプレイヤー当たり判定
function updateMovingPlatforms() {
    for (const mp of movingPlatforms) {
        mp.update();
        // プレイヤーとの当たり判定
        const r = mp.rect();
        const pr = {x:player.x, y:player.y, w:player.w, h:player.h};
        // 上から乗る判定
        if (player.vy >= 0 && rectsOverlap(pr, {x:r.x, y:r.y-2, w:r.w, h:r.h+4})) {
            if (player.y + player.h >= r.y && player.y + player.h <= r.y + r.h + 6) {
                player.y = r.y - player.h;
                player.vy = 0;
                player.onGround = true;
                // 床の移動量をプレイヤーに伝搬
                player.x += mp.x - mp.prevX;
                player.y += mp.y - mp.prevY;
            }
        }
        // 横・下からの衝突
        if (rectsOverlap(pr, r)) {
            if (player.vy < 0 && player.y > r.y) {
                player.y = r.y + r.h;
                player.vy = 0;
            }
        }
    }
}

// 崩れる床のプレイヤー当たり判定
function updateCrumblingBlocks() {
    for (const cb of crumblingBlocks) {
        cb.update();
        if (!cb.isSolid()) continue;
        const r = {x:cb.x, y:cb.y, w:cb.w, h:cb.h};
        const pr = {x:player.x, y:player.y, w:player.w, h:player.h};
        if (rectsOverlap(pr, r)) {
            if (player.vy >= 0 && player.y + player.h <= r.y + 10) {
                player.y = r.y - player.h;
                player.vy = 0;
                player.onGround = true;
                cb.stepped();
            } else if (player.vy < 0) {
                player.y = r.y + r.h;
                player.vy = 0;
            } else {
                // 横からの衝突
                if (player.vx > 0) player.x = r.x - player.w;
                else player.x = r.x + r.w;
                player.vx = 0;
            }
        }
    }
}

// ============================================================
//  レベルデータ
// ============================================================
// ステージテーマ定義
const STAGE_THEMES = [
    { // Stage 1: 廃墟（ダーク紫）
        tileFg:'#442', tileHi:'#664', tileSh:'#221', tileFg2:'#336', tileHi2:'#558', tileSh2:'#113',
        starCol1:'#644', starCol2:'#422',
    },
    { // Stage 2: 氷の洞窟（ブルー）
        tileFg:'#245', tileHi:'#48a', tileSh:'#123', tileFg2:'#246', tileHi2:'#49b', tileSh2:'#124',
        starCol1:'#4af', starCol2:'#248',
    },
    { // Stage 3: 灼熱地獄（レッド）
        tileFg:'#532', tileHi:'#a64', tileSh:'#211', tileFg2:'#534', tileHi2:'#a66', tileSh2:'#212',
        starCol1:'#f84', starCol2:'#a42',
    },
];

function getStageIdx() { return Math.floor(currentLevelIdx / 4); }
function getStageTheme() { return STAGE_THEMES[getStageIdx()] || STAGE_THEMES[2]; }

// 敵のステージスケーリング（拠点強化しないと進めないレベル）
function getEnemyHpScale() { return 1 + currentLevelIdx * 0.35; }
function getEnemyDmgScale() { return 1 + currentLevelIdx * 0.2; }
// 拠点アップグレードからの攻撃倍率
function getHubAttackMul() { return 1 + HUB_UPGRADES.attack.level * 0.15; }

const LEVELS = [
    // ===== STAGE 1: 廃墟の地下 =====
    // 1-1: チュートリアル的。基本操作を学ぶ。穴を飛び越え、壁を登り、初スパイクに出会う
    {
        name:'廃墟の地下', stage:0,
        bg1:'#000000', bg2:'#0d0010',
        width:65,
        enemySpawns: [
            {type:'zombie', col:12, row:ROWS-3},
            {type:'zombie', col:20, row:ROWS-3},
            {type:'shade',  col:26, row:ROWS-7},
            {type:'zombie', col:34, row:ROWS-3},
            {type:'spawner',col:40, row:ROWS-5},
            {type:'shade',  col:46, row:ROWS-6},
            {type:'demon',  col:55, row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            // 基本地形: 地面 + 穴
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            clearCols(m,10,3,ROWS-2,ROWS); // 最初の穴（簡単なジャンプ）
            clearCols(m,24,4,ROWS-2,ROWS); // 広い穴（足場必要）
            clearCols(m,42,5,ROWS-2,ROWS); // スパイク穴
            // 穴の底にスパイク（落ちたら痛い、という学習）
            spikes(m, 42, ROWS-1, 5);
            // 段差と迷路的要素: 壁で区切られたエリア
            wall(m, 18, ROWS-3, 4); // 壁: 上を飛び越えるか下をくぐるか
            // 足場
            platf(m,[[7,ROWS-5,3],[13,ROWS-6,3],[18,ROWS-8,3],
                     [25,ROWS-5,3],[30,ROWS-4,4],
                     [36,ROWS-6,3],[43,ROWS-5,2],[46,ROWS-7,2],
                     [50,ROWS-5,4]]);
            // 上層ルート（壁を越えた先に足場）
            platf(m,[[15,ROWS-9,4]]);
            // ゴール前の階段
            for (let i=0;i<3;i++) for(let j=0;j<=i;j++) set(m,57+i,ROWS-3-j,2);
            platf(m,[[60,ROWS-6,3]]);
            setGoal(m, 62, ROWS-7);
            return m;
        },
        setupDynamic() {
            // 穴の上に崩れる床（見た目は普通だけど乗ると崩れる）
            crumblingBlocks.push(new CrumblingBlock(24*TILE, (ROWS-3)*TILE, TILE*2));
        }
    },
    // 1-2: 縦方向の探索。高い壁を登っていく塔構造 + 崩れる足場
    {
        name:'呪われた塔', stage:0,
        bg1:'#050008', bg2:'#10001a',
        width:75,
        enemySpawns: [
            {type:'zombie', col:10, row:ROWS-3},{type:'shade', col:16, row:ROWS-7},
            {type:'zombie', col:22, row:ROWS-3},{type:'shade', col:30, row:ROWS-9},
            {type:'demon',  col:38, row:ROWS-3},{type:'spawner',col:45, row:ROWS-5},
            {type:'shade',  col:52, row:ROWS-7},{type:'demon',  col:58, row:ROWS-3},
            {type:'shade',  col:64, row:ROWS-8},{type:'zombie', col:68, row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            // 穴（落下で即死ではなくスパイクダメージ）
            for (const [s,l] of [[14,4],[28,5],[44,4],[56,4]]) {
                clearCols(m,s,l,ROWS-2,ROWS);
                spikes(m, s, ROWS-1, l); // 穴底にスパイク
            }
            // 塔構造: 壁で仕切り、上を行くか下を行くか選択
            wall(m, 20, ROWS-3, 6);
            wall(m, 36, ROWS-3, 5);
            wall(m, 52, ROWS-3, 7);
            // 各壁に通路（上ルートの方が敵少なく安全、下ルートは近道）
            set(m, 20, ROWS-4, 0); // 壁に穴（下ルート）
            set(m, 36, ROWS-4, 0);
            // 多段足場（塔の内部を登る感覚）
            platf(m,[[6,ROWS-5,3],[11,ROWS-7,3],[17,ROWS-5,4],
                     [21,ROWS-6,3],[25,ROWS-8,4],[29,ROWS-5,3],
                     [33,ROWS-7,3],[37,ROWS-9,4],[41,ROWS-5,3],
                     [46,ROWS-7,3],[50,ROWS-5,4],[53,ROWS-9,3],
                     [57,ROWS-6,3],[62,ROWS-8,3],[66,ROWS-5,4]]);
            // 天井近くの秘密ルート
            platf(m,[[30,ROWS-11,6]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        },
        setupDynamic() {
            // 壁を越える動く足場
            movingPlatforms.push(new MovingPlatform(19*TILE, (ROWS-8)*TILE, TILE*2, 'v', -3*TILE, 1.2));
            // 崩れる橋（穴の上）
            crumblingBlocks.push(new CrumblingBlock(44*TILE, (ROWS-3)*TILE, TILE*2));
            crumblingBlocks.push(new CrumblingBlock(46*TILE, (ROWS-3)*TILE, TILE*2));
        }
    },
    // 1-3: 大穴だらけ。動く床を渡る + 崩れる床の連続。ミスが命取り
    {
        name:'奈落の深淵', stage:0,
        bg1:'#000005', bg2:'#080014',
        width:85,
        enemySpawns: [
            {type:'zombie',col:6,row:ROWS-3},{type:'shade',col:16,row:ROWS-6},
            {type:'demon',col:22,row:ROWS-3},{type:'shade',col:32,row:ROWS-7},
            {type:'spawner',col:40,row:ROWS-5},{type:'demon',col:50,row:ROWS-3},
            {type:'shade',col:56,row:ROWS-7},{type:'zombie',col:62,row:ROWS-3},
            {type:'demon',col:70,row:ROWS-3},{type:'shade',col:76,row:ROWS-8},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            // 島状の地形（大穴で分断）
            fillRow(m, ROWS-1, 0, 10, 1); fillRow(m, ROWS-2, 0, 10, 1);
            fillRow(m, ROWS-1, 18, 28, 1); fillRow(m, ROWS-2, 18, 28, 1);
            fillRow(m, ROWS-1, 36, 46, 1); fillRow(m, ROWS-2, 36, 46, 1);
            fillRow(m, ROWS-1, 54, 64, 1); fillRow(m, ROWS-2, 54, 64, 1);
            fillRow(m, ROWS-1, 72, w, 1); fillRow(m, ROWS-2, 72, w, 1);
            // 各島間のスパイク落下地帯
            spikes(m, 10, ROWS-1, 8); spikes(m, 28, ROWS-1, 8);
            spikes(m, 46, ROWS-1, 8); spikes(m, 64, ROWS-1, 8);
            // 島間を繋ぐ足場
            platf(m,[[11,ROWS-4,2],[14,ROWS-6,2],[16,ROWS-4,2],
                     [29,ROWS-5,2],[32,ROWS-7,2],[34,ROWS-5,2],
                     [47,ROWS-4,2],[50,ROWS-6,2],[52,ROWS-4,2],
                     [65,ROWS-5,2],[68,ROWS-7,2],[70,ROWS-5,2]]);
            // 各島内の複雑な地形
            wall(m, 24, ROWS-3, 4);
            platf(m,[[7,ROWS-6,3],[20,ROWS-5,3],[25,ROWS-7,3],
                     [38,ROWS-5,4],[42,ROWS-7,3],
                     [57,ROWS-5,3],[60,ROWS-7,3],
                     [74,ROWS-5,4],[78,ROWS-7,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        },
        setupDynamic() {
            // 大穴を渡る動く床（水平移動）
            movingPlatforms.push(new MovingPlatform(12*TILE, (ROWS-3)*TILE, TILE*3, 'h', 4*TILE, 0.8));
            movingPlatforms.push(new MovingPlatform(48*TILE, (ROWS-3)*TILE, TILE*3, 'h', 4*TILE, 1.0));
            // 崩れる足場（島間の橋）
            crumblingBlocks.push(new CrumblingBlock(29*TILE, (ROWS-4)*TILE, TILE*2));
            crumblingBlocks.push(new CrumblingBlock(65*TILE, (ROWS-4)*TILE, TILE*2));
        }
    },
    // 1-BOSS: 骸骨王。広いアリーナ + スパイクゾーン + 逃げ場の足場
    {
        name:'骸骨王の間', stage:0, boss:1,
        bg1:'#0a0500', bg2:'#1a0a00',
        width:32,
        enemySpawns: [{type:'boss1', col:20, row:ROWS-3}],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            // アリーナ両端にスパイク（追い詰められると痛い）
            spikes(m, 1, ROWS-3, 3);
            spikes(m, w-4, ROWS-3, 3);
            // 逃げ場の高台
            platf(m,[[3,ROWS-5,3],[8,ROWS-7,3],[14,ROWS-5,4],[22,ROWS-7,3],[w-7,ROWS-5,3]]);
            // 中央の壁（ボスの突進を避ける遮蔽物）
            wall(m, 15, ROWS-3, 3);
            setGoal(m, w-3, ROWS-3);
            return m;
        }
    },
    // ===== STAGE 2: 氷の洞窟 =====
    // 2-1: 氷の洞窟入口。天井から氷柱、狭い通路、動く床初登場
    {
        name:'凍てつく入口', stage:1,
        bg1:'#000510', bg2:'#001020',
        width:70,
        enemySpawns: [
            {type:'zombie',col:10,row:ROWS-3},{type:'zombie',col:18,row:ROWS-3},
            {type:'shade',col:24,row:ROWS-7},{type:'demon',col:34,row:ROWS-3},
            {type:'shade',col:40,row:ROWS-8},{type:'spawner',col:48,row:ROWS-5},
            {type:'zombie',col:54,row:ROWS-3},{type:'demon',col:60,row:ROWS-3},
            {type:'shade',col:56,row:ROWS-7},{type:'shade',col:64,row:ROWS-6},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            // 穴
            clearCols(m,15,4,ROWS-2,ROWS);
            clearCols(m,30,5,ROWS-2,ROWS);
            clearCols(m,50,4,ROWS-2,ROWS);
            spikes(m, 30, ROWS-1, 5);
            // 天井からの氷柱（天井と地面の間を狭くする）
            for (let c=12;c<14;c++) for (let r=0;r<4;r++) set(m,c,r,2);
            for (let c=26;c<28;c++) for (let r=0;r<5;r++) set(m,c,r,2);
            for (let c=44;c<46;c++) for (let r=0;r<3;r++) set(m,c,r,2);
            // 壁で区切られた部屋
            wall(m, 22, ROWS-3, 5);
            set(m, 22, ROWS-5, 0); // 壁に穴
            wall(m, 42, ROWS-3, 6);
            // 足場
            platf(m,[[6,ROWS-5,4],[16,ROWS-5,3],[19,ROWS-7,3],
                     [23,ROWS-6,4],[28,ROWS-8,3],[31,ROWS-5,2],[35,ROWS-4,3],
                     [38,ROWS-7,3],[43,ROWS-9,3],[46,ROWS-5,3],
                     [51,ROWS-6,2],[55,ROWS-5,3],[60,ROWS-7,4],[65,ROWS-5,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        },
        setupDynamic() {
            // 穴の上を渡る動く床
            movingPlatforms.push(new MovingPlatform(15*TILE, (ROWS-4)*TILE, TILE*2, 'h', 3*TILE, 0.7));
            // 壁を越える上下動く床
            movingPlatforms.push(new MovingPlatform(42*TILE-TILE, (ROWS-8)*TILE, TILE*2, 'v', -2*TILE, 1.0));
        }
    },
    // 2-2: 氷柱の回廊。壁で仕切られた複数の部屋を攻略。崩れる床で落とされる
    {
        name:'氷柱の回廊', stage:1,
        bg1:'#000818', bg2:'#001228',
        width:85,
        enemySpawns: [
            {type:'zombie',col:8,row:ROWS-3},{type:'shade',col:16,row:ROWS-8},
            {type:'demon',col:24,row:ROWS-3},{type:'shade',col:32,row:ROWS-9},
            {type:'spawner',col:38,row:ROWS-5},{type:'zombie',col:46,row:ROWS-3},
            {type:'demon',col:54,row:ROWS-3},{type:'shade',col:60,row:ROWS-7},
            {type:'spawner',col:66,row:ROWS-5},{type:'demon',col:74,row:ROWS-3},
            {type:'shade',col:70,row:ROWS-9},{type:'shade',col:78,row:ROWS-7},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            // 穴（スパイク付き）
            for (const [s,l] of [[12,4],[28,5],[44,4],[58,4],[72,3]]) {
                clearCols(m,s,l,ROWS-2,ROWS);
                spikes(m, s, ROWS-1, l);
            }
            // 氷柱の壁（部屋の仕切り）- 上から天井が下がる + 下から壁
            wall(m, 20, ROWS-3, 7);
            wall(m, 40, ROWS-3, 6);
            wall(m, 62, ROWS-3, 8);
            // 各壁に通過用の穴
            set(m, 20, ROWS-5, 0); set(m, 20, ROWS-6, 0);
            set(m, 40, ROWS-4, 0);
            set(m, 62, ROWS-5, 0); set(m, 62, ROWS-6, 0);
            // 天井からの氷柱（狭い通路を作る）
            for (let c=18;c<20;c++) for (let r=0;r<6;r++) set(m,c,r,2);
            for (let c=38;c<40;c++) for (let r=0;r<5;r++) set(m,c,r,2);
            for (let c=60;c<62;c++) for (let r=0;r<7;r++) set(m,c,r,2);
            // 各部屋内の足場
            platf(m,[[5,ROWS-5,3],[9,ROWS-7,3],[13,ROWS-5,3],[17,ROWS-8,2],
                     [22,ROWS-6,3],[26,ROWS-4,3],[29,ROWS-7,3],[33,ROWS-9,3],
                     [35,ROWS-5,3],[42,ROWS-7,3],[46,ROWS-5,4],[50,ROWS-7,3],
                     [54,ROWS-5,3],[59,ROWS-8,2],[63,ROWS-7,3],
                     [67,ROWS-5,3],[73,ROWS-6,3],[77,ROWS-4,4]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        },
        setupDynamic() {
            // 部屋間を繋ぐ動く床
            movingPlatforms.push(new MovingPlatform(12*TILE, (ROWS-4)*TILE, TILE*2, 'h', 3*TILE, 0.9));
            movingPlatforms.push(new MovingPlatform(58*TILE, (ROWS-4)*TILE, TILE*2, 'h', 3*TILE, 1.1));
            // 崩れる床トラップ（敵の前に配置）
            crumblingBlocks.push(new CrumblingBlock(23*TILE, (ROWS-3)*TILE, TILE*3));
            crumblingBlocks.push(new CrumblingBlock(53*TILE, (ROWS-3)*TILE, TILE*2));
        }
    },
    // 2-3: 大氷穴。ほぼ穴だらけ、動く床と崩れる床が命綱
    {
        name:'氷結の大穴', stage:1,
        bg1:'#001020', bg2:'#002040',
        width:90,
        enemySpawns: [
            {type:'shade',col:10,row:ROWS-6},{type:'demon',col:18,row:ROWS-3},
            {type:'shade',col:26,row:ROWS-8},{type:'spawner',col:34,row:ROWS-5},
            {type:'shade',col:42,row:ROWS-7},{type:'demon',col:50,row:ROWS-3},
            {type:'shade',col:58,row:ROWS-9},{type:'spawner',col:64,row:ROWS-5},
            {type:'demon',col:72,row:ROWS-3},{type:'shade',col:78,row:ROWS-7},
            {type:'demon',col:84,row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            // 最小限の地面＋大量の穴
            fillRow(m, ROWS-1, 0, 7, 1); fillRow(m, ROWS-2, 0, 7, 1);
            fillRow(m, ROWS-1, 15, 22, 1); fillRow(m, ROWS-2, 15, 22, 1);
            fillRow(m, ROWS-1, 32, 38, 1); fillRow(m, ROWS-2, 32, 38, 1);
            fillRow(m, ROWS-1, 48, 54, 1); fillRow(m, ROWS-2, 48, 54, 1);
            fillRow(m, ROWS-1, 68, 76, 1); fillRow(m, ROWS-2, 68, 76, 1);
            fillRow(m, ROWS-1, 84, w, 1); fillRow(m, ROWS-2, 84, w, 1);
            // 穴底スパイク
            spikes(m, 7, ROWS-1, 8); spikes(m, 22, ROWS-1, 10);
            spikes(m, 38, ROWS-1, 10); spikes(m, 54, ROWS-1, 14);
            spikes(m, 76, ROWS-1, 8);
            // 小さな足場（綱渡り的）
            platf(m,[[8,ROWS-5,2],[11,ROWS-7,2],[13,ROWS-5,2],
                     [23,ROWS-5,2],[26,ROWS-7,2],[29,ROWS-5,2],
                     [39,ROWS-5,2],[42,ROWS-7,2],[45,ROWS-5,2],
                     [55,ROWS-5,2],[58,ROWS-7,2],[61,ROWS-5,2],[64,ROWS-7,2],[66,ROWS-5,2],
                     [77,ROWS-5,2],[80,ROWS-7,2],[82,ROWS-5,2]]);
            // 高台
            platf(m,[[17,ROWS-6,3],[34,ROWS-6,3],[50,ROWS-6,3],[70,ROWS-6,4]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        },
        setupDynamic() {
            // 大穴を渡る動く床（これがないと渡れない）
            movingPlatforms.push(new MovingPlatform(8*TILE, (ROWS-3)*TILE, TILE*2, 'h', 5*TILE, 0.7));
            movingPlatforms.push(new MovingPlatform(38*TILE, (ROWS-3)*TILE, TILE*2, 'h', 8*TILE, 0.6));
            movingPlatforms.push(new MovingPlatform(76*TILE, (ROWS-4)*TILE, TILE*2, 'h', 6*TILE, 0.9));
            // 上下する足場
            movingPlatforms.push(new MovingPlatform(55*TILE, (ROWS-4)*TILE, TILE*2, 'v', -4*TILE, 0.8));
            // 崩れる足場
            crumblingBlocks.push(new CrumblingBlock(23*TILE, (ROWS-4)*TILE, TILE*2));
            crumblingBlocks.push(new CrumblingBlock(61*TILE, (ROWS-4)*TILE, TILE*2));
        }
    },
    // 2-BOSS: 氷龍。氷のアリーナ + スパイク + 動く足場で避難
    {
        name:'氷龍の巣', stage:1, boss:2,
        bg1:'#001030', bg2:'#002050',
        width:34,
        enemySpawns: [{type:'boss2', col:20, row:ROWS-3}],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            // 中央にスパイク帯（ボスの攻撃と合わせて挟み撃ち）
            spikes(m, 12, ROWS-3, 4);
            spikes(m, 20, ROWS-3, 4);
            // 避難用高台
            platf(m,[[3,ROWS-5,3],[9,ROWS-7,4],[16,ROWS-9,3],[22,ROWS-5,3],[w-7,ROWS-7,3]]);
            // 氷柱
            wall(m, 14, ROWS-3, 4);
            setGoal(m, w-3, ROWS-3);
            return m;
        },
        setupDynamic() {
            // 上下する逃げ場
            movingPlatforms.push(new MovingPlatform(7*TILE, (ROWS-5)*TILE, TILE*3, 'v', -3*TILE, 1.0));
        }
    },
    // ===== STAGE 3: 灼熱地獄 =====
    // 3-1: 溶岩地帯。スパイクだらけ + 動く床 + 壁迷路
    {
        name:'灼熱の入口', stage:2,
        bg1:'#100000', bg2:'#200800',
        width:75,
        enemySpawns: [
            {type:'demon',col:10,row:ROWS-3},{type:'shade',col:18,row:ROWS-7},
            {type:'spawner',col:24,row:ROWS-5},{type:'demon',col:32,row:ROWS-3},
            {type:'shade',col:40,row:ROWS-8},{type:'zombie',col:46,row:ROWS-3},
            {type:'demon',col:52,row:ROWS-3},{type:'spawner',col:58,row:ROWS-5},
            {type:'shade',col:62,row:ROWS-7},{type:'demon',col:68,row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            // 溶岩ピット
            clearCols(m,14,5,ROWS-2,ROWS); spikes(m,14,ROWS-1,5);
            clearCols(m,28,4,ROWS-2,ROWS); spikes(m,28,ROWS-1,4);
            clearCols(m,42,5,ROWS-2,ROWS); spikes(m,42,ROWS-1,5);
            clearCols(m,56,4,ROWS-2,ROWS); spikes(m,56,ROWS-1,4);
            // 地面上のスパイクライン（ジャンプで飛び越える必要がある）
            spikes(m, 8, ROWS-3, 3);
            spikes(m, 35, ROWS-3, 3);
            spikes(m, 50, ROWS-3, 2);
            // 迷路壁（上下2ルート）
            wall(m, 22, ROWS-3, 6);
            set(m, 22, ROWS-5, 0);
            wall(m, 38, ROWS-3, 7);
            wall(m, 54, ROWS-3, 5);
            set(m, 54, ROWS-4, 0);
            // 足場
            platf(m,[[5,ROWS-5,3],[11,ROWS-7,3],[15,ROWS-5,3],[19,ROWS-8,3],
                     [23,ROWS-6,3],[27,ROWS-4,3],[29,ROWS-7,3],[33,ROWS-9,3],
                     [39,ROWS-5,3],[43,ROWS-6,3],[47,ROWS-8,2],
                     [51,ROWS-5,3],[55,ROWS-7,3],[57,ROWS-5,2],[61,ROWS-4,3],
                     [65,ROWS-7,3],[69,ROWS-5,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        },
        setupDynamic() {
            // 溶岩ピット渡り
            movingPlatforms.push(new MovingPlatform(14*TILE, (ROWS-4)*TILE, TILE*2, 'h', 4*TILE, 0.9));
            movingPlatforms.push(new MovingPlatform(42*TILE, (ROWS-4)*TILE, TILE*2, 'h', 4*TILE, 1.1));
            // 崩れる足場（壁の前に罠）
            crumblingBlocks.push(new CrumblingBlock(21*TILE, (ROWS-3)*TILE, TILE));
            crumblingBlocks.push(new CrumblingBlock(37*TILE, (ROWS-3)*TILE, TILE*2));
        }
    },
    // 3-2: 溶岩の橋。島渡り + 全ギミック総動員
    {
        name:'溶岩の橋', stage:2,
        bg1:'#180000', bg2:'#301000',
        width:90,
        enemySpawns: [
            {type:'demon',col:8,row:ROWS-3},{type:'spawner',col:16,row:ROWS-5},
            {type:'shade',col:24,row:ROWS-8},{type:'demon',col:32,row:ROWS-3},
            {type:'shade',col:40,row:ROWS-9},{type:'spawner',col:48,row:ROWS-5},
            {type:'demon',col:56,row:ROWS-3},{type:'shade',col:62,row:ROWS-7},
            {type:'demon',col:70,row:ROWS-3},{type:'spawner',col:76,row:ROWS-5},
            {type:'shade',col:82,row:ROWS-8},{type:'demon',col:84,row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            // 溶岩上の途切れ途切れの島
            fillRow(m, ROWS-1, 0, 12, 1); fillRow(m, ROWS-2, 0, 12, 1);
            fillRow(m, ROWS-1, 20, 30, 1); fillRow(m, ROWS-2, 20, 30, 1);
            fillRow(m, ROWS-1, 38, 48, 1); fillRow(m, ROWS-2, 38, 48, 1);
            fillRow(m, ROWS-1, 56, 66, 1); fillRow(m, ROWS-2, 56, 66, 1);
            fillRow(m, ROWS-1, 74, w, 1); fillRow(m, ROWS-2, 74, w, 1);
            // 穴底全部スパイク（落ちたらかなり痛い）
            spikes(m, 12, ROWS-1, 8); spikes(m, 30, ROWS-1, 8);
            spikes(m, 48, ROWS-1, 8); spikes(m, 66, ROWS-1, 8);
            // 各島にスパイクトラップ
            spikes(m, 5, ROWS-3, 2);
            spikes(m, 25, ROWS-3, 2);
            spikes(m, 43, ROWS-3, 2);
            spikes(m, 61, ROWS-3, 2);
            // 壁（各島に防衛拠点）
            wall(m, 10, ROWS-3, 5);
            wall(m, 28, ROWS-3, 6);
            wall(m, 46, ROWS-3, 5);
            wall(m, 64, ROWS-3, 6);
            // 足場
            platf(m,[[3,ROWS-5,3],[7,ROWS-7,3],
                     [13,ROWS-5,2],[16,ROWS-7,2],[18,ROWS-5,2],
                     [22,ROWS-5,3],[26,ROWS-7,3],
                     [31,ROWS-5,2],[34,ROWS-7,2],[36,ROWS-5,2],
                     [40,ROWS-5,3],[44,ROWS-7,3],
                     [49,ROWS-5,2],[52,ROWS-7,2],[54,ROWS-5,2],
                     [58,ROWS-5,3],[62,ROWS-7,3],
                     [67,ROWS-5,2],[70,ROWS-7,2],[72,ROWS-5,2],
                     [76,ROWS-5,4],[82,ROWS-7,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        },
        setupDynamic() {
            // 島間を繋ぐ動く床（各穴に1台ずつ）
            movingPlatforms.push(new MovingPlatform(13*TILE, (ROWS-3)*TILE, TILE*2, 'h', 5*TILE, 0.7));
            movingPlatforms.push(new MovingPlatform(31*TILE, (ROWS-3)*TILE, TILE*2, 'h', 5*TILE, 0.8));
            movingPlatforms.push(new MovingPlatform(49*TILE, (ROWS-3)*TILE, TILE*2, 'h', 5*TILE, 0.9));
            movingPlatforms.push(new MovingPlatform(67*TILE, (ROWS-3)*TILE, TILE*2, 'h', 5*TILE, 1.0));
            // 各島の崩れる床トラップ
            crumblingBlocks.push(new CrumblingBlock(9*TILE, (ROWS-3)*TILE, TILE));
            crumblingBlocks.push(new CrumblingBlock(27*TILE, (ROWS-3)*TILE, TILE));
            crumblingBlocks.push(new CrumblingBlock(45*TILE, (ROWS-3)*TILE, TILE));
            crumblingBlocks.push(new CrumblingBlock(63*TILE, (ROWS-3)*TILE, TILE));
        }
    },
    // 3-3: 煉獄の階段。上へ上へ登る構造 + 全ギミック + 大量の敵
    {
        name:'煉獄の階段', stage:2,
        bg1:'#200000', bg2:'#401000',
        width:95,
        enemySpawns: [
            {type:'demon',col:8,row:ROWS-3},{type:'shade',col:14,row:ROWS-8},
            {type:'spawner',col:22,row:ROWS-5},{type:'demon',col:30,row:ROWS-3},
            {type:'shade',col:36,row:ROWS-9},{type:'spawner',col:42,row:ROWS-5},
            {type:'demon',col:50,row:ROWS-3},{type:'shade',col:56,row:ROWS-8},
            {type:'spawner',col:62,row:ROWS-5},{type:'demon',col:68,row:ROWS-3},
            {type:'shade',col:74,row:ROWS-9},{type:'demon',col:80,row:ROWS-3},
            {type:'spawner',col:86,row:ROWS-5},{type:'shade',col:90,row:ROWS-7},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            // 穴
            for (const [s,l] of [[12,5],[26,5],[40,4],[54,5],[70,4],[84,3]]) {
                clearCols(m,s,l,ROWS-2,ROWS);
                spikes(m, s, ROWS-1, l);
            }
            // 地面スパイク
            spikes(m, 6, ROWS-3, 2); spikes(m, 20, ROWS-3, 3);
            spikes(m, 34, ROWS-3, 2); spikes(m, 48, ROWS-3, 3);
            spikes(m, 64, ROWS-3, 2); spikes(m, 78, ROWS-3, 2);
            // 階段状の登り構造
            for (let i=0;i<4;i++) for(let j=0;j<=i;j++) set(m,8+i,ROWS-3-j,2);
            for (let i=0;i<3;i++) for(let j=0;j<=i;j++) set(m,32+i,ROWS-3-j,2);
            for (let i=0;i<4;i++) for(let j=0;j<=i;j++) set(m,60+i,ROWS-3-j,2);
            // 壁
            wall(m, 24, ROWS-3, 7);
            set(m, 24, ROWS-5, 0);
            wall(m, 46, ROWS-3, 6);
            wall(m, 68, ROWS-3, 8);
            set(m, 68, ROWS-6, 0); set(m, 68, ROWS-7, 0);
            // 足場
            platf(m,[[5,ROWS-5,3],[9,ROWS-8,3],[13,ROWS-5,3],[17,ROWS-7,4],
                     [21,ROWS-10,3],[25,ROWS-6,3],[27,ROWS-9,3],[31,ROWS-5,3],
                     [35,ROWS-7,3],[38,ROWS-10,3],[41,ROWS-5,3],[44,ROWS-8,3],
                     [47,ROWS-6,3],[51,ROWS-5,3],[55,ROWS-8,3],[58,ROWS-10,3],
                     [63,ROWS-6,3],[66,ROWS-8,3],[69,ROWS-10,3],
                     [72,ROWS-5,3],[76,ROWS-7,3],[80,ROWS-5,3],
                     [85,ROWS-6,3],[89,ROWS-4,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        },
        setupDynamic() {
            // 穴渡りの動く床
            movingPlatforms.push(new MovingPlatform(12*TILE, (ROWS-4)*TILE, TILE*2, 'h', 4*TILE, 0.8));
            movingPlatforms.push(new MovingPlatform(40*TILE, (ROWS-4)*TILE, TILE*2, 'h', 3*TILE, 1.0));
            movingPlatforms.push(new MovingPlatform(70*TILE, (ROWS-4)*TILE, TILE*2, 'h', 3*TILE, 1.2));
            // 上下する高台アクセス
            movingPlatforms.push(new MovingPlatform(55*TILE, (ROWS-5)*TILE, TILE*2, 'v', -4*TILE, 0.9));
            // 崩れる足場（要所に配置）
            crumblingBlocks.push(new CrumblingBlock(25*TILE, (ROWS-3)*TILE, TILE*2));
            crumblingBlocks.push(new CrumblingBlock(47*TILE, (ROWS-3)*TILE, TILE*2));
            crumblingBlocks.push(new CrumblingBlock(80*TILE, (ROWS-3)*TILE, TILE*2));
        }
    },
    // 3-BOSS: 魔王戦。広大アリーナ + スパイク + 動く足場 + 崩れる足場
    {
        name:'魔王の玉座', stage:2, boss:3,
        bg1:'#200000', bg2:'#400800',
        width:38,
        enemySpawns: [{type:'boss3', col:24, row:ROWS-3}],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            // スパイク帯（追い詰められエリア）
            spikes(m, 2, ROWS-3, 3);
            spikes(m, 16, ROWS-3, 3);
            spikes(m, w-5, ROWS-3, 3);
            // 中央の大穴
            clearCols(m, 12, 4, ROWS-2, ROWS);
            spikes(m, 12, ROWS-1, 4);
            // 逃げ場と攻撃ポイント
            platf(m,[[3,ROWS-5,3],[8,ROWS-7,3],[13,ROWS-9,4],[19,ROWS-5,3],
                     [24,ROWS-7,3],[w-8,ROWS-5,3],[w-5,ROWS-7,3]]);
            // 遮蔽壁
            wall(m, 10, ROWS-3, 3);
            wall(m, 22, ROWS-3, 3);
            setGoal(m, w-3, ROWS-3);
            return m;
        },
        setupDynamic() {
            // 穴の上の動く床（戦闘中に渡る必要がある）
            movingPlatforms.push(new MovingPlatform(12*TILE, (ROWS-4)*TILE, TILE*3, 'h', 2*TILE, 0.6));
            // 崩れる足場（油断すると落ちる）
            crumblingBlocks.push(new CrumblingBlock(8*TILE, (ROWS-3)*TILE, TILE*2));
            crumblingBlocks.push(new CrumblingBlock(19*TILE, (ROWS-3)*TILE, TILE*2));
        }
    },
];

// レベルビルドヘルパー
function blank(w, h) { return Array.from({length:h}, ()=>Array(w).fill(0)); }
function fillRow(m, row, from, to, v) { for(let c=from;c<to&&c<m[0].length;c++) m[row][c]=v; }
function clearCols(m,s,len,r0,r1){ for(let c=s;c<s+len;c++) for(let r=r0;r<r1;r++) m[r][c]=0; }
function platf(m, arr) { for(const [x,y,w] of arr) for(let i=0;i<w;i++) set(m,x+i,y,2); }
function spikes(m, col, row, len) { for(let i=0;i<len;i++) set(m,col+i,row,3); }
function wall(m, col, row, h) { for(let i=0;i<h;i++) set(m,col,row-i,2); }
function set(m,c,r,v){ if(r>=0&&r<m.length&&c>=0&&c<m[0].length) m[r][c]=v; }
function setGoal(m,c,r){ set(m,c,r,5); }

// レベル拡張: 既存レベルの後に追加セクションを3回繰り返す
function expandLevel(origGenerate, origWidth, extraEnemySpawns) {
    return function(w) {
        const m = origGenerate.call(this, w);
        return m;
    };
}

// プロシージャル変化パターン（セクション毎に異なる構造を生成）
const SECTION_PATTERNS = [
    // パターン0: 階段状の上り下り
    function(m, startC, len, seed) {
        const rng = seedRNG(seed);
        const stepW = 3 + Math.floor(rng()*2);
        for (let i=0; i<len-10; i+=stepW+2) {
            const c = startC + i + 3;
            const h = 3 + Math.floor(rng()*3);
            if (c+stepW >= startC+len-4) break;
            platf(m, [[c, ROWS-2-h, stepW]]);
            if (rng() < 0.3) spikes(m, c, ROWS-3, Math.min(2, stepW));
        }
    },
    // パターン1: 縦穴+橋渡り
    function(m, startC, len, seed) {
        const rng = seedRNG(seed);
        const pitCount = 2 + Math.floor(rng()*2);
        for (let p=0; p<pitCount; p++) {
            const pc = startC + 6 + Math.floor(rng()*(len-16));
            const pw = 3 + Math.floor(rng()*3);
            clearCols(m, pc, pw, ROWS-2, ROWS);
            spikes(m, pc, ROWS-1, pw);
            // 穴の上に足場
            platf(m, [[pc, ROWS-5-Math.floor(rng()*2), Math.min(pw, 3)]]);
        }
    },
    // パターン2: 迷路壁+上下ルート
    function(m, startC, len, seed) {
        const rng = seedRNG(seed);
        const wallCount = 1 + Math.floor(rng()*2);
        for (let w=0; w<wallCount; w++) {
            const wc = startC + 8 + Math.floor(rng()*(len-20));
            const wh = 4 + Math.floor(rng()*3);
            wall(m, wc, ROWS-3, wh);
            // 壁に穴（下ルート or 上ルート）
            if (rng() < 0.5) set(m, wc, ROWS-4, 0);
            else set(m, wc, ROWS-5, 0);
            // 壁の上に足場
            platf(m, [[wc-2, ROWS-2-wh-1, 3]]);
        }
    },
    // パターン3: 高台密集エリア
    function(m, startC, len, seed) {
        const rng = seedRNG(seed);
        const platCount = 4 + Math.floor(rng()*3);
        for (let p=0; p<platCount; p++) {
            const pc = startC + 3 + Math.floor(rng()*(len-8));
            const ph = 4 + Math.floor(rng()*6);
            const pw = 2 + Math.floor(rng()*2);
            if (pc+pw < startC+len-2) platf(m, [[pc, ROWS-2-ph, pw]]);
        }
    },
    // パターン4: スパイク回廊（地面スパイク+安全な足場）
    function(m, startC, len, seed) {
        const rng = seedRNG(seed);
        // 地面にスパイクを配置
        for (let i=4; i<len-6; i+=4+Math.floor(rng()*3)) {
            const sc = startC + i;
            const sl = 2 + Math.floor(rng()*2);
            if (sc+sl < startC+len-3) spikes(m, sc, ROWS-3, sl);
        }
        // 安全な足場を上に
        for (let i=3; i<len-5; i+=5+Math.floor(rng()*3)) {
            const pc = startC + i;
            const ph = 4 + Math.floor(rng()*3);
            if (pc+3 < startC+len-2) platf(m, [[pc, ROWS-2-ph, 3]]);
        }
    },
    // パターン5: 天井からの柱+狭い通路
    function(m, startC, len, seed) {
        const rng = seedRNG(seed);
        const pillarCount = 2 + Math.floor(rng()*2);
        for (let p=0; p<pillarCount; p++) {
            const pc = startC + 5 + Math.floor(rng()*(len-12));
            const ph = 3 + Math.floor(rng()*3);
            for (let c=pc; c<pc+2 && c<startC+len-2; c++) {
                for (let r=0; r<ph; r++) set(m, c, r, 2);
            }
        }
        // 通路の両側に足場
        for (let i=3; i<len-6; i+=6+Math.floor(rng()*3)) {
            const pc = startC + i;
            if (pc+3 < startC+len-2) platf(m, [[pc, ROWS-5-Math.floor(rng()*3), 3]]);
        }
    },
];

// シード付き疑似乱数
function seedRNG(seed) {
    let s = seed;
    return function() {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s / 0x7fffffff);
    };
}

// 追加敵パターン（セクションの変化に合わせた敵配置）
const EXTRA_ENEMY_SETS = [
    [{type:'zombie',relCol:5,row:ROWS-3},{type:'shade',relCol:12,row:ROWS-7}],
    [{type:'shade',relCol:8,row:ROWS-6},{type:'spawner',relCol:15,row:ROWS-5}],
    [{type:'demon',relCol:6,row:ROWS-3},{type:'zombie',relCol:14,row:ROWS-3}],
    [{type:'shade',relCol:4,row:ROWS-8},{type:'demon',relCol:10,row:ROWS-3},{type:'shade',relCol:18,row:ROWS-6}],
    [{type:'spawner',relCol:7,row:ROWS-5},{type:'shade',relCol:13,row:ROWS-7},{type:'zombie',relCol:20,row:ROWS-3}],
];

// 各レベルを3x化するための後処理
// ボスステージ以外のレベルの width を3倍にし、各セクションに構造バリエーションを追加
(function tripleNonBossLevels() {
    for (let i = 0; i < LEVELS.length; i++) {
        const lvl = LEVELS[i];
        if (lvl.boss) continue; // ボスは拡張しない
        const origW = lvl.width;
        const newW = origW * 3;
        lvl.width = newW;
        const origGenerate = lvl.generate;
        const origEnemies = [...lvl.enemySpawns];
        const origSetupDynamic = lvl.setupDynamic;
        const levelSeed = i * 1000 + 42;
        // 敵を3セクション分に展開（セクション2,3は追加パターンも適用）
        lvl.enemySpawns = [];
        for (let sec = 0; sec < 3; sec++) {
            const offset = sec * origW;
            for (const sp of origEnemies) {
                lvl.enemySpawns.push({
                    type: sp.type,
                    col: Math.min(sp.col + offset, newW - 3),
                    row: sp.row
                });
            }
            // セクション2,3に追加敵
            if (sec > 0) {
                const extraSet = EXTRA_ENEMY_SETS[(levelSeed + sec) % EXTRA_ENEMY_SETS.length];
                for (const sp of extraSet) {
                    const col = Math.min(sp.relCol + offset + 3, newW - 3);
                    lvl.enemySpawns.push({ type: sp.type, col, row: sp.row });
                }
            }
        }
        // generateを3セクション+プロシージャル変化に拡張
        lvl.generate = function(w) {
            const m = blank(w, ROWS);
            // セクション1: オリジナルマップ
            const sec0Map = origGenerate.call(lvl, origW);
            for (let r = 0; r < ROWS; r++) {
                for (let c = 0; c < origW; c++) {
                    if (sec0Map[r][c] !== 5) m[r][c] = sec0Map[r][c];
                }
            }
            // セクション2,3: オリジナル+プロシージャル変化
            for (let sec = 1; sec < 3; sec++) {
                const offset = sec * origW;
                const secMap = origGenerate.call(lvl, origW);
                for (let r = 0; r < ROWS; r++) {
                    for (let c = 0; c < origW; c++) {
                        const destC = c + offset;
                        if (destC < w && secMap[r][c] !== 5) {
                            m[r][destC] = secMap[r][c];
                        }
                    }
                }
                // プロシージャル変化をオーバーレイ
                const patIdx1 = (levelSeed + sec * 37) % SECTION_PATTERNS.length;
                const patIdx2 = (levelSeed + sec * 73 + 1) % SECTION_PATTERNS.length;
                const seed1 = levelSeed * 100 + sec * 7;
                const seed2 = levelSeed * 200 + sec * 13;
                SECTION_PATTERNS[patIdx1](m, offset, origW, seed1);
                if (patIdx1 !== patIdx2) {
                    SECTION_PATTERNS[patIdx2](m, offset, origW, seed2);
                }
            }
            // ゴールは最後のセクションの最後に配置
            setGoal(m, w - 4, ROWS - 5);
            // セクション境界を繋ぐ地面（接続部分を確実に通行可能に）
            for (let sec = 0; sec < 2; sec++) {
                const boundary = (sec + 1) * origW;
                fillRow(m, ROWS-1, boundary - 4, boundary + 4, 1);
                fillRow(m, ROWS-2, boundary - 4, boundary + 4, 1);
                // 境界の壁やスパイクを除去（通行可能にする）
                for (let c = boundary-3; c < boundary+3; c++) {
                    for (let r = ROWS-6; r < ROWS-2; r++) {
                        if (r>=0 && c>=0 && c<w && m[r][c] === 3) m[r][c] = 0;
                        if (r>=0 && c>=0 && c<w && m[r][c] === 2) m[r][c] = 0;
                    }
                }
                // 境界に装飾的な足場
                platf(m, [[boundary - 2, ROWS-5, 3]]);
            }
            return m;
        };
        // setupDynamicも3セクション分
        if (origSetupDynamic) {
            lvl.setupDynamic = function() {
                origSetupDynamic.call(lvl);
                const origMP = [...movingPlatforms];
                const origCB = [...crumblingBlocks];
                for (let sec = 1; sec < 3; sec++) {
                    const offset = sec * origW * TILE;
                    for (const mp of origMP) {
                        movingPlatforms.push(new MovingPlatform(
                            mp.ox + offset, mp.oy, mp.w, mp.dir, mp.dist, mp.spd
                        ));
                    }
                    for (const cb of origCB) {
                        crumblingBlocks.push(new CrumblingBlock(
                            cb.x + offset, cb.y, cb.w
                        ));
                    }
                    // セクション毎に追加の動的オブジェクト
                    const rng = seedRNG(levelSeed + sec * 50);
                    const addMP = Math.floor(rng()*2) + 1;
                    for (let j=0; j<addMP; j++) {
                        const mpc = offset + Math.floor(rng()*(origW-10)*TILE) + 5*TILE;
                        const dir = rng() < 0.5 ? 'h' : 'v';
                        const dist = dir === 'h' ? (3+Math.floor(rng()*3))*TILE : -(2+Math.floor(rng()*2))*TILE;
                        movingPlatforms.push(new MovingPlatform(mpc, (ROWS-4-Math.floor(rng()*3))*TILE, TILE*2, dir, dist, 0.7+rng()*0.5));
                    }
                    // 追加崩れる床
                    if (rng() < 0.6) {
                        const cbc = offset + Math.floor(rng()*(origW-8)*TILE) + 4*TILE;
                        crumblingBlocks.push(new CrumblingBlock(cbc, (ROWS-3)*TILE, TILE*(1+Math.floor(rng()*2))));
                    }
                }
            };
        }
    }
})();

// 敵が壁に埋まっている場合、上方向に押し出す
function _unstickEnemy(e, map) {
    if (!map || !map[0]) return;
    // 敵の四隅のいずれかがソリッドタイルにあるか確認
    const checkPoints = [
        [e.x + 2, e.y + 2],
        [e.x + e.w - 2, e.y + 2],
        [e.x + 2, e.y + e.h - 2],
        [e.x + e.w - 2, e.y + e.h - 2],
        [e.x + e.w/2, e.y + e.h/2],
    ];
    let stuck = false;
    for (const [px, py] of checkPoints) {
        const col = Math.floor(px / TILE);
        const row = Math.floor(py / TILE);
        if (row >= 0 && row < map.length && col >= 0 && col < map[0].length) {
            const v = map[row][col];
            if (v === 1 || v === 2) { stuck = true; break; }
        }
    }
    if (!stuck) return;
    // 上方向に押し出す（最大10タイル分）
    for (let dy = 1; dy <= 10; dy++) {
        const testY = e.y - dy * TILE;
        let clear = true;
        for (const [px, _] of checkPoints) {
            const col = Math.floor(px / TILE);
            const row = Math.floor((testY + (e.h/2)) / TILE);
            if (row >= 0 && row < map.length && col >= 0 && col < map[0].length) {
                const v = map[row][col];
                if (v === 1 || v === 2) { clear = false; break; }
            }
        }
        if (clear) {
            e.y = testY;
            return;
        }
    }
    // 左右にも試行
    for (const dx of [-TILE, TILE, -2*TILE, 2*TILE]) {
        const testX = e.x + dx;
        let clear = true;
        for (const [_, py] of checkPoints) {
            const col = Math.floor((testX + e.w/2) / TILE);
            const row = Math.floor(py / TILE);
            if (row >= 0 && row < map.length && col >= 0 && col < map[0].length) {
                const v = map[row][col];
                if (v === 1 || v === 2) { clear = false; break; }
            }
        }
        if (clear) {
            e.x = testX;
            return;
        }
    }
}

// ============================================================
//  ロード
// ============================================================
function loadLevel(idx) {
    if (idx >= LEVELS.length) { state=S.CLEAR; stopBGM(); return; }
    currentLevelIdx = idx;
    const lvl = LEVELS[idx];
    // カスタムマップがあればそちらを使用
    const customData = tryLoadCustomMap(idx);
    if (customData) {
        levelMap = customData.map;
    } else {
        levelMap = lvl.generate(lvl.width);
    }

    enemies=[]; items=[]; bullets=[]; particles=[]; enemyBullets=[]; goal=null;
    movingPlatforms=[]; crumblingBlocks=[]; currencyDrops=[];

    // 動的オブジェクト生成
    if (lvl.setupDynamic) lvl.setupDynamic();

    // ゴール（周囲のタイルをクリアして埋まり防止）
    for (let r=0; r<levelMap.length; r++) for (let c=0; c<levelMap[r].length; c++) {
        if (levelMap[r][c]===5) {
            goal = {x:c*TILE, y:r*TILE - TILE*2, w:TILE, h:TILE*3, t:0};
            levelMap[r][c]=0;
            for (let dr=-3; dr<0; dr++) {
                if (r+dr>=0) set(levelMap,c,r+dr,0);
            }
        }
    }
    // 敵スポーン（遠い敵はスリープ状態で配置）
    for (const sp of lvl.enemySpawns) {
        const ex = sp.col*TILE, ey = sp.row*TILE;
        let e = null;
        if      (sp.type==='zombie')  e = new Zombie (ex, ey);
        else if (sp.type==='shade')   e = new Shade  (ex, ey);
        else if (sp.type==='demon')   e = new Demon  (ex, ey);
        else if (sp.type==='spawner') e = new Spawner(ex, ey);
        else if (sp.type==='boss1')   e = new Boss(ex, ey, 1);
        else if (sp.type==='boss2')   e = new Boss(ex, ey, 2);
        else if (sp.type==='boss3')   e = new Boss(ex, ey, 3);
        if (e) {
            // 敵のHP・ダメージをステージスケーリング
            const hpScale = getEnemyHpScale();
            e.hp = Math.floor(e.hp * hpScale);
            e.maxHp = e.hp;
            // 壁に埋まっている場合は安全な位置に移動
            _unstickEnemy(e, levelMap);
            // プレイヤー開始位置(80px)から遠い敵はスリープ
            if (e.x > 400 && !(e instanceof Boss)) e.sleeping = true;
            enemies.push(e);
        }
    }

    // カスタムマップの敵を追加ロード
    if (customData && customData.enemies) {
        for (const ce of customData.enemies) {
            let e = null;
            if      (ce.type==='zombie')  e = new Zombie(ce.x, ce.y);
            else if (ce.type==='shade')   e = new Shade(ce.x, ce.y);
            else if (ce.type==='demon')   e = new Demon(ce.x, ce.y);
            else if (ce.type==='spawner') e = new Spawner(ce.x, ce.y);
            else if (ce.type==='boss1')   e = new Boss(ce.x, ce.y, 1);
            else if (ce.type==='boss2')   e = new Boss(ce.x, ce.y, 2);
            else if (ce.type==='boss3')   e = new Boss(ce.x, ce.y, 3);
            if (e) {
                const hpScale = getEnemyHpScale();
                e.hp = Math.floor(e.hp * hpScale); e.maxHp = e.hp;
                _unstickEnemy(e, levelMap);
                if (e.x > 400 && !(e instanceof Boss)) e.sleeping = true;
                enemies.push(e);
            }
        }
    }

    player.x=80; player.y=100; player.vx=0; player.vy=0; player.onGround=false;
    player.invincible=0;
    cameraX=0;

    // 面開始時の能力をバックアップ
    savedUpgrades = JSON.parse(JSON.stringify(player.upgrades));
    savedWeapon = player.weapon;
    savedHp = player.hp;
    savedMaxHp = player.maxHp;
    savedEpic = { maxExtraJumps:player.maxExtraJumps, hasMagnet:player.hasMagnet, hasShield:player.hasShield, shieldHp:player.shieldHp, hasLifeSteal:player.hasLifeSteal };

    // 準備期間
    readyTimer = 120; // 2秒
    state = S.READY;

    // BGM切り替え（ステージ変更時）
    const newStage = Math.floor(idx / 4);
    const prevStage = idx > 0 ? Math.floor((idx-1) / 4) : -1;
    if (newStage !== prevStage || !bgmPlaying) {
        stopBGM();
        startBGM(newStage);
    }
}

// ============================================================
//  プレイヤー更新
// ============================================================
function updatePlayer() {
    // 移動
    const moveSpd = BASE_MOVE_SPEED * player.upgrades.moveSpeed;
    if (keys['KeyA']||keys['ArrowLeft'])  player.vx -= moveSpd;
    if (keys['KeyD']||keys['ArrowRight']) player.vx += moveSpd;
    // ジャンプ（ふわっと） + 空中ジャンプ
    const jumpF = BASE_JUMP_FORCE * player.upgrades.jumpPower;
    const jumpPressed = keys['KeyW']||keys['ArrowUp']||keys['Space'];
    if (jumpPressed && !player._jumpHeld) {
        if (player.onGround) {
            player.vy = jumpF;
            player.extraJumps = player.maxExtraJumps;
            spawnParticles(player.x+player.w/2, player.y+player.h, '#444', 6, 2);
            sfxJump();
        } else if (player.extraJumps > 0) {
            player.vy = jumpF * 0.85;
            player.extraJumps--;
            spawnParticles(player.x+player.w/2, player.y+player.h, '#c4f', 8, 3);
            sfxJump();
        }
    }
    player._jumpHeld = jumpPressed;
    player.vy += GRAVITY;
    player.vx *= FRICTION;
    const maxHSpd = 5 * player.upgrades.moveSpeed;
    player.vx = Math.max(-maxHSpd, Math.min(maxHSpd, player.vx));
    player.vy = Math.max(-10, Math.min(7, player.vy));  // 落下速度を制限してふわっと感

    // X軸移動
    player.x += player.vx;
    for (const t of getTilesAround(player.x, player.y, player.w, player.h)) {
        if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, t)) {
            if (player.vx>0) { player.x=t.x-player.w; } else { player.x=t.x+t.w; }
            player.vx=0;
        }
    }
    // Y軸移動
    player.y += player.vy;
    player.onGround=false;
    for (const t of getTilesAround(player.x, player.y, player.w, player.h)) {
        if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, t)) {
            if (player.vy>0) { player.y=t.y-player.h; player.vy=0; player.onGround=true; }
            else             { player.y=t.y+t.h;       player.vy=0; }
        }
    }

    // 向き
    const mx = mouse.x + cameraX;
    if (mx < player.x+player.w/2) player.facing=-1; else player.facing=1;

    // 落下死
    if (player.y > canvas.height+100) { playerHit(999); return; }

    // 無敵
    if (player.invincible>0) player.invincible--;

    // アニメ
    if (Math.abs(player.vx)>0.5 && player.onGround) player.animTimer+=0.14;
    else player.animTimer=0;

    // 射撃
    if (player.fireCd>0) player.fireCd--;
    if (mouse.down && player.fireCd<=0) fireWeapon();
    // 剣斬撃アニメ更新
    if (swordSlash.active) { swordSlash.timer--; if (swordSlash.timer<=0) swordSlash.active=false; }

    // 敵との当たり判定
    for (const e of enemies) {
        if (!e.alive) continue;
        if (!rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, e.rect())) continue;
        // 踏みつけ判定
        if (player.vy>1 && player.y+player.h < e.y+e.h*0.5+8) {
            // ダメージ制: 通常敵60, ボスは25（ボスには踏みが通りにくい）
            const stompDmg = Math.floor(((e instanceof Boss) ? 25 : 60) * getHubAttackMul());
            e.takeDamage(stompDmg);
            player.vy = BASE_JUMP_FORCE*0.65;
            score += 50;
            shakeAmt = 7;
            sfxStomp();
        } else if (player.invincible<=0) {
            playerHit(25);
        }
    }

    // 敵弾との当たり判定
    if (player.invincible <= 0) {
        for (const eb of enemyBullets) {
            if (!eb.alive) continue;
            const dx = player.x+player.w/2 - eb.x;
            const dy = player.y+player.h/2 - eb.y;
            if (Math.sqrt(dx*dx+dy*dy) < eb.size + 12) {
                eb.alive = false;
                spawnParticles(eb.x, eb.y, eb.color, 8, 3);
                playerHit(eb.dmg);
            }
        }
    }

    // アイテム取得 + 磁石効果
    for (const it of items) {
        if (it.collected) continue;
        if (player.hasMagnet && !it.type.startsWith('WEAPON_')) {
            const dx = (player.x+player.w/2) - it.x;
            const dy = (player.y+player.h/2) - it.y;
            const dist = Math.sqrt(dx*dx+dy*dy);
            if (dist < 200) {
                it.x += dx/dist * 3;
                it.y += dy/dist * 3;
            }
        }
        if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h},{x:it.x-15,y:it.y-15,w:30,h:30})) {
            it.applyTo();
        }
    }

    // ゴール（敵を全滅させないと進めない）
    const enemiesAlive = enemies.filter(e=>e.alive).length;
    if (goal && enemiesAlive === 0 && rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, goal)) {
        score += 500;
        sfxGoal();
        spawnParticles(player.x+player.w/2,player.y,'#f1c40f',20,5);
        if (currentLevelIdx > highestLevelCleared) highestLevelCleared = currentLevelIdx;
        currentLevelIdx++;
        if (currentLevelIdx >= LEVELS.length) { state=S.CLEAR; stopBGM(); }
        else { enterRewardScreen(); }
    }

    // カメラ
    const target = player.x - canvas.width/3;
    const maxCam = (levelMap[0]||[]).length * TILE - canvas.width;
    cameraX += (target - cameraX)*0.1;
    cameraX = Math.max(0, Math.min(maxCam, cameraX));
}

function playerHit(dmg) {
    // シールドでダメージ吸収
    if (player.hasShield && player.shieldHp > 0) {
        const absorbed = Math.min(dmg, player.shieldHp);
        player.shieldHp -= absorbed;
        dmg -= absorbed;
        spawnParticles(player.x+player.w/2, player.y+player.h/2, '#00ccff', 8, 3);
        if (dmg <= 0) { player.invincible = 30; return; }
    }
    player.hp -= dmg;
    player.invincible = 80;
    shakeAmt = 12;
    spawnParticles(player.x+player.w/2, player.y+player.h/2, '#ff0000', 10, 4);
    sfxPlayerHit();
    if (player.hp<=0) {
        player.hp=0;
        lives--;
        sfxDeath();
        if (lives <= 0) {
            state=S.OVER; stopBGM();
            // 死んでもステージ中に稼いだゴールド・素材は保持
        } else {
            // 面の最初に戻す（能力リセット、HP全回復）
            player.upgrades = JSON.parse(JSON.stringify(savedUpgrades));
            player.weapon = savedWeapon;
            player.maxHp = savedMaxHp;
            if (savedEpic) { player.maxExtraJumps=savedEpic.maxExtraJumps||0; player.extraJumps=player.maxExtraJumps; player.hasMagnet=savedEpic.hasMagnet||false; player.hasShield=savedEpic.hasShield||false; player.shieldHp=savedEpic.shieldHp||0; player.hasLifeSteal=savedEpic.hasLifeSteal||false; }
            player.hp = player.maxHp; // HP全回復
            loadLevel(currentLevelIdx);
        }
    }
}

// ============================================================
//  射撃
// ============================================================
// 剣の斬撃アニメ用
let swordSlash = { active:false, timer:0, angle:0 };

function fireWeapon() {
    const W   = WEAPONS[player.weapon];
    const up  = player.upgrades;
    const cd  = Math.max(1, W.cd / up.fireRate | 0);
    player.fireCd = cd;

    const ox = player.x + player.w/2;
    const oy = player.y + player.h/2;
    const tx = mouse.x + cameraX;
    const ty = mouse.y;
    const base = Math.atan2(ty-oy, tx-ox);

    if (W.melee) {
        // 剣: 近接範囲攻撃
        sfxStomp();
        swordSlash = { active:true, timer:8, angle:base };
        const range = W.range * up.bulletSize;
        const dmg = W.dmg * getHubAttackMul() * (1 + (up.multiShot-1)*0.3); // multiShotで威力UP
        for (const e of enemies) {
            if (!e.alive) continue;
            const ex = e.x+e.w/2, ey = e.y+e.h/2;
            const dx = ex-ox, dy = ey-oy;
            const dist = Math.sqrt(dx*dx+dy*dy);
            if (dist > range) continue;
            // 向いている方向の±90度以内
            const aToE = Math.atan2(dy, dx);
            let diff = aToE - base;
            while (diff > Math.PI) diff -= Math.PI*2;
            while (diff < -Math.PI) diff += Math.PI*2;
            if (Math.abs(diff) < Math.PI*0.6) {
                e.takeDamage(dmg);
            }
        }
        // 斬撃エフェクト
        for (let i=0;i<8;i++) {
            const a = base + (Math.random()-0.5)*1.2;
            const d = 20 + Math.random()*30;
            spawnParticles(ox+Math.cos(a)*d, oy+Math.sin(a)*d, W.color, 2, 3);
        }
        player.vx += Math.cos(base)*2; // 前方への踏み込み
        return;
    }

    if (player.weapon === 'SHOTGUN') sfxShotgun(); else sfxShoot();

    const pellets  = (W.pellets||1) + (player.weapon==='SHOTGUN' ? up.multiShot-1 : 0);
    const multiCnt = player.weapon==='SHOTGUN' ? pellets : up.multiShot;

    for (let i=0; i<multiCnt; i++) {
        const spreadFactor = (multiCnt>1)
            ? (i-(multiCnt-1)/2) * 0.12
            : 0;
        const fireSpread = W.spread + Math.abs(player.vx)*0.02;
        const angle = base + spreadFactor + (Math.random()-0.5)*fireSpread;
        const spd   = W.spd;
        bullets.push(new Bullet(ox, oy, Math.cos(angle)*spd, Math.sin(angle)*spd, player.weapon, up.bulletSize));
    }
    // 発射フラッシュ
    spawnParticles(ox, oy, W.color, 4, 2);

    // 反動
    player.vx -= Math.cos(base)*1.2;
    player.vy -= Math.sin(base)*0.4;
}

// ============================================================
//  弾丸 vs 敵
// ============================================================
function updateBullets() {
    for (const b of bullets) {
        if (!b.alive) continue;
        b.update();
        for (const e of enemies) {
            if (!e.alive||!b.alive) continue;
            if (rectsOverlap({x:b.x-b.size,y:b.y-b.size,w:b.size*2,h:b.size*2}, e.rect())) {
                e.takeDamage(b.dmg);
                // 吸血効果
                if (player.hasLifeSteal) {
                    player.hp = Math.min(player.hp + Math.ceil(b.dmg * 0.1), player.maxHp);
                }
                if (!b.piercing) b.kill();
            }
        }
    }
    bullets = bullets.filter(b=>b.alive);
}

// ============================================================
//  描画
// ============================================================
function drawBackground() {
    const idx = Math.min(currentLevelIdx, LEVELS.length-1);
    const lvl = LEVELS[idx];
    const theme = getStageTheme();
    ctx.fillStyle = lvl.bg1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = lvl.bg2;
    ctx.fillRect(0, canvas.height/2, canvas.width, canvas.height/2);

    // 星（8bitドット）
    for (let i=0;i<16;i++) {
        const bx = ((i*157+50)%(canvas.width+200))-100 - Math.round(cameraX*0.05)%200;
        const by = (i*113+40)%canvas.height;
        const blink = Math.floor((wave+i*7)/30)%3;
        if (blink < 2) px(bx, by, 1, 1, blink===0 ? theme.starCol1 : theme.starCol2);
    }
}

function drawTiles() {
    const theme = getStageTheme();
    const s0=Math.floor(cameraX/TILE), s1=s0+COLS+2;
    for (let r=0;r<levelMap.length;r++) {
        for (let c=s0;c<=s1&&c<(levelMap[r]||[]).length;c++) {
            if (c<0) continue;
            const v=levelMap[r][c]; if (!v) continue;
            const sx=Math.round(c*TILE-cameraX), sy=r*TILE;
            if (v===1) {
                pxRect(sx, sy, TILE, TILE, theme.tileFg);
                pxRect(sx, sy, TILE, 2, theme.tileHi);
                pxRect(sx, sy+TILE-2, TILE, 2, theme.tileSh);
                pxRect(sx, sy+TILE/2-1, TILE, 2, theme.tileSh);
                const off = (r%2) * (TILE/2);
                pxRect(sx+((TILE/4+off)%TILE), sy, 2, TILE/2, theme.tileSh);
                pxRect(sx+((TILE*3/4+off)%TILE), sy+TILE/2, 2, TILE/2, theme.tileSh);
                if (r>0&&levelMap[r-1][c]===0) {
                    pxRect(sx, sy, TILE, 4, theme.tileHi);
                }
            } else if (v===2) {
                pxRect(sx, sy, TILE, TILE, theme.tileFg2);
                pxRect(sx, sy, TILE, 2, theme.tileHi2);
                pxRect(sx, sy+TILE-2, TILE, 2, theme.tileSh2);
                pxRect(sx, sy, 2, TILE, theme.tileHi2);
                pxRect(sx+TILE-2, sy, 2, TILE, theme.tileSh2);
                pxRect(sx+TILE/2-4, sy+TILE/2-4, 8, 8, theme.tileSh2);
                px(sx+TILE/2-2, sy+TILE/2-2, 2, 2, theme.tileHi2);
            } else if (v===3) {
                // スパイク（ダメージ床）
                const stageIdx = getStageIdx();
                const spikeCol = stageIdx===0 ? '#806' : stageIdx===1 ? '#08a' : '#a40';
                const spikeTip = stageIdx===0 ? '#f0a' : stageIdx===1 ? '#0cf' : '#f80';
                // 底面ベース
                pxRect(sx, sy+TILE-8, TILE, 8, spikeCol);
                // 三角スパイク(5本)
                for (let i = 0; i < 5; i++) {
                    const bx = sx + i*8;
                    pxRect(bx+2, sy+TILE-16, 4, 8, spikeCol);
                    pxRect(bx+3, sy+TILE-20, 2, 4, spikeTip);
                    px(bx+3, sy+TILE-22, 2, 2, '#fff');
                }
            }
        }
    }
}

function drawGoal() {
    if (!goal) return;
    goal.t += 0.03;
    const sx = Math.round(goal.x - cameraX);
    if (sx < -60 || sx > canvas.width+60) return;
    const alive = enemies.filter(e=>e.alive).length;
    const unlocked = alive === 0;
    const blink = Math.floor(goal.t*10)%2;
    // ポール
    pxRect(sx+TILE/2-2, goal.y, 4, goal.h, unlocked ? '#aa8' : '#333');
    // 旗（ピクセル）
    const fc = unlocked ? (blink ? '#f00' : '#c00') : '#400';
    pxRect(sx+TILE/2+2, goal.y+4, 24, 4, fc);
    pxRect(sx+TILE/2+2, goal.y+8, 20, 4, fc);
    pxRect(sx+TILE/2+2, goal.y+12, 16, 4, fc);
    // 旗の模様
    if (unlocked) {
        px(sx+TILE/2+8, goal.y+6, 2, 2, '#ff0');
        px(sx+TILE/2+14, goal.y+6, 2, 2, '#ff0');
    }
    // ポール先端
    pxRect(sx+TILE/2-4, goal.y-4, 8, 6, unlocked ? '#ff0' : '#444');
    if (!unlocked) {
        // 残り敵数
        ctx.fillStyle='#a44';
        ctx.font='bold 12px monospace';
        ctx.textAlign='center';
        ctx.fillText(`残り${alive}体`, sx+TILE/2, goal.y + goal.h + 16);
        ctx.textAlign='left';
    }
}

function drawPlayer() {
    if (player.invincible>0 && Math.floor(player.invincible/4)%2===0) return;
    const sx = Math.round(player.x - cameraX);
    const sy = Math.round(player.y);
    const f = player.facing;
    const bob = player.onGround ? Math.round(Math.sin(player.animTimer*2)*2) : (player.vy<0?-2:2);
    const y = sy + bob;
    const hw = player.w;

    // マント
    pxRect(sx-2, y+8, hw+4, 30, '#112');
    // 体
    pxRect(sx+4, y+4, hw-8, 32, '#223');
    // 頭
    pxRect(sx+4, y, hw-8, 12, '#113');
    // ヘルメット/フード
    pxRect(sx+2, y-2, hw-4, 6, '#224');
    // 目（向き依存）
    if (f > 0) {
        px(sx+16, y+4, 3, 3, '#f22');
    } else {
        px(sx+5, y+4, 3, 3, '#f22');
    }
    // 脚（歩行アニメ）
    const walk = Math.floor(player.animTimer*2)%2;
    if (player.onGround && Math.abs(player.vx)>0.5) {
        if (walk) {
            pxRect(sx+4, y+34, 8, 8, '#112');
            pxRect(sx+14, y+34, 8, 6, '#112');
        } else {
            pxRect(sx+4, y+34, 8, 6, '#112');
            pxRect(sx+14, y+34, 8, 8, '#112');
        }
    } else {
        pxRect(sx+4, y+34, 8, 6, '#112');
        pxRect(sx+14, y+34, 8, 6, '#112');
    }
    // 武器描画（向き依存）
    const W = WEAPONS[player.weapon];
    if (W.melee) {
        // 剣: 刃+鍔+柄
        if (f > 0) {
            pxRect(sx+hw-2, y+6, 3, 16, '#ddd');  // 刃
            pxRect(sx+hw-2, y+4, 3, 3, '#fff');    // 先端
            pxRect(sx+hw-5, y+21, 9, 2, W.color);  // 鍔
            pxRect(sx+hw-1, y+23, 2, 5, '#864');   // 柄
        } else {
            pxRect(sx-1, y+6, 3, 16, '#ddd');
            pxRect(sx-1, y+4, 3, 3, '#fff');
            pxRect(sx-4, y+21, 9, 2, W.color);
            pxRect(sx, y+23, 2, 5, '#864');
        }
    } else {
        // 銃
        if (f > 0) {
            pxRect(sx+hw-2, y+14, 14, 4, W.color);
            pxRect(sx+hw, y+15, 10, 2, '#333');
        } else {
            pxRect(sx-12, y+14, 14, 4, W.color);
            pxRect(sx-10, y+15, 10, 2, '#333');
        }
    }

    // 剣の斬撃アーク描画
    if (swordSlash.active) {
        const cx = player.x + player.w/2 - cameraX;
        const cy = player.y + player.h/2;
        const progress = 1 - swordSlash.timer / 8;
        const r = 40 + progress * 20;
        const alpha = swordSlash.timer / 8;
        const sweepStart = swordSlash.angle - 0.8 + progress * 1.6;
        const sweepEnd = sweepStart + 0.4;
        // 斬撃の弧をピクセルドットで描画
        for (let a = sweepStart; a < sweepEnd; a += 0.15) {
            const px1 = cx + Math.cos(a) * r;
            const py1 = cy + Math.sin(a) * r;
            const px2 = cx + Math.cos(a) * (r - 8);
            const py2 = cy + Math.sin(a) * (r - 8);
            ctx.globalAlpha = alpha;
            pxRect(Math.round(px1)-2, Math.round(py1)-2, 4, 4, '#fff');
            pxRect(Math.round(px2)-1, Math.round(py2)-1, 3, 3, '#ff4444');
            ctx.globalAlpha = 1;
        }
    }
    // シールド描画
    if (player.hasShield && player.shieldHp > 0) {
        ctx.globalAlpha = 0.25 + 0.1 * Math.sin(Date.now()*0.005);
        pxRect(sx-4, sy-4, player.w+8, player.h+8, '#00ccff');
        ctx.globalAlpha = 1;
    }
}

function drawHUD() {
    const lvlIdx = Math.min(currentLevelIdx, LEVELS.length-1);
    // HP バー（NES風）
    pxRect(8,8,208,20, '#000');
    const hpRatio = player.hp/player.maxHp;
    const hpColor = hpRatio>0.5?'#c00': hpRatio>0.25?'#f40':'#f00';
    pxRect(10,10,204,16, '#200');
    pxRect(10,10,Math.round(204*hpRatio),16, hpColor);
    pxRect(10,10,204,2, '#f44');  // ハイライト
    ctx.fillStyle='#fff'; ctx.font='bold 12px monospace';
    ctx.fillText(`HP ${player.hp|0}/${player.maxHp}`,14,23);

    // スコア＆所持金
    pxRect(8,32,200,18, '#000');
    ctx.fillStyle='#fc0'; ctx.font='bold 12px monospace';
    ctx.fillText(`${gold}G  素材${materials}  SC${score}`, 12, 46);

    // 武器
    const W = WEAPONS[player.weapon];
    pxRect(8,54,224,58, '#000');
    pxRect(10,56,220,54, '#111');
    // 枠のドット
    pxRect(10,56,220,2, W.color);
    pxRect(10,108,220,2, W.color);
    ctx.fillStyle=W.color; ctx.font='bold 12px monospace';
    ctx.fillText(`${W.name}`, 14, 72);
    ctx.fillStyle='#aaa'; ctx.font='11px monospace';
    ctx.fillText(`弾×${player.upgrades.multiShot} 速射×${player.upgrades.fireRate.toFixed(1)} 弾径×${player.upgrades.bulletSize.toFixed(1)}`, 14, 88);
    ctx.fillStyle='#88a'; ctx.font='10px monospace';
    let statusLine = `脚力×${player.upgrades.moveSpeed.toFixed(1)} 跳躍×${player.upgrades.jumpPower.toFixed(1)}`;
    if (player.maxExtraJumps > 0) statusLine += ` 空中J×${player.maxExtraJumps}`;
    ctx.fillText(statusLine, 14, 102);
    // エピック能力アイコン
    let epicY = 116;
    if (player.hasShield) { ctx.fillStyle='#0cf'; ctx.font='10px monospace'; ctx.fillText(`◇バリア HP:${player.shieldHp}`, 14, epicY); epicY+=12; }
    if (player.hasMagnet) { ctx.fillStyle='#fc0'; ctx.font='10px monospace'; ctx.fillText('⊕磁石', 14, epicY); epicY+=12; }
    if (player.hasLifeSteal) { ctx.fillStyle='#c04'; ctx.font='10px monospace'; ctx.fillText('♦吸血', 14, epicY); epicY+=12; }

    // レベル
    const stg = getStageIdx() + 1;
    const lvlInStg = (lvlIdx % 4) + 1;
    const isBoss = !!LEVELS[lvlIdx].boss;
    pxRect(canvas.width/2-124,8,248,20, '#000');
    ctx.fillStyle='#a4f'; ctx.font='bold 12px monospace';
    ctx.textAlign='center';
    ctx.fillText(`STAGE${stg}-${isBoss?'BOSS':lvlInStg} ${LEVELS[lvlIdx].name}`, canvas.width/2, 22);
    ctx.textAlign='left';

    // 残り敵数
    const alive = enemies.filter(e=>e.alive).length;
    pxRect(canvas.width-138,8,130,20, '#000');
    ctx.fillStyle= alive>0 ? '#f44' : '#4f4'; ctx.font='bold 12px monospace';
    ctx.fillText(`敵 ${alive}体`, canvas.width-132, 22);

    // 残機
    pxRect(canvas.width-138,32,130,20, '#000');
    ctx.fillStyle='#fc0'; ctx.font='bold 12px monospace';
    let lifeStr = '';
    for (let i=0;i<lives;i++) lifeStr+='♥';
    ctx.fillText(`残機 ${lifeStr}`, canvas.width-132, 46);

    // 照準線
    drawCrosshair();
}

function drawCrosshair() {
    const mx=Math.round(mouse.x), my=Math.round(mouse.y);
    const W=WEAPONS[player.weapon];
    // ピクセル十字照準
    pxRect(mx-12, my-1, 8, 2, W.color);
    pxRect(mx+4, my-1, 8, 2, W.color);
    pxRect(mx-1, my-12, 2, 8, W.color);
    pxRect(mx-1, my+4, 2, 8, W.color);
    // 中心ドット
    px(mx-1, my-1, 1, 1, '#fff');
}

// ピックアップテキスト描画
function drawPickupTexts(camX) {
    for (const p of pickupTexts) {
        if (p.life<=0) continue;
        const a = p.life/p.maxL;
        ctx.globalAlpha=a;
        ctx.fillStyle=p.color;
        ctx.shadowBlur=10; ctx.shadowColor=p.color;
        ctx.font='bold 16px monospace';
        ctx.textAlign='center';
        ctx.fillText(p.text, p.x-camX+player.w/2, p.y - (p.maxL-p.life)*0.5);
        ctx.textAlign='left';
        ctx.globalAlpha=1; ctx.shadowBlur=0;
    }
    pickupTexts=pickupTexts.filter(p=>p.life-->0);
}

// ============================================================
//  タイトル画面
// ============================================================
let titleT=0;
function drawTitle() {
    titleT++;
    ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // 背景の星（8bitドット）
    for (let i=0;i<30;i++) {
        const tx=(i*137.5)%canvas.width;
        const ty=(i*97.3)%canvas.height;
        const blink = Math.floor((titleT+i*11)/20)%3;
        if (blink<2) px(tx, ty, 1, 1, blink===0?'#844':'#422');
    }
    // 地面ライン
    pxRect(0, 440, canvas.width, 2, '#442');
    pxRect(0, 442, canvas.width, 98, '#221');
    // レンガ模様
    for (let i=0;i<canvas.width;i+=40) {
        pxRect(i, 460, 2, 80, '#332');
    }
    // タイトル
    ctx.textAlign='center';
    ctx.fillStyle='#c0f';
    ctx.font='bold 64px monospace';
    ctx.fillText('DARK ABYSS', canvas.width/2, 170);
    // 下線
    pxRect(canvas.width/2-200, 180, 400, 4, '#a0d');
    ctx.fillStyle='#f44';
    ctx.font='bold 20px monospace';
    ctx.fillText('- 深淵を走れ -', canvas.width/2, 215);
    // 操作説明
    ctx.fillStyle='#888'; ctx.font='14px monospace';
    ctx.fillText('WASD/矢印:移動  W/↑/Space:ジャンプ', canvas.width/2, 290);
    ctx.fillText('マウス:照準  クリック:射撃', canvas.width/2, 315);
    ctx.fillText('敵の上に乗って踏みつけも可', canvas.width/2, 340);
    ctx.fillText('拠点で強化→ステージ攻略 深淵を制覇せよ', canvas.width/2, 365);
    // スタート（点滅）
    if (Math.floor(titleT/20)%2) {
        ctx.fillStyle='#fc0'; ctx.font='bold 20px monospace';
        ctx.fillText('PRESS SPACE TO START', canvas.width/2, 420);
    }
    ctx.textAlign='left';
}

function drawReady() {
    // 半透明オーバーレイ
    ctx.fillStyle='rgba(0,0,0,0.5)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center';
    const stg = getStageIdx() + 1;
    const lvlInStage = (currentLevelIdx % 4) + 1;
    const lvl = LEVELS[currentLevelIdx];
    const isBoss = !!lvl.boss;

    // ステージ表示
    ctx.fillStyle='#fc0'; ctx.font='bold 28px monospace';
    ctx.fillText(`STAGE ${stg} - ${isBoss ? 'BOSS' : lvlInStage + '/3'}`, canvas.width/2, 180);

    pxRect(canvas.width/2-160, 190, 320, 4, '#a80');

    ctx.fillStyle='#fff'; ctx.font='bold 22px monospace';
    ctx.fillText(lvl.name, canvas.width/2, 230);

    // 残機表示
    ctx.fillStyle='#aaa'; ctx.font='16px monospace';
    let lifeStr = '';
    for (let i=0;i<lives;i++) lifeStr+='♥ ';
    ctx.fillText(`残機: ${lifeStr}`, canvas.width/2, 280);

    // カウントダウン
    const sec = Math.ceil(readyTimer / 60);
    if (Math.floor(readyTimer/15)%2) {
        ctx.fillStyle='#fff'; ctx.font='bold 40px monospace';
        ctx.fillText(sec > 0 ? `${sec}` : 'GO!', canvas.width/2, 360);
    }

    ctx.fillStyle='#666'; ctx.font='12px monospace';
    ctx.fillText('SPACE でスキップ', canvas.width/2, 420);
    ctx.textAlign='left';
}

function drawGameOver() {
    ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center';
    ctx.fillStyle='#f00'; ctx.font='bold 56px monospace';
    ctx.fillText('YOU DIED', canvas.width/2, 200);
    pxRect(canvas.width/2-160, 210, 320, 4, '#800');
    ctx.fillStyle='#aaa'; ctx.font='20px monospace';
    ctx.fillText(`SCORE ${score}`, canvas.width/2, 260);
    ctx.fillStyle='#fc0'; ctx.font='bold 14px monospace';
    ctx.fillText(`所持金: ${gold}G   素材: ${materials}`, canvas.width/2, 290);
    ctx.fillStyle='#666'; ctx.font='14px monospace';
    ctx.fillText(`${WEAPONS[player.weapon].name} | 弾×${player.upgrades.multiShot} 速射×${player.upgrades.fireRate.toFixed(1)}`, canvas.width/2, 320);
    if (Math.floor(Date.now()/500)%2) {
        ctx.fillStyle='#fc0'; ctx.font='bold 18px monospace';
        ctx.fillText('PRESS SPACE - 拠点へ戻る', canvas.width/2, 380);
    }
    ctx.textAlign='left';
}

// ============================================================
//  報酬選択（ローグライク）
// ============================================================
function enterRewardScreen() {
    state = S.REWARD;
    rewardSelected = 0;
    // レアリティ付きで3つの異なるアイテムを選出
    rewardChoices = [];
    const usedTypes = new Set();
    for (let i = 0; i < 3; i++) {
        let rolled;
        let tries = 0;
        do {
            rolled = rollItemWithRarity();
            tries++;
        } while (usedTypes.has(rolled.type) && tries < 30);
        usedTypes.add(rolled.type);
        rewardChoices.push(rolled);
    }
}

function applyReward() {
    const choice = rewardChoices[rewardSelected];
    if (!choice) return;
    const t = choice.type || choice;
    const r = choice.rarity || 2;
    applyItemEffect(t, r);
    const def = ITEM_DEFS[t];
    const rd = RARITY_DEFS[r];
    showPickupText(`${rd.label} ${def.label}`, rd.color);
    // 次のレベルへ進む（ゲームオーバーまで継続）
    loadLevel(currentLevelIdx);
}

function drawReward() {
    // 半透明オーバーレイ
    ctx.fillStyle='rgba(0,0,0,0.82)';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.textAlign='center';

    // タイトル
    ctx.fillStyle='#fc0'; ctx.font='bold 26px monospace';
    ctx.fillText('LEVEL CLEAR!', canvas.width/2, 45);
    pxRect(canvas.width/2-130, 53, 260, 3, '#a80');

    ctx.fillStyle='#aaa'; ctx.font='14px monospace';
    ctx.fillText('報酬を1つ選べ（←→で選択、SPACEで決定）', canvas.width/2, 95);

    // 3つの選択肢を描画
    const numChoices = rewardChoices.length;
    const cardW = 170, cardH = 310, gap = 24;
    const totalW = cardW * numChoices + gap * (numChoices - 1);
    const startX = (canvas.width - totalW) / 2;
    const cardY = 110;

    for (let i = 0; i < numChoices; i++) {
        const rc = rewardChoices[i];
        if (!rc) continue;
        const key = rc.type || rc;
        const rarity = rc.rarity || 1;
        const def = ITEM_DEFS[key];
        if (!def) continue;
        const cx = startX + i * (cardW + gap);
        const selected = (i === rewardSelected);

        const rarityDef = RARITY_DEFS[rarity];
        const borderColor = selected ? rarityDef.color : '#444';
        const bgColor = selected ? '#1a1a1e' : '#0e0e12';

        // カード背景
        pxRect(cx, cardY, cardW, cardH, bgColor);
        // カード枠
        pxRect(cx, cardY, cardW, 3, borderColor);
        pxRect(cx, cardY+cardH-3, cardW, 3, borderColor);
        pxRect(cx, cardY, 3, cardH, borderColor);
        pxRect(cx+cardW-3, cardY, 3, cardH, borderColor);

        // 選択カーソル
        if (selected) {
            pxRect(cx+3, cardY+3, cardW-6, cardH-6, 'rgba(255,255,255,0.04)');
            px(cx+6, cardY+6, 2, 2, rarityDef.color);
            px(cx+cardW-10, cardY+6, 2, 2, rarityDef.color);
            px(cx+6, cardY+cardH-10, 2, 2, rarityDef.color);
            px(cx+cardW-10, cardY+cardH-10, 2, 2, rarityDef.color);
        }

        // レアリティラベル
        ctx.fillStyle = rarityDef.color; ctx.font = 'bold 11px monospace';
        ctx.fillText(rarityDef.label, cx + cardW/2, cardY + 22);

        // アイコン
        const iconX = cx + cardW/2;
        const iconY = cardY + 60;
        pxRect(iconX-20, iconY-20, 40, 40, '#000');
        pxRect(iconX-18, iconY-18, 36, 36, selected ? '#1a1a2e' : '#0a0a1e');
        drawItemIcon(def.icon, iconX, iconY, def.color);

        // アイテム名
        ctx.fillStyle = def.color; ctx.font = 'bold 14px monospace';
        ctx.fillText(def.label, cx + cardW/2, cardY + 100);

        // 説明テキスト
        ctx.fillStyle = '#999'; ctx.font = '11px monospace';
        const desc = getItemDescription(key, rarity);
        const lines = desc.split('\n');
        for (let l = 0; l < lines.length; l++) {
            ctx.fillText(lines[l], cx + cardW/2, cardY + 122 + l * 15);
        }
    }

    // 下部の操作説明
    ctx.fillStyle='#555'; ctx.font='12px monospace';
    ctx.fillText('A/← →/D : 選択  SPACE/Enter : 決定', canvas.width/2, canvas.height - 20);
    ctx.textAlign='left';
}

function getItemDescription(key, rarity) {
    const m = RARITY_DEFS[rarity || 2].mult;
    switch(key) {
        case 'MULTISHOT':      return `弾の発射数+${Math.max(1,Math.round(1*m))}`;
        case 'FIRERATE':       return `攻撃速度×${(1+0.15*m).toFixed(2)}`;
        case 'BULLETSIZE':     return `弾のサイズ×${(1+0.2*m).toFixed(2)}`;
        case 'SPEED_UP':       return `移動速度×${(1+0.12*m).toFixed(2)}`;
        case 'JUMP_UP':        return `ジャンプ力×${(1+0.1*m).toFixed(2)}`;
        case 'HEAL':           return `HP ${Math.round(15*m)}回復`;
        case 'MAXHP_UP':       { const v=Math.round(10*m); return `最大HP +${v}\nHP ${v}回復`; }
        case 'WEAPON_SHOTGUN': return '近距離散弾\n高火力×6発';
        case 'WEAPON_SMG':     return '高速連射\n弾幕で制圧';
        case 'WEAPON_SNIPER':  return '貫通高威力\n一撃必殺';
        case 'WEAPON_PLASMA':  return '反射＆爆発\n範囲ダメージ';
        case 'WEAPON_SWORD':   return '近接斬撃\n広範囲・貫通';
        case 'EXTRA_JUMP':     return '空中ジャンプ+1\n多段ジャンプ可能';
        case 'WEAPON_LASER':   return '貫通レーザー\n超高速連射';
        case 'MAGNET':         return 'アイテム自動吸引\n拾い漏れなし';
        case 'SHIELD':         return 'バリア展開\nHP50のシールド';
        case 'LIFE_STEAL':     return '攻撃でHP吸収\nダメージの10%回復';
        default:               return '';
    }
}

function drawClear() {
    ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // 星の演出
    for (let i=0;i<40;i++) {
        const tx=(i*97+30)%canvas.width, ty=(i*67+20)%canvas.height;
        if (Math.floor((Date.now()/200+i)%3)<2) px(tx, ty, 1, 1, '#ff0');
    }
    ctx.textAlign='center';
    ctx.fillStyle='#fc0'; ctx.font='bold 52px monospace';
    ctx.fillText('ALL CLEAR!', canvas.width/2, 190);
    pxRect(canvas.width/2-180, 200, 360, 4, '#a80');
    ctx.fillStyle='#fff'; ctx.font='22px monospace';
    ctx.fillText(`SCORE ${score}`, canvas.width/2, 260);
    ctx.fillStyle='#6a6'; ctx.font='16px monospace';
    ctx.fillText('深淵より生還せり...', canvas.width/2, 310);
    if (Math.floor(Date.now()/500)%2) {
        ctx.fillStyle='#fc0'; ctx.font='bold 18px monospace';
        ctx.fillText('PRESS SPACE - 拠点へ戻る', canvas.width/2, 390);
    }
    ctx.textAlign='left';
}

// ============================================================
//  拠点（村マップ）システム
// ============================================================
let hubSelectedLevel = 0;
let villageMap = [];
const VILLAGE_W = 40; // 村の幅(タイル)
const VILLAGE_H = ROWS;
// NPC定義
const NPCS = [
    { id:'blacksmith', name:'鍛冶屋', x:7*TILE, y:0, w:30, h:40,
      color:'#c64', bodyColor:'#842', upgrades:['attack','fireRate','bulletSize','multiShot'],
      greeting:'武器を鍛えてやろう。', icon:'⚒' },
    { id:'trainer', name:'訓練士', x:17*TILE, y:0, w:30, h:40,
      color:'#4a8', bodyColor:'#264', upgrades:['maxHp','moveSpeed','jumpPower','extraLife'],
      greeting:'体を鍛えるか？', icon:'💪' },
    { id:'mage', name:'魔術師', x:27*TILE, y:0, w:30, h:40,
      color:'#84c', bodyColor:'#428', upgrades:['shield'],
      greeting:'防御魔法をかけてやろう...', icon:'✦' },
];
// 村の出口ゲート位置
const GATE_X = (VILLAGE_W - 4) * TILE;
// 会話UI状態
let talkingTo = null;     // 現在会話中のNPC
let shopCursor = 0;
let shopScroll = 0;

function setupVillageMap() {
    // 村マップ生成 — 地面のみ、壁なし（建物は描画のみ）
    villageMap = blank(VILLAGE_W, VILLAGE_H);
    // 地面（石畳風: 全面フラット）
    fillRow(villageMap, ROWS-1, 0, VILLAGE_W, 1);
    fillRow(villageMap, ROWS-2, 0, VILLAGE_W, 1);

    // NPCのY座標を地面に合わせる
    for (const npc of NPCS) {
        npc.y = (ROWS-2)*TILE - npc.h;
    }

    // プレイヤー初期位置（しっかりリセット）
    player.x = 2*TILE; player.y = (ROWS-3)*TILE;
    player.vx = 0; player.vy = 0; player.onGround = false;
    player.invincible = 0;
    player.hp = player.maxHp || 100;
    player.stomping = false;
    player._jumpHeld = false;
    player.facing = 1;
    cameraX = 0;
    levelMap = villageMap;
    talkingTo = null;
    shopCursor = 0;
    shopScroll = 0;
}

function handleHubKey(e) {
    if (talkingTo) {
        // ショップUI操作
        const items = talkingTo.upgrades;
        if (e.code === 'Escape' || e.code === 'KeyQ') {
            talkingTo = null; return;
        }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') shopCursor = Math.max(0, shopCursor-1);
        if (e.code === 'ArrowDown' || e.code === 'KeyS') shopCursor = Math.min(items.length-1, shopCursor+1);
        if (e.code === 'Space' || e.code === 'Enter') {
            purchaseUpgrade(items[shopCursor]);
        }
        return;
    }
    // 村でのW/Space: ジャンプは通常処理（keys経由）
    // E/Enter: NPC会話 or ゲート出撃
    if (e.code === 'KeyE' || e.code === 'Enter') {
        // NPC近くにいるか判定
        for (const npc of NPCS) {
            const dx = Math.abs((player.x+player.w/2) - (npc.x+npc.w/2));
            const dy = Math.abs((player.y+player.h/2) - (npc.y+npc.h/2));
            if (dx < 50 && dy < 50) {
                talkingTo = npc;
                shopCursor = 0;
                shopScroll = 0;
                return;
            }
        }
        // ゲート付近か判定
        if (player.x > GATE_X - 80) {
            const safeLevel = Math.min(hubSelectedLevel, Math.min(highestLevelCleared + 1, LEVELS.length - 1));
            startStage(Math.max(0, safeLevel));
        }
    }
    // ゲート付近でShift+左右でステージ選択
    if (player.x > GATE_X - 80) {
        if (e.code === 'ArrowUp' || e.code === 'PageUp') {
            hubSelectedLevel = Math.min(Math.min(highestLevelCleared + 1, LEVELS.length - 1), hubSelectedLevel + 1);
        }
        if (e.code === 'ArrowDown' || e.code === 'PageDown') {
            hubSelectedLevel = Math.max(0, hubSelectedLevel - 1);
        }
    }
}

function handleHubClick() {
    if (talkingTo) {
        // ショップアイテムクリック
        const items = talkingTo.upgrades;
        const panelX = canvas.width/2 - 180, panelY = 120;
        const rowH = 50;
        const clickRow = Math.floor((mouse.y - panelY) / rowH);
        if (clickRow >= 0 && clickRow < items.length) {
            shopCursor = clickRow;
            purchaseUpgrade(items[clickRow]);
        }
        // 閉じるボタン
        if (mouse.y > canvas.height - 40) talkingTo = null;
        return;
    }
}

function purchaseUpgrade(key) {
    const u = HUB_UPGRADES[key];
    if (u.level >= u.max) { hubMessage='最大レベルに到達'; hubMessageTimer=90; return; }
    const gCost = getUpgradeCost(key);
    const mCost = getMaterialCost(key);
    if (gold < gCost || materials < mCost) { hubMessage=`費用不足 (${gCost}G ${mCost}素材)`; hubMessageTimer=90; return; }
    gold -= gCost;
    materials -= mCost;
    u.level++;
    hubMessage=`${u.label} Lv${u.level}に強化!`; hubMessageTimer=90;
    sfxItemPickup();
}

function updateHub() {
    // 村でのプレイヤー移動（通常のプレイヤー操作を流用）
    const moveSpd = BASE_MOVE_SPEED * 1.0;
    if (!talkingTo) {
        if (keys['KeyA']||keys['ArrowLeft'])  player.vx -= moveSpd;
        if (keys['KeyD']||keys['ArrowRight']) player.vx += moveSpd;
        const jumpPressed = keys['KeyW']||keys['ArrowUp']||keys['Space'];
        if (jumpPressed && !player._jumpHeld && player.onGround) {
            player.vy = BASE_JUMP_FORCE;
            sfxJump();
        }
        player._jumpHeld = jumpPressed;
    }
    player.vy += GRAVITY;
    player.vx *= FRICTION;
    player.vx = Math.max(-4, Math.min(4, player.vx));
    player.vy = Math.max(-10, Math.min(7, player.vy));
    // X移動
    player.x += player.vx;
    for (const t of getTilesAround(player.x, player.y, player.w, player.h)) {
        if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, t)) {
            if (player.vx>0) player.x=t.x-player.w; else player.x=t.x+t.w;
            player.vx=0;
        }
    }
    // Y移動
    player.y += player.vy;
    player.onGround = false;
    for (const t of getTilesAround(player.x, player.y, player.w, player.h)) {
        if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, t)) {
            if (player.vy>0) { player.y=t.y-player.h; player.vy=0; player.onGround=true; }
            else { player.y=t.y+t.h; player.vy=0; }
        }
    }
    // マップ内に制限
    player.x = Math.max(0, Math.min((VILLAGE_W-1)*TILE - player.w, player.x));
    if (player.y > canvas.height) { player.y = (ROWS-4)*TILE; player.vy = 0; }
    // 歩行アニメ
    if (Math.abs(player.vx) > 0.5) player.animTimer += 0.1;
    player.facing = player.vx > 0.1 ? 1 : player.vx < -0.1 ? -1 : player.facing;
    // カメラ
    const target = player.x - canvas.width/3;
    const maxCam = VILLAGE_W * TILE - canvas.width;
    cameraX += (target - cameraX)*0.1;
    cameraX = Math.max(0, Math.min(maxCam, cameraX));
}

function drawHub() {
    const groundY = (ROWS-2)*TILE;
    // 空のグラデーション
    ctx.fillStyle='#0c0818'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // 遠景の山
    for (let i=0;i<6;i++) {
        const mx = i*200 - Math.round(cameraX*0.1)%200 - 100;
        const mh = 60 + (i%3)*30;
        ctx.fillStyle='#161228';
        ctx.beginPath();
        ctx.moveTo(mx, groundY-60); ctx.lineTo(mx+100, groundY-60-mh); ctx.lineTo(mx+200, groundY-60);
        ctx.fill();
    }
    // 星
    for (let i=0;i<25;i++) {
        const bx = ((i*137+50)%(canvas.width+200))-100 - Math.round(cameraX*0.03)%200;
        const by = (i*67+10)%(groundY-80);
        const blink = Math.floor((Date.now()/500+i*7)%3);
        if (blink<2) px(bx, by, 1, 1, blink===0?'#668':'#446');
    }
    // 背景の木（装飾、遠景）
    for (const tx of [1,12,22,32,38]) {
        const sx = Math.round(tx*TILE - cameraX*0.8);
        if (sx < -60 || sx > canvas.width+60) continue;
        // 幹
        pxRect(sx+14, groundY-70, 8, 30, '#432');
        pxRect(sx+16, groundY-70, 4, 30, '#543');
        // 葉
        pxRect(sx+2, groundY-100, 32, 20, '#243');
        pxRect(sx+6, groundY-115, 24, 18, '#253');
        pxRect(sx+10, groundY-125, 16, 14, '#264');
    }

    // === 建物描画（装飾のみ、衝突なし） ===
    _drawBuilding(5*TILE, groundY, 6, '鍛冶屋', '#f84', '#643', '#432', true);
    _drawBuilding(15*TILE, groundY, 6, '訓練場', '#4f8', '#354', '#243', false);
    _drawBuilding(25*TILE, groundY, 6, '魔術師の塔', '#c8f', '#436', '#324', false, true);

    // === 地面描画（石畳風） ===
    const s0=Math.floor(cameraX/TILE), s1=s0+COLS+2;
    for (let r=ROWS-2;r<ROWS;r++) {
        for (let c=s0;c<=s1&&c<VILLAGE_W;c++) {
            if (c<0) continue;
            const sx=Math.round(c*TILE-cameraX), sy=r*TILE;
            // 石畳
            pxRect(sx, sy, TILE, TILE, '#3a3530');
            pxRect(sx, sy, TILE, 2, '#4a4540');
            pxRect(sx, sy+TILE-1, TILE, 1, '#2a2520');
            // 石の模様
            const off = (r%2)*(TILE/2);
            pxRect(sx+((TILE/2+off)%TILE), sy, 1, TILE, '#2a2520');
            // 草
            if (r===ROWS-2) {
                pxRect(sx, sy, TILE, 3, '#3a4a30');
                if (c%3===0) { px(sx+4, sy-4, 2, 4, '#4a6a30'); px(sx+8, sy-6, 2, 6, '#3a5a28'); }
                if (c%5===2) px(sx+16, sy-3, 2, 3, '#4a6a30');
            }
        }
    }

    // === 道の装飾 ===
    // 灯り（ランタン）
    for (const lx of [3.5, 11.5, 21, 33]) {
        const sx = Math.round(lx*TILE - cameraX);
        if (sx < -20 || sx > canvas.width+20) continue;
        // ポール
        pxRect(sx, groundY-60, 4, 60, '#554');
        // ランタン
        const glow = Math.sin(Date.now()*0.003 + lx)*0.3 + 0.7;
        ctx.globalAlpha = glow;
        pxRect(sx-4, groundY-68, 12, 10, '#442');
        pxRect(sx-2, groundY-66, 8, 6, '#fa4');
        px(sx, groundY-64, 4, 2, '#ff8');
        ctx.globalAlpha = 1;
        // 光の円
        ctx.globalAlpha = glow * 0.08;
        ctx.fillStyle='#fa8';
        ctx.beginPath(); ctx.arc(sx+2, groundY-60, 40, 0, Math.PI*2); ctx.fill();
        ctx.globalAlpha = 1;
    }

    // NPC描画
    for (const npc of NPCS) {
        const sx = Math.round(npc.x - cameraX);
        const sy = Math.round(npc.y);
        if (sx < -40 || sx > canvas.width+40) continue;
        const bob = Math.round(Math.sin(Date.now()*0.002 + npc.x)*2);
        const y = sy + bob;
        // 影
        ctx.globalAlpha = 0.3;
        pxRect(sx+2, sy+npc.h-2, 26, 4, '#000');
        ctx.globalAlpha = 1;
        // 体
        pxRect(sx+4, y, 22, 12, npc.color); // 頭
        pxRect(sx+2, y+12, 26, 20, npc.bodyColor); // 胴体
        pxRect(sx+6, y+32, 8, 8, npc.bodyColor); // 左脚
        pxRect(sx+16, y+32, 8, 8, npc.bodyColor); // 右脚
        // 目
        px(sx+8, y+4, 3, 3, '#fff');
        px(sx+18, y+4, 3, 3, '#fff');
        // 名前
        ctx.fillStyle=npc.color; ctx.font='bold 11px monospace'; ctx.textAlign='center';
        ctx.fillText(npc.name, sx+15, sy-8+bob);
        ctx.textAlign='left';
        // 近くにいるとき「E」表示
        const dx = Math.abs((player.x+player.w/2)-(npc.x+npc.w/2));
        const dy = Math.abs((player.y+player.h/2)-(npc.y+npc.h/2));
        if (dx < 60 && dy < 60) {
            const blink = Math.floor(Date.now()/400)%2;
            if (blink) {
                pxRect(sx-8, sy-28+bob, 50, 16, 'rgba(0,0,0,0.7)');
                ctx.fillStyle='#fc0'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
                ctx.fillText('[E] 話す', sx+15, sy-16+bob);
                ctx.textAlign='left';
            }
        }
    }

    // === 出口ゲート描画（装飾、衝突なし） ===
    const gsx = Math.round(GATE_X - cameraX);
    // 門柱（装飾）
    pxRect(gsx, groundY-120, 10, 120, '#654');
    pxRect(gsx+2, groundY-120, 6, 120, '#765');
    pxRect(gsx+3*TILE, groundY-120, 10, 120, '#654');
    pxRect(gsx+3*TILE+2, groundY-120, 6, 120, '#765');
    // 門のアーチ
    pxRect(gsx, groundY-124, 3*TILE+10, 8, '#876');
    pxRect(gsx+4, groundY-120, 3*TILE+2, 4, '#765');
    // 矢印装飾
    pxRect(gsx+TILE, groundY-80, TILE, 4, '#a64');
    pxRect(gsx+TILE+TILE-4, groundY-88, 4, 20, '#a64');
    // テキスト
    ctx.fillStyle='#f64'; ctx.font='bold 14px monospace'; ctx.textAlign='center';
    ctx.fillText('▶ 出撃', gsx+1.5*TILE+5, groundY-96);
    // ステージ表示
    const nextLevel = Math.min(hubSelectedLevel, Math.min(highestLevelCleared + 1, LEVELS.length - 1));
    const stg = Math.floor(nextLevel / 4) + 1;
    const lvlInStg = (nextLevel % 4) + 1;
    const isBoss = !!LEVELS[nextLevel].boss;
    ctx.fillStyle='#fa8'; ctx.font='bold 12px monospace';
    ctx.fillText(`Stage${stg}-${isBoss?'BOSS':lvlInStg} ${LEVELS[nextLevel].name}`, gsx+1.5*TILE+5, groundY-76);
    ctx.textAlign='left';
    // 近くにいると案内
    if (player.x > GATE_X - 80) {
        const blink = Math.floor(Date.now()/400)%2;
        if (blink) {
            pxRect(gsx-20, groundY-50, 3*TILE+50, 18, 'rgba(0,0,0,0.7)');
            ctx.fillStyle='#fc0'; ctx.font='bold 11px monospace'; ctx.textAlign='center';
            ctx.fillText('[E] 出撃  [↑↓] ステージ選択', gsx+1.5*TILE+5, groundY-36);
            ctx.textAlign='left';
        }
    }

    // プレイヤー描画
    drawPlayer();

    // HUD
    pxRect(4,4,280,28, 'rgba(0,0,0,0.7)');
    pxRect(4,4,280,2, '#a8f');
    ctx.fillStyle='#fc0'; ctx.font='bold 14px monospace';
    ctx.fillText(`${gold}G`, 12, 22);
    ctx.fillStyle='#8cf';
    ctx.fillText(`素材 ${materials}`, 100, 22);
    const cleared = highestLevelCleared >= 0 ? `Stage${Math.floor(highestLevelCleared/4)+1}-${(highestLevelCleared%4)+1}済` : '';
    ctx.fillStyle='#8a8'; ctx.font='11px monospace';
    ctx.fillText(cleared, 200, 22);

    // 操作ヒント
    pxRect(canvas.width/2-200, canvas.height-24, 400, 20, 'rgba(0,0,0,0.7)');
    ctx.fillStyle='#667'; ctx.font='10px monospace'; ctx.textAlign='center';
    ctx.fillText('AD/←→:移動  W/↑/Space:ジャンプ  E/Enter:話す/出撃  F1:デバッグ', canvas.width/2, canvas.height-9);
    ctx.textAlign='left';

    // ショップUI
    if (talkingTo) drawShopUI();

    // メッセージ
    if (hubMessageTimer > 0) {
        hubMessageTimer--;
        ctx.textAlign='center';
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px monospace';
        ctx.globalAlpha = Math.min(1, hubMessageTimer / 30);
        ctx.fillText(hubMessage, canvas.width/2, canvas.height - 50);
        ctx.globalAlpha = 1;
        ctx.textAlign='left';
    }
}

// 建物描画ヘルパー（装飾のみ）
function _drawBuilding(bx, groundY, widthTiles, label, labelColor, wallColor, roofColor, hasChimney, isTall) {
    const sx = Math.round(bx - cameraX);
    if (sx < -widthTiles*TILE-40 || sx > canvas.width+40) return;
    const bw = widthTiles * TILE;
    const bh = isTall ? 140 : 100;
    const by = groundY - bh;
    // 壁（背景描画のみ）
    pxRect(sx, by+16, bw, bh-16, wallColor);
    pxRect(sx+2, by+18, bw-4, bh-20, wallColor);
    // 窓
    const winColor = '#442';
    const winGlow = '#664';
    pxRect(sx+8, by+40, 16, 16, winColor);
    pxRect(sx+10, by+42, 12, 12, winGlow);
    px(sx+12, by+44, 4, 4, '#886');
    if (bw > 160) {
        pxRect(sx+bw-24, by+40, 16, 16, winColor);
        pxRect(sx+bw-22, by+42, 12, 12, winGlow);
    }
    // ドア
    const doorX = sx + bw/2 - 12;
    pxRect(doorX, groundY-48, 24, 48, '#321');
    pxRect(doorX+2, groundY-46, 20, 44, '#432');
    pxRect(doorX+16, groundY-28, 4, 4, '#876'); // ドアノブ
    // 屋根（三角）
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(sx-8, by+16);
    ctx.lineTo(sx+bw/2, by-20);
    ctx.lineTo(sx+bw+8, by+16);
    ctx.fill();
    // 屋根ハイライト
    ctx.fillStyle = labelColor + '44';
    ctx.beginPath();
    ctx.moveTo(sx+bw/2, by-20);
    ctx.lineTo(sx+bw/2-4, by+10);
    ctx.lineTo(sx+bw/2+4, by+10);
    ctx.fill();
    // 煙突
    if (hasChimney) {
        pxRect(sx+bw-30, by-30, 12, 30, '#543');
        // 煙
        const st = Date.now()*0.002;
        for (let i=0;i<3;i++) {
            ctx.globalAlpha = 0.3 - i*0.08;
            const smokeY = by-35-i*14-Math.sin(st+i)*4;
            const smokeX = sx+bw-26+Math.sin(st*0.7+i*2)*4;
            pxRect(Math.round(smokeX), Math.round(smokeY), 6+i*2, 6+i*2, '#888');
        }
        ctx.globalAlpha = 1;
    }
    // 看板
    pxRect(sx+bw/2-30, by-8, 60, 16, 'rgba(0,0,0,0.7)');
    pxRect(sx+bw/2-30, by-8, 60, 2, labelColor);
    ctx.fillStyle=labelColor; ctx.font='bold 11px monospace'; ctx.textAlign='center';
    ctx.fillText(label, sx+bw/2, by+5);
    ctx.textAlign='left';
}

function drawShopUI() {
    const npc = talkingTo;
    if (!npc) return;
    // 半透明背景
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.fillRect(0,0,canvas.width,canvas.height);
    // パネル
    const panelX = canvas.width/2-200, panelY = 50, panelW = 400, panelH = 420;
    pxRect(panelX, panelY, panelW, panelH, '#111');
    pxRect(panelX, panelY, panelW, 3, npc.color);
    pxRect(panelX, panelY+panelH-3, panelW, 3, npc.color);
    pxRect(panelX, panelY, 3, panelH, npc.color);
    pxRect(panelX+panelW-3, panelY, 3, panelH, npc.color);
    // NPC名＆挨拶
    ctx.textAlign='center';
    ctx.fillStyle=npc.color; ctx.font='bold 18px monospace';
    ctx.fillText(`${npc.icon} ${npc.name}`, canvas.width/2, panelY+28);
    ctx.fillStyle='#aaa'; ctx.font='12px monospace';
    ctx.fillText(npc.greeting, canvas.width/2, panelY+48);
    // 所持金
    ctx.fillStyle='#fc0'; ctx.font='bold 12px monospace';
    ctx.fillText(`所持金: ${gold}G  素材: ${materials}`, canvas.width/2, panelY+68);
    pxRect(panelX+10, panelY+75, panelW-20, 2, '#333');
    // アップグレードリスト
    const items = npc.upgrades;
    const listY = panelY + 90;
    const rowH = 50;
    ctx.textAlign='left';
    for (let i = 0; i < items.length; i++) {
        const key = items[i];
        const u = HUB_UPGRADES[key];
        const y = listY + i * rowH;
        const isSel = (i === shopCursor);
        const gCost = getUpgradeCost(key);
        const mCost = getMaterialCost(key);
        const maxed = u.level >= u.max;
        if (isSel) {
            pxRect(panelX+8, y-2, panelW-16, rowH-4, '#1a1a2e');
            pxRect(panelX+8, y-2, 3, rowH-4, u.color);
        }
        // アイコン＋名前
        ctx.fillStyle=u.color; ctx.font='bold 14px monospace';
        ctx.fillText(`${u.icon} ${u.label}`, panelX+20, y+16);
        // レベル
        ctx.fillStyle='#ccc'; ctx.font='12px monospace';
        ctx.fillText(`Lv${u.level}/${u.max}`, panelX+150, y+16);
        // レベルバー
        const barW = 70;
        pxRect(panelX+210, y+8, barW, 8, '#222');
        pxRect(panelX+210, y+8, Math.round(barW * u.level / u.max), 8, u.color);
        // コスト
        if (maxed) {
            ctx.fillStyle='#4a4'; ctx.font='bold 12px monospace';
            ctx.fillText('MAX', panelX+295, y+16);
        } else {
            const canBuy = gold >= gCost && materials >= mCost;
            ctx.fillStyle = canBuy ? '#fc0' : '#644'; ctx.font='11px monospace';
            ctx.fillText(`${gCost}G ${mCost}素材`, panelX+290, y+16);
        }
        // 効果
        ctx.fillStyle='#888'; ctx.font='10px monospace';
        ctx.fillText(u.desc, panelX+20, y+34);
    }
    // 閉じるヒント
    ctx.textAlign='center';
    ctx.fillStyle='#666'; ctx.font='11px monospace';
    ctx.fillText('↑↓: 選択  SPACE/Enter: 購入  ESC/Q: 閉じる', canvas.width/2, panelY+panelH-12);
    ctx.textAlign='left';
}

// ============================================================
//  デバッグメニュー
// ============================================================
let debugMenuCursor = 0;
let debugMenuScroll = 0;
let debugMenuItems = [];
let debugPrevState = null;

function buildDebugItemList() {
    debugMenuItems = [];
    const allKeys = Object.keys(ITEM_DEFS);
    for (const key of allKeys) {
        for (let r = 1; r <= 4; r++) {
            const def = ITEM_DEFS[key];
            const minR = def.minRarity || 1;
            const maxR = def.maxRarity || 4;
            if (r >= minR && r <= maxR) {
                debugMenuItems.push({ type: key, rarity: r });
            }
        }
    }
}

function openDebugMenu() {
    buildDebugItemList();
    debugPrevState = state;
    state = S.DEBUG_MENU;
    debugMenuCursor = 0;
    debugMenuScroll = 0;
}

function handleDebugMenuKey(e) {
    const maxVisible = 14;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        debugMenuCursor = Math.max(0, debugMenuCursor - 1);
        if (debugMenuCursor < debugMenuScroll) debugMenuScroll = debugMenuCursor;
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        debugMenuCursor = Math.min(debugMenuItems.length - 1, debugMenuCursor + 1);
        if (debugMenuCursor >= debugMenuScroll + maxVisible) debugMenuScroll = debugMenuCursor - maxVisible + 1;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
        const item = debugMenuItems[debugMenuCursor];
        applyItemEffect(item.type, item.rarity);
        const def = ITEM_DEFS[item.type];
        const rd = RARITY_DEFS[item.rarity];
        showPickupText(`${rd.label} ${def.label}`, rd.color);
    }
    if (e.code === 'Escape' || e.code === 'F1') {
        state = debugPrevState || S.PLAY;
    }
}

function handleDebugMenuClick() {
    const listX = canvas.width/2 - 200, listY = 80;
    const rowH = 28;
    const maxVisible = 14;
    const clickRow = Math.floor((mouse.y - listY) / rowH);
    if (clickRow >= 0 && clickRow < maxVisible) {
        const idx = debugMenuScroll + clickRow;
        if (idx < debugMenuItems.length) {
            debugMenuCursor = idx;
            const item = debugMenuItems[idx];
            applyItemEffect(item.type, item.rarity);
            const def = ITEM_DEFS[item.type];
            const rd = RARITY_DEFS[item.rarity];
            showPickupText(`${rd.label} ${def.label}`, rd.color);
        }
    }
}

// ============================================================
//  マップエディタ
// ============================================================
const MAP_EDITOR_TILES = [
    { id:0, label:'空気', color:'#333' },
    { id:1, label:'地面', color:'#664' },
    { id:2, label:'壁',   color:'#558' },
    { id:3, label:'スパイク', color:'#f0a' },
    { id:5, label:'ゴール', color:'#ff0' },
];
const MAP_EDITOR_ENEMIES = [
    { type:'zombie',  label:'ゾンビ',   color:'#4a0e0e' },
    { type:'shade',   label:'シェード', color:'#40c' },
    { type:'demon',   label:'デーモン', color:'#880000' },
    { type:'spawner', label:'スポーナー', color:'#cc00aa' },
    { type:'boss1',   label:'骸骨王',   color:'#660' },
    { type:'boss2',   label:'氷龍',     color:'#069' },
    { type:'boss3',   label:'魔王',     color:'#600' },
];
let mapEditorActive = false;
let mapEditorPrevState = null;
let mapEditorBrush = 1; // 現在選択中のタイルID
let mapEditorMode = 'tile'; // 'tile' or 'enemy' or 'erase_enemy'
let mapEditorEnemyType = 'zombie';
let mapEditorPaletteCursor = 0;
let mapEditorLevelIdx = 0;
let mapEditorCustomEnemies = []; // エディタで配置した敵
let mapEditorScroll = 0; // パレットスクロール
let mapEditorSavedMaps = {}; // levelIdx -> { map, enemies }

function openMapEditor() {
    mapEditorPrevState = state;
    mapEditorActive = true;
    state = S.PLAY; // PLAYモードのマップを編集
    mapEditorLevelIdx = currentLevelIdx;
    // 現在の敵をリスト化
    mapEditorCustomEnemies = enemies.filter(e=>e.alive).map(e => ({
        type: (e instanceof Boss) ? `boss${e.bossType}` :
              (e instanceof Spawner) ? 'spawner' :
              (e instanceof Demon) ? 'demon' :
              (e instanceof Shade) ? 'shade' : 'zombie',
        x: e.x, y: e.y
    }));
}

function closeMapEditor() {
    mapEditorActive = false;
    if (mapEditorPrevState) state = mapEditorPrevState;
}

function mapEditorHandleKey(e) {
    // パレット切り替え
    if (e.code === 'Digit1') { mapEditorMode = 'tile'; mapEditorBrush = 0; }
    if (e.code === 'Digit2') { mapEditorMode = 'tile'; mapEditorBrush = 1; }
    if (e.code === 'Digit3') { mapEditorMode = 'tile'; mapEditorBrush = 2; }
    if (e.code === 'Digit4') { mapEditorMode = 'tile'; mapEditorBrush = 3; }
    if (e.code === 'Digit5') { mapEditorMode = 'tile'; mapEditorBrush = 5; }
    if (e.code === 'Digit6') { mapEditorMode = 'enemy'; }
    if (e.code === 'Digit7') { mapEditorMode = 'erase_enemy'; }
    // 敵タイプ選択（敵モード時）
    if (mapEditorMode === 'enemy') {
        if (e.code === 'BracketLeft') {
            const idx = MAP_EDITOR_ENEMIES.findIndex(e2=>e2.type===mapEditorEnemyType);
            mapEditorEnemyType = MAP_EDITOR_ENEMIES[(idx-1+MAP_EDITOR_ENEMIES.length)%MAP_EDITOR_ENEMIES.length].type;
        }
        if (e.code === 'BracketRight') {
            const idx = MAP_EDITOR_ENEMIES.findIndex(e2=>e2.type===mapEditorEnemyType);
            mapEditorEnemyType = MAP_EDITOR_ENEMIES[(idx+1)%MAP_EDITOR_ENEMIES.length].type;
        }
    }
    // 保存（Ctrl+S）
    if (e.code === 'KeyS' && e.ctrlKey) {
        e.preventDefault();
        saveMapToStorage();
    }
    // ロード（Ctrl+L）
    if (e.code === 'KeyL' && e.ctrlKey) {
        e.preventDefault();
        loadMapFromStorage();
    }
    // F2で閉じる
    if (e.code === 'F2') {
        closeMapEditor();
    }
}

function mapEditorHandleClick() {
    const worldX = mouse.x + cameraX;
    const worldY = mouse.y;
    const col = Math.floor(worldX / TILE);
    const row = Math.floor(worldY / TILE);
    if (mapEditorMode === 'tile') {
        if (row >= 0 && row < levelMap.length && col >= 0 && col < (levelMap[0]||[]).length) {
            levelMap[row][col] = mapEditorBrush;
        }
    } else if (mapEditorMode === 'enemy') {
        // 敵を配置
        const ex = col * TILE, ey = row * TILE;
        let e = null;
        if      (mapEditorEnemyType==='zombie')  e = new Zombie(ex, ey);
        else if (mapEditorEnemyType==='shade')   e = new Shade(ex, ey);
        else if (mapEditorEnemyType==='demon')   e = new Demon(ex, ey);
        else if (mapEditorEnemyType==='spawner') e = new Spawner(ex, ey);
        else if (mapEditorEnemyType==='boss1')   e = new Boss(ex, ey, 1);
        else if (mapEditorEnemyType==='boss2')   e = new Boss(ex, ey, 2);
        else if (mapEditorEnemyType==='boss3')   e = new Boss(ex, ey, 3);
        if (e) {
            const hpScale = getEnemyHpScale();
            e.hp = Math.floor(e.hp * hpScale); e.maxHp = e.hp;
            enemies.push(e);
            mapEditorCustomEnemies.push({ type: mapEditorEnemyType, x: ex, y: ey });
        }
    } else if (mapEditorMode === 'erase_enemy') {
        // 近くの敵を削除
        for (let i = enemies.length-1; i >= 0; i--) {
            const e = enemies[i];
            if (!e.alive) continue;
            if (Math.abs(e.x + e.w/2 - worldX) < TILE && Math.abs(e.y + e.h/2 - worldY) < TILE) {
                e.alive = false;
                mapEditorCustomEnemies = mapEditorCustomEnemies.filter(ce =>
                    Math.abs(ce.x - e.x) > 5 || Math.abs(ce.y - e.y) > 5
                );
                break;
            }
        }
    }
}

function saveMapToStorage() {
    try {
        const data = {
            levelIdx: mapEditorLevelIdx,
            map: levelMap,
            enemies: mapEditorCustomEnemies,
            timestamp: Date.now()
        };
        mapEditorSavedMaps[mapEditorLevelIdx] = data;
        localStorage.setItem('darkAbyss_customMaps', JSON.stringify(mapEditorSavedMaps));
        hubMessage = `マップ保存完了 (Level ${mapEditorLevelIdx})`;
        hubMessageTimer = 120;
    } catch(err) {
        hubMessage = '保存失敗: ' + err.message;
        hubMessageTimer = 120;
    }
}

function loadMapFromStorage() {
    try {
        const stored = localStorage.getItem('darkAbyss_customMaps');
        if (stored) {
            mapEditorSavedMaps = JSON.parse(stored);
            const data = mapEditorSavedMaps[currentLevelIdx];
            if (data) {
                levelMap = data.map;
                // 敵を再配置
                enemies = [];
                for (const ce of data.enemies) {
                    let e = null;
                    if      (ce.type==='zombie')  e = new Zombie(ce.x, ce.y);
                    else if (ce.type==='shade')   e = new Shade(ce.x, ce.y);
                    else if (ce.type==='demon')   e = new Demon(ce.x, ce.y);
                    else if (ce.type==='spawner') e = new Spawner(ce.x, ce.y);
                    else if (ce.type==='boss1')   e = new Boss(ce.x, ce.y, 1);
                    else if (ce.type==='boss2')   e = new Boss(ce.x, ce.y, 2);
                    else if (ce.type==='boss3')   e = new Boss(ce.x, ce.y, 3);
                    if (e) {
                        const hpScale = getEnemyHpScale();
                        e.hp = Math.floor(e.hp * hpScale); e.maxHp = e.hp;
                        enemies.push(e);
                    }
                }
                mapEditorCustomEnemies = [...data.enemies];
                // ゴール再設定
                goal = null;
                for (let r=0; r<levelMap.length; r++) for (let c=0; c<(levelMap[r]||[]).length; c++) {
                    if (levelMap[r][c]===5) {
                        goal = {x:c*TILE, y:r*TILE - TILE*2, w:TILE, h:TILE*3, t:0};
                        levelMap[r][c]=0;
                    }
                }
                hubMessage = `マップロード完了 (Level ${currentLevelIdx})`;
            } else {
                hubMessage = 'このレベルの保存データなし';
            }
        } else {
            hubMessage = '保存データなし';
        }
        hubMessageTimer = 120;
    } catch(err) {
        hubMessage = 'ロード失敗: ' + err.message;
        hubMessageTimer = 120;
    }
}

// ロード時にカスタムマップがあれば適用
function tryLoadCustomMap(levelIdx) {
    try {
        if (Object.keys(mapEditorSavedMaps).length === 0) {
            const stored = localStorage.getItem('darkAbyss_customMaps');
            if (stored) mapEditorSavedMaps = JSON.parse(stored);
        }
        return mapEditorSavedMaps[levelIdx] || null;
    } catch(e) { return null; }
}

function drawMapEditor() {
    // グリッド表示
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 0.5;
    const s0 = Math.floor(cameraX/TILE), s1 = s0+COLS+2;
    for (let c = s0; c <= s1; c++) {
        const sx = Math.round(c*TILE - cameraX);
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, canvas.height); ctx.stroke();
    }
    for (let r = 0; r < ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(0, r*TILE); ctx.lineTo(canvas.width, r*TILE); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // カーソルハイライト
    const worldX = mouse.x + cameraX;
    const worldY = mouse.y;
    const hCol = Math.floor(worldX / TILE);
    const hRow = Math.floor(worldY / TILE);
    const hsx = Math.round(hCol*TILE - cameraX);
    const hsy = hRow*TILE;
    ctx.strokeStyle = '#ff0'; ctx.lineWidth = 2;
    ctx.strokeRect(hsx, hsy, TILE, TILE);
    // カーソル上にブラシ情報
    if (mapEditorMode === 'tile') {
        const td = MAP_EDITOR_TILES.find(t=>t.id===mapEditorBrush);
        ctx.globalAlpha = 0.4;
        pxRect(hsx, hsy, TILE, TILE, td ? td.color : '#fff');
        ctx.globalAlpha = 1;
    } else if (mapEditorMode === 'enemy') {
        const ed = MAP_EDITOR_ENEMIES.find(e=>e.type===mapEditorEnemyType);
        ctx.globalAlpha = 0.5;
        pxRect(hsx+5, hsy+5, 30, 30, ed ? ed.color : '#f00');
        ctx.globalAlpha = 1;
    }

    // パネル（右上）
    const px2 = canvas.width - 200, py = 4, pw = 196, ph = 300;
    pxRect(px2, py, pw, ph, 'rgba(0,0,0,0.85)');
    pxRect(px2, py, pw, 3, '#ff0');
    ctx.fillStyle='#ff0'; ctx.font='bold 12px monospace';
    ctx.fillText('MAP EDITOR', px2+8, py+18);
    ctx.fillStyle='#aaa'; ctx.font='10px monospace';
    ctx.fillText('F2:閉じる', px2+120, py+18);

    // タイルパレット
    ctx.fillStyle='#ccc'; ctx.font='bold 10px monospace';
    ctx.fillText('タイル [1-5]:', px2+8, py+38);
    for (let i=0; i<MAP_EDITOR_TILES.length; i++) {
        const t = MAP_EDITOR_TILES[i];
        const ty = py+42+i*20;
        const isSel = (mapEditorMode==='tile' && mapEditorBrush===t.id);
        if (isSel) pxRect(px2+4, ty-2, pw-8, 18, '#333');
        pxRect(px2+8, ty, 14, 14, t.color);
        ctx.fillStyle = isSel ? '#ff0' : '#aaa'; ctx.font='10px monospace';
        ctx.fillText(`${i+1}: ${t.label}`, px2+26, ty+11);
    }

    // 敵パレット
    const ey = py+42+MAP_EDITOR_TILES.length*20+10;
    ctx.fillStyle='#ccc'; ctx.font='bold 10px monospace';
    ctx.fillText('敵 [6] / 消去 [7]:', px2+8, ey);
    if (mapEditorMode === 'enemy') {
        const ed = MAP_EDITOR_ENEMIES.find(e=>e.type===mapEditorEnemyType);
        ctx.fillStyle='#f84'; ctx.font='10px monospace';
        ctx.fillText(`配置: ${ed?ed.label:'?'} [[]で変更`, px2+8, ey+16);
    } else if (mapEditorMode === 'erase_enemy') {
        ctx.fillStyle='#f44'; ctx.font='10px monospace';
        ctx.fillText('敵消去モード', px2+8, ey+16);
    }

    // 操作説明
    const iy = ey + 34;
    ctx.fillStyle='#888'; ctx.font='9px monospace';
    ctx.fillText('クリック: 配置/消去', px2+8, iy);
    ctx.fillText('Ctrl+S: 保存', px2+8, iy+14);
    ctx.fillText('Ctrl+L: ロード', px2+8, iy+28);
    ctx.fillText(`Level: ${currentLevelIdx}`, px2+8, iy+42);
    ctx.fillText(`座標: ${hCol},${hRow}`, px2+8, iy+56);

    // メッセージ表示
    if (hubMessageTimer > 0) {
        ctx.textAlign='center';
        ctx.fillStyle='#fff'; ctx.font='bold 14px monospace';
        ctx.globalAlpha = Math.min(1, hubMessageTimer/30);
        ctx.fillText(hubMessage, canvas.width/2, 30);
        ctx.globalAlpha = 1;
        ctx.textAlign='left';
    }
}

function drawDebugMenu() {
    ctx.fillStyle = 'rgba(0,0,0,0.88)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff0'; ctx.font = 'bold 20px monospace';
    ctx.fillText('DEBUG: アイテム選択 (F1/ESCで閉じる)', canvas.width/2, 40);
    ctx.fillStyle = '#666'; ctx.font = '11px monospace';
    ctx.fillText('↑↓: 選択  SPACE/Enter: 取得  クリックでも取得可', canvas.width/2, 58);

    const listX = canvas.width/2 - 200;
    const listY = 80;
    const rowH = 28;
    const maxVisible = 14;

    for (let i = 0; i < maxVisible; i++) {
        const idx = debugMenuScroll + i;
        if (idx >= debugMenuItems.length) break;
        const item = debugMenuItems[idx];
        const def = ITEM_DEFS[item.type];
        const rd = RARITY_DEFS[item.rarity];
        const y = listY + i * rowH;
        const isSel = (idx === debugMenuCursor);

        if (isSel) {
            pxRect(listX - 4, y - 2, 408, rowH, '#222');
            pxRect(listX - 4, y - 2, 3, rowH, rd.color);
        }

        // レアリティ色ドット
        pxRect(listX, y + 4, 14, 14, rd.color);
        ctx.textAlign = 'left';
        ctx.fillStyle = rd.color; ctx.font = 'bold 11px monospace';
        ctx.fillText(rd.label, listX + 18, y + 15);

        ctx.fillStyle = def.color; ctx.font = 'bold 12px monospace';
        ctx.fillText(def.label, listX + 90, y + 15);

        ctx.fillStyle = '#888'; ctx.font = '10px monospace';
        const desc = getItemDescription(item.type, item.rarity).replace('\n', ' / ');
        ctx.fillText(desc, listX + 200, y + 15);
    }

    // スクロールバー
    if (debugMenuItems.length > maxVisible) {
        const barH = maxVisible * rowH;
        const thumbH = Math.max(20, barH * maxVisible / debugMenuItems.length);
        const thumbY = listY + (barH - thumbH) * debugMenuScroll / (debugMenuItems.length - maxVisible);
        pxRect(listX + 404, listY, 4, barH, '#222');
        pxRect(listX + 404, thumbY, 4, thumbH, '#666');
    }

    ctx.textAlign = 'left';
}

// ============================================================
//  ゲーム制御
// ============================================================
function enterHub() {
    stopBGM();
    state = S.HUB;
    shakeAmt = 0; // 揺れリセット
    hubSelectedLevel = Math.min(highestLevelCleared + 1, LEVELS.length - 1);
    // 村マップ生成
    setupVillageMap();
    // 村BGM開始
    startHubBGM();
}

function startStage(levelIdx) {
    stopHubBGM();
    score=0;
    currentLevelIdx = levelIdx;
    // 拠点アップグレードを反映した初期能力
    const hu = HUB_UPGRADES;
    player.hp = 100 + hu.maxHp.level * 20;
    player.maxHp = 100 + hu.maxHp.level * 20;
    player.weapon='PISTOL';
    player.upgrades={
        multiShot: 1 + hu.multiShot.level,
        fireRate:  1.0 + hu.fireRate.level * 0.10,
        bulletSize:1.0 + hu.bulletSize.level * 0.10,
        moveSpeed: 1.0 + hu.moveSpeed.level * 0.08,
        jumpPower: 1.0 + hu.jumpPower.level * 0.06
    };
    player.extraJumps=0; player.maxExtraJumps=0;
    player.hasMagnet=false;
    player.hasShield = hu.shield.level > 0;
    player.shieldHp = hu.shield.level * 20;
    player.hasLifeSteal=false;
    player._jumpHeld=false;
    lives = 3 + hu.extraLife.level;
    pickupTexts=[]; enemyBullets=[];
    loadLevel(levelIdx);
}

function startGame() {
    startStage(0);
}
function resetGame() { stopBGM(); enterHub(); }

// ============================================================
//  メインループ
// ============================================================
function update() {
    if (state===S.HUB) {
        updateHub();
        return;
    }
    // マップエディタ: マウスドラッグでタイル連続配置
    if (mapEditorActive && mouse.down && mapEditorMode === 'tile') {
        const worldX = mouse.x + cameraX;
        const worldY = mouse.y;
        const col = Math.floor(worldX / TILE);
        const row = Math.floor(worldY / TILE);
        if (row >= 0 && row < levelMap.length && col >= 0 && col < (levelMap[0]||[]).length) {
            levelMap[row][col] = mapEditorBrush;
        }
    }
    if (state===S.READY) {
        readyTimer--;
        if (readyTimer<=0) state=S.PLAY;
        return;
    }
    if (state!==S.PLAY) return;
    updatePlayer();
    updateMovingPlatforms();
    updateCrumblingBlocks();
    checkSpikeDamage();
    for (const e of enemies) if (e.alive) e.update();
    updateBullets();
    // 敵弾更新
    for (const eb of enemyBullets) if (eb.alive) eb.update();
    enemyBullets = enemyBullets.filter(b=>b.alive);
    for (const it of items) if (!it.collected) it.update();
    for (const cd of currencyDrops) if (!cd.collected) cd.update();
    currencyDrops = currencyDrops.filter(c=>!c.collected);
    particles=particles.filter(p=>p.life>0);
    for (const p of particles) p.update();
    if (shakeAmt>0.5) shakeAmt*=0.75; else shakeAmt=0;
    enemies=enemies.filter(e=>e.alive||true); // 参照保持
}

function draw() {
    ctx.save();
    if (shakeAmt>0.5) {
        ctx.translate((Math.random()-0.5)*shakeAmt*2,(Math.random()-0.5)*shakeAmt*2);
    }
    if (state===S.TITLE) {
        drawTitle();
    } else if (state===S.READY) {
        drawBackground();
        drawTiles();
        for (const mp of movingPlatforms) mp.draw(cameraX);
        for (const cb of crumblingBlocks) cb.draw(cameraX);
        drawGoal();
        for (const e of enemies) e.draw(cameraX);
        drawPlayer();
        drawHUD();
        drawReady();
    } else if (state===S.PLAY) {
        drawBackground();
        drawTiles();
        for (const mp of movingPlatforms) mp.draw(cameraX);
        for (const cb of crumblingBlocks) cb.draw(cameraX);
        drawGoal();
        for (const e of enemies) e.draw(cameraX);
        for (const it of items)  it.draw(cameraX);
        for (const cd of currencyDrops) cd.draw(cameraX);
        for (const b of bullets) b.draw(cameraX);
        for (const eb of enemyBullets) eb.draw(cameraX);
        for (const p of particles) p.draw(cameraX);
        drawPlayer();
        drawPickupTexts(cameraX);
        drawHUD();
        if (mapEditorActive) drawMapEditor();
    } else if (state===S.REWARD) {
        drawBackground();
        drawTiles();
        drawGoal();
        for (const e of enemies) e.draw(cameraX);
        drawPlayer();
        drawHUD();
        drawReward();
    } else if (state===S.OVER) {
        drawBackground(); drawTiles();
        for (const p of particles) p.draw(cameraX);
        drawGameOver();
    } else if (state===S.CLEAR) {
        drawBackground(); drawTiles();
        drawClear();
    } else if (state===S.HUB) {
        drawHub();
    } else if (state===S.DEBUG_MENU) {
        drawBackground();
        drawTiles();
        drawGoal();
        for (const e of enemies) e.draw(cameraX);
        for (const it of items) it.draw(cameraX);
        drawPlayer();
        drawHUD();
        drawDebugMenu();
    }
    ctx.restore();
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();
