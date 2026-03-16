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
        if (!audioCtx || state === S.TITLE) return;
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
const S = { TITLE:'title', PLAY:'play', OVER:'over', CLEAR:'clear', READY:'ready', REWARD:'reward' };
let state    = S.TITLE;
let score    = 0;
let wave     = 1;           // ウェーブ（敵を全滅で次へ）
let enemies  = [];
let bullets  = [];
let items    = [];
let particles= [];
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
            const cardW = 180, cardH = 220, gap = 30;
            const totalW = cardW * 3 + gap * 2;
            const startX = (canvas.width - totalW) / 2;
            const cardY = 180;
            for (let i = 0; i < 3; i++) {
                const cx = startX + i * (cardW + gap);
                if (mouse.x >= cx && mouse.x <= cx+cardW && mouse.y >= cardY && mouse.y <= cardY+cardH) {
                    rewardSelected = i;
                    applyReward();
                    break;
                }
            }
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
    if (state === S.TITLE && e.code === 'Space') startGame();
    if (state === S.OVER  && e.code === 'Space') resetGame();
    if (state === S.CLEAR && e.code === 'Space') resetGame();
    if (state === S.READY && e.code === 'Space') { readyTimer = 1; } // スキップ
    // 報酬選択
    if (state === S.REWARD) {
        if (e.code === 'ArrowLeft'  || e.code === 'KeyA') rewardSelected = (rewardSelected + 2) % 3;
        if (e.code === 'ArrowRight' || e.code === 'KeyD') rewardSelected = (rewardSelected + 1) % 3;
        if (e.code === 'Space' || e.code === 'Enter') applyReward();
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
};

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
        this.dmg       = W.dmg;
        this.color     = W.color;
        this.glow      = W.glow;
        this.piercing  = W.piercing;
        this.bouncing  = W.bouncing;
        this.explosive = W.explosive;
        this.explodeR  = W.explodeR || 0;
        this.size      = (wKey === 'SNIPER' ? 4 : wKey === 'PLASMA' ? 7 : 3.5) * sizeScale;
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
        // 本体（四角ドット）
        pxRect(sx - s, this.y - s, s*2, s*2, this.color);
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
        this.dmg = 15;
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
    MULTISHOT:      { label:'+弾数',       color:'#00e5ff', icon:'◉' },
    FIRERATE:       { label:'+速射',       color:'#ffdd00', icon:'⚡' },
    BULLETSIZE:     { label:'+弾肥大化',   color:'#ff44cc', icon:'◎' },
    SPEED_UP:       { label:'+移動速度',   color:'#44ffaa', icon:'»' },
    JUMP_UP:        { label:'+跳躍力',     color:'#88ffff', icon:'↑' },
    HEAL:           { label:'HP回復',      color:'#22ff44', icon:'+' },
    MAXHP_UP:       { label:'+最大HP',     color:'#ff8844', icon:'♥' },
    WEAPON_SHOTGUN: { label:'ショットガン', color:'#ff6a00', icon:'shotgun' },
    WEAPON_SMG:     { label:'SMG',         color:'#00ff88', icon:'smg' },
    WEAPON_SNIPER:  { label:'スナイパー',   color:'#ff00ff', icon:'sniper' },
    WEAPON_PLASMA:  { label:'プラズマ',    color:'#aa00ff', icon:'plasma' },
    WEAPON_SWORD:   { label:'魔剣',        color:'#ff4444', icon:'sword' },
};
class Item {
    constructor(x, y, type) {
        this.x = x; this.y = y;
        this.type = type;
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
        const hover = Math.round(Math.sin(this.t)*4);
        const bx = Math.round(sx-12), by = Math.round(this.y-12+hover);
        // 箱（黒背景+色枠）
        pxRect(bx, by, 24, 24, '#000');
        pxRect(bx, by, 24, 2, d.color);
        pxRect(bx, by+22, 24, 2, d.color);
        pxRect(bx, by, 2, 24, d.color);
        pxRect(bx+22, by, 2, 24, d.color);
        // アイコン描画
        drawItemIcon(d.icon, sx, this.y+hover, d.color);
    }
    applyTo() {
        const t = this.type;
        if      (t === 'MULTISHOT')  player.upgrades.multiShot   = Math.min(player.upgrades.multiShot + 1, 9);
        else if (t === 'FIRERATE')   player.upgrades.fireRate     = Math.min(player.upgrades.fireRate  * 1.35, 6);
        else if (t === 'BULLETSIZE') player.upgrades.bulletSize   = Math.min(player.upgrades.bulletSize* 1.4, 5);
        else if (t === 'SPEED_UP')   player.upgrades.moveSpeed    = Math.min(player.upgrades.moveSpeed * 1.25, 3);
        else if (t === 'JUMP_UP')    player.upgrades.jumpPower    = Math.min(player.upgrades.jumpPower * 1.2, 2.5);
        else if (t === 'HEAL')       player.hp = Math.min(player.hp + 30, player.maxHp);
        else if (t === 'MAXHP_UP')  { player.maxHp += 20; player.hp = Math.min(player.hp + 20, player.maxHp); }
        else if (t.startsWith('WEAPON_')) player.weapon = t.replace('WEAPON_','');
        this.collected = true;
        spawnParticles(this.x, this.y, ITEM_DEFS[t].color, 14, 4);
        showPickupText(ITEM_DEFS[t].label, ITEM_DEFS[t].color);
    }
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
    } else {
        // その他のアイテム: テキストアイコン
        ctx.fillStyle = color;
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(icon, cx, cy + 5);
        ctx.textAlign = 'left';
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
        this.activateRange=350; // プレイヤーがこの距離以内で覚醒
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
    }
    _dropItem() {
        const pool =   ['MULTISHOT','FIRERATE','BULLETSIZE','SPEED_UP','JUMP_UP','HEAL','MAXHP_UP','WEAPON_SHOTGUN','WEAPON_SMG','WEAPON_SNIPER','WEAPON_PLASMA','WEAPON_SWORD'];
        const weights= [18,         16,        14,          10,        8,        15,    8,         3,               3,            2,              3,             3];
        let r = Math.random()*100, acc=0;
        for (let i=0;i<pool.length;i++) {
            acc+=weights[i];
            if (r<acc) { items.push(new Item(this.x+this.w/2, this.y, pool[i])); break; }
        }
    }
    _applyGravity() {
        this.vy += GRAVITY;
        if (this.vy > 14) this.vy = 14;
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

const LEVELS = [
    // ===== STAGE 1: 廃墟の地下 =====
    {
        name:'廃墟の地下', stage:0,
        bg1:'#000000', bg2:'#0d0010',
        width:60,
        enemySpawns: [
            {type:'zombie', col:14, row:ROWS-3},
            {type:'zombie', col:22, row:ROWS-3},
            {type:'shade',  col:18, row:ROWS-6},
            {type:'zombie', col:35, row:ROWS-3},
            {type:'shade',  col:40, row:ROWS-6},
            {type:'demon',  col:50, row:ROWS-3},
            {type:'spawner',col:28, row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            for (const [s,l] of [[10,3],[22,4],[36,3],[46,3]]) clearCols(m,s,l,ROWS-2,ROWS);
            platf(m, [[7,ROWS-5,4],[14,ROWS-6,3],[23,ROWS-5,4],[29,ROWS-4,3],[38,ROWS-5,3],[43,ROWS-6,4],[52,ROWS-5,3]]);
            for (let i=0;i<4;i++) for(let j=0;j<=i;j++) set(m,52+i,ROWS-3-j,2);
            platf(m, [[56, ROWS-6, 3]]);
            setGoal(m, 57, ROWS-7);
            return m;
        }
    },
    {
        name:'呪われた塔', stage:0,
        bg1:'#050008', bg2:'#10001a',
        width:75,
        enemySpawns: [
            {type:'zombie', col:8, row:ROWS-3},{type:'zombie',col:12,row:ROWS-3},
            {type:'shade', col:18, row:ROWS-7},{type:'shade', col:25,row:ROWS-8},
            {type:'zombie', col:32, row:ROWS-3},{type:'demon', col:40,row:ROWS-3},
            {type:'shade', col:48, row:ROWS-6},{type:'spawner',col:55,row:ROWS-3},
            {type:'demon', col:65, row:ROWS-3},{type:'shade', col:60,row:ROWS-7},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            for (const [s,l] of [[8,4],[20,5],[34,4],[50,5],[62,3]]) clearCols(m,s,l,ROWS-2,ROWS);
            platf(m,[[5,ROWS-5,3],[10,ROWS-7,3],[16,ROWS-5,4],[23,ROWS-8,3],[28,ROWS-5,4],
                [35,ROWS-6,2],[40,ROWS-4,3],[45,ROWS-7,3],[51,ROWS-5,4],[58,ROWS-6,3],[65,ROWS-4,4]]);
            for (let j=0;j<5;j++) set(m,30,ROWS-3-j,2);
            for (let j=0;j<4;j++) set(m,52,ROWS-3-j,2);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        }
    },
    {
        name:'奈落の深淵', stage:0,
        bg1:'#000005', bg2:'#080014',
        width:80,
        enemySpawns: [
            {type:'zombie',col:6,row:ROWS-3},{type:'shade',col:14,row:ROWS-6},
            {type:'demon',col:20,row:ROWS-3},{type:'zombie',col:28,row:ROWS-3},
            {type:'shade',col:34,row:ROWS-7},{type:'spawner',col:42,row:ROWS-3},
            {type:'demon',col:50,row:ROWS-3},{type:'shade',col:56,row:ROWS-6},
            {type:'zombie',col:62,row:ROWS-3},{type:'demon',col:68,row:ROWS-3},
            {type:'shade',col:72,row:ROWS-8},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, 10, 1); fillRow(m, ROWS-2, 0, 10, 1);
            fillRow(m, ROWS-1, 16, 32, 1); fillRow(m, ROWS-2, 16, 32, 1);
            fillRow(m, ROWS-1, 38, 54, 1); fillRow(m, ROWS-2, 38, 54, 1);
            fillRow(m, ROWS-1, 60, w, 1); fillRow(m, ROWS-2, 60, w, 1);
            platf(m,[[11,ROWS-4,3],[14,ROWS-6,2],[33,ROWS-5,3],[36,ROWS-7,2],[55,ROWS-4,3],[58,ROWS-6,2]]);
            platf(m,[[8,ROWS-5,3],[22,ROWS-5,4],[30,ROWS-7,3],[44,ROWS-5,3],[52,ROWS-6,3],[65,ROWS-5,4]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        }
    },
    {
        name:'骸骨王の間', stage:0, boss:1,
        bg1:'#0a0500', bg2:'#1a0a00',
        width:30,
        enemySpawns: [{type:'boss1', col:18, row:ROWS-3}],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            platf(m,[[4,ROWS-5,3],[12,ROWS-6,3],[20,ROWS-5,3],[w-6,ROWS-6,3]]);
            setGoal(m, w-3, ROWS-3);
            return m;
        }
    },
    // ===== STAGE 2: 氷の洞窟 =====
    {
        name:'凍てつく入口', stage:1,
        bg1:'#000510', bg2:'#001020',
        width:65,
        enemySpawns: [
            {type:'zombie',col:10,row:ROWS-3},{type:'zombie',col:18,row:ROWS-3},
            {type:'shade',col:24,row:ROWS-6},{type:'demon',col:32,row:ROWS-3},
            {type:'shade',col:38,row:ROWS-7},{type:'zombie',col:44,row:ROWS-3},
            {type:'spawner',col:50,row:ROWS-3},{type:'demon',col:56,row:ROWS-3},
            {type:'shade',col:42,row:ROWS-8},{type:'shade',col:52,row:ROWS-6},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            for (const [s,l] of [[12,3],[26,4],[40,3],[52,3]]) clearCols(m,s,l,ROWS-2,ROWS);
            platf(m,[[6,ROWS-5,4],[13,ROWS-6,3],[20,ROWS-4,3],[27,ROWS-7,4],[34,ROWS-5,3],
                [41,ROWS-6,3],[48,ROWS-4,4],[55,ROWS-5,3],[60,ROWS-6,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        }
    },
    {
        name:'氷柱の回廊', stage:1,
        bg1:'#000818', bg2:'#001228',
        width:80,
        enemySpawns: [
            {type:'zombie',col:8,row:ROWS-3},{type:'shade',col:14,row:ROWS-7},
            {type:'demon',col:22,row:ROWS-3},{type:'shade',col:28,row:ROWS-8},
            {type:'spawner',col:36,row:ROWS-3},{type:'zombie',col:42,row:ROWS-3},
            {type:'demon',col:50,row:ROWS-3},{type:'shade',col:56,row:ROWS-6},
            {type:'spawner',col:62,row:ROWS-3},{type:'demon',col:70,row:ROWS-3},
            {type:'shade',col:66,row:ROWS-8},{type:'shade',col:74,row:ROWS-7},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            for (const [s,l] of [[10,4],[24,5],[38,4],[54,4],[66,3]]) clearCols(m,s,l,ROWS-2,ROWS);
            // 氷柱（縦壁）
            for (let j=0;j<6;j++) set(m,20,ROWS-3-j,2);
            for (let j=0;j<5;j++) set(m,40,ROWS-3-j,2);
            for (let j=0;j<7;j++) set(m,60,ROWS-3-j,2);
            platf(m,[[5,ROWS-5,3],[11,ROWS-7,3],[16,ROWS-5,4],[25,ROWS-6,3],[30,ROWS-4,3],
                [35,ROWS-7,3],[42,ROWS-5,4],[48,ROWS-6,3],[55,ROWS-5,3],[62,ROWS-7,3],[68,ROWS-5,4],[74,ROWS-4,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        }
    },
    {
        name:'氷結の大穴', stage:1,
        bg1:'#001020', bg2:'#002040',
        width:85,
        enemySpawns: [
            {type:'zombie',col:6,row:ROWS-3},{type:'demon',col:14,row:ROWS-3},
            {type:'shade',col:20,row:ROWS-7},{type:'spawner',col:28,row:ROWS-3},
            {type:'shade',col:34,row:ROWS-8},{type:'demon',col:42,row:ROWS-3},
            {type:'zombie',col:48,row:ROWS-3},{type:'shade',col:54,row:ROWS-6},
            {type:'demon',col:62,row:ROWS-3},{type:'spawner',col:68,row:ROWS-3},
            {type:'shade',col:74,row:ROWS-7},{type:'demon',col:78,row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, 8, 1); fillRow(m, ROWS-2, 0, 8, 1);
            fillRow(m, ROWS-1, 14, 30, 1); fillRow(m, ROWS-2, 14, 30, 1);
            fillRow(m, ROWS-1, 36, 52, 1); fillRow(m, ROWS-2, 36, 52, 1);
            fillRow(m, ROWS-1, 58, w, 1); fillRow(m, ROWS-2, 58, w, 1);
            platf(m,[[9,ROWS-4,3],[12,ROWS-6,2],[31,ROWS-5,3],[34,ROWS-7,2],[53,ROWS-4,3],[56,ROWS-6,2]]);
            platf(m,[[18,ROWS-5,4],[24,ROWS-7,3],[40,ROWS-5,3],[46,ROWS-6,4],[64,ROWS-5,4],[72,ROWS-6,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        }
    },
    {
        name:'氷龍の巣', stage:1, boss:2,
        bg1:'#001030', bg2:'#002050',
        width:30,
        enemySpawns: [{type:'boss2', col:18, row:ROWS-3}],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            platf(m,[[3,ROWS-5,3],[10,ROWS-7,4],[18,ROWS-5,3],[24,ROWS-6,3]]);
            // 氷柱
            for (let j=0;j<4;j++) set(m,14,ROWS-3-j,2);
            setGoal(m, w-3, ROWS-3);
            return m;
        }
    },
    // ===== STAGE 3: 灼熱地獄 =====
    {
        name:'灼熱の入口', stage:2,
        bg1:'#100000', bg2:'#200800',
        width:70,
        enemySpawns: [
            {type:'demon',col:10,row:ROWS-3},{type:'shade',col:16,row:ROWS-6},
            {type:'spawner',col:22,row:ROWS-3},{type:'demon',col:30,row:ROWS-3},
            {type:'shade',col:36,row:ROWS-7},{type:'zombie',col:42,row:ROWS-3},
            {type:'demon',col:48,row:ROWS-3},{type:'spawner',col:54,row:ROWS-3},
            {type:'shade',col:58,row:ROWS-8},{type:'demon',col:64,row:ROWS-3},
            {type:'shade',col:44,row:ROWS-6},{type:'zombie',col:60,row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            for (const [s,l] of [[8,3],[18,4],[32,3],[44,4],[56,3]]) clearCols(m,s,l,ROWS-2,ROWS);
            platf(m,[[5,ROWS-5,3],[9,ROWS-7,3],[14,ROWS-5,4],[19,ROWS-6,3],[26,ROWS-4,3],
                [33,ROWS-7,4],[39,ROWS-5,3],[45,ROWS-6,3],[50,ROWS-4,4],[57,ROWS-7,3],[63,ROWS-5,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        }
    },
    {
        name:'溶岩の橋', stage:2,
        bg1:'#180000', bg2:'#301000',
        width:85,
        enemySpawns: [
            {type:'demon',col:8,row:ROWS-3},{type:'spawner',col:16,row:ROWS-3},
            {type:'shade',col:22,row:ROWS-7},{type:'demon',col:28,row:ROWS-3},
            {type:'shade',col:34,row:ROWS-8},{type:'spawner',col:40,row:ROWS-3},
            {type:'demon',col:48,row:ROWS-3},{type:'shade',col:54,row:ROWS-6},
            {type:'zombie',col:60,row:ROWS-3},{type:'demon',col:66,row:ROWS-3},
            {type:'spawner',col:72,row:ROWS-3},{type:'shade',col:78,row:ROWS-7},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            // 途切れ途切れの溶岩上の橋
            fillRow(m, ROWS-1, 0, 12, 1); fillRow(m, ROWS-2, 0, 12, 1);
            fillRow(m, ROWS-1, 18, 34, 1); fillRow(m, ROWS-2, 18, 34, 1);
            fillRow(m, ROWS-1, 40, 56, 1); fillRow(m, ROWS-2, 40, 56, 1);
            fillRow(m, ROWS-1, 62, w, 1); fillRow(m, ROWS-2, 62, w, 1);
            platf(m,[[13,ROWS-4,3],[16,ROWS-6,2],[35,ROWS-5,3],[38,ROWS-7,2],[57,ROWS-4,3],[60,ROWS-6,2]]);
            platf(m,[[6,ROWS-5,3],[24,ROWS-6,4],[30,ROWS-4,3],[46,ROWS-5,4],[52,ROWS-7,3],
                [68,ROWS-5,3],[74,ROWS-6,4],[80,ROWS-4,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        }
    },
    {
        name:'煉獄の階段', stage:2,
        bg1:'#200000', bg2:'#401000',
        width:90,
        enemySpawns: [
            {type:'demon',col:6,row:ROWS-3},{type:'demon',col:14,row:ROWS-3},
            {type:'spawner',col:22,row:ROWS-3},{type:'shade',col:28,row:ROWS-7},
            {type:'demon',col:36,row:ROWS-3},{type:'shade',col:42,row:ROWS-8},
            {type:'spawner',col:48,row:ROWS-3},{type:'demon',col:56,row:ROWS-3},
            {type:'shade',col:62,row:ROWS-6},{type:'demon',col:68,row:ROWS-3},
            {type:'spawner',col:74,row:ROWS-3},{type:'demon',col:80,row:ROWS-3},
            {type:'shade',col:84,row:ROWS-7},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            for (const [s,l] of [[10,4],[24,5],[40,4],[56,5],[72,3]]) clearCols(m,s,l,ROWS-2,ROWS);
            // 階段状の配置
            for (let i=0;i<3;i++) for(let j=0;j<=i;j++) set(m,8+i,ROWS-3-j,2);
            for (let i=0;i<3;i++) for(let j=0;j<=i;j++) set(m,32+i,ROWS-3-j,2);
            for (let i=0;i<4;i++) for(let j=0;j<=i;j++) set(m,60+i,ROWS-3-j,2);
            platf(m,[[5,ROWS-5,3],[11,ROWS-7,3],[18,ROWS-5,4],[25,ROWS-8,3],[30,ROWS-5,4],
                [37,ROWS-6,3],[44,ROWS-4,3],[50,ROWS-7,3],[57,ROWS-5,4],[65,ROWS-6,3],
                [72,ROWS-5,3],[78,ROWS-7,4],[84,ROWS-5,3]]);
            platf(m, [[w-5, ROWS-4, 3]]);
            setGoal(m, w-4, ROWS-5);
            return m;
        }
    },
    {
        name:'魔王の玉座', stage:2, boss:3,
        bg1:'#200000', bg2:'#400800',
        width:35,
        enemySpawns: [{type:'boss3', col:22, row:ROWS-3}],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1); fillRow(m, ROWS-2, 0, w, 1);
            platf(m,[[4,ROWS-5,3],[10,ROWS-7,4],[18,ROWS-5,3],[24,ROWS-6,3],[w-7,ROWS-5,3]]);
            setGoal(m, w-3, ROWS-3);
            return m;
        }
    },
];

// レベルビルドヘルパー
function blank(w, h) { return Array.from({length:h}, ()=>Array(w).fill(0)); }
function fillRow(m, row, from, to, v) { for(let c=from;c<to&&c<m[0].length;c++) m[row][c]=v; }
function clearCols(m,s,len,r0,r1){ for(let c=s;c<s+len;c++) for(let r=r0;r<r1;r++) m[r][c]=0; }
function platf(m, arr) { for(const [x,y,w] of arr) for(let i=0;i<w;i++) set(m,x+i,y,2); }
function set(m,c,r,v){ if(r>=0&&r<m.length&&c>=0&&c<m[0].length) m[r][c]=v; }
function setGoal(m,c,r){ set(m,c,r,5); }

// ============================================================
//  ロード
// ============================================================
function loadLevel(idx) {
    if (idx >= LEVELS.length) { state=S.CLEAR; stopBGM(); return; }
    currentLevelIdx = idx;
    const lvl = LEVELS[idx];
    levelMap = lvl.generate(lvl.width);

    enemies=[]; items=[]; bullets=[]; particles=[]; enemyBullets=[]; goal=null;

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
            // プレイヤー開始位置(80px)から遠い敵はスリープ
            if (ex > 400 && !(e instanceof Boss)) e.sleeping = true;
            enemies.push(e);
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
    // ジャンプ（ふわっと）
    const jumpF = BASE_JUMP_FORCE * player.upgrades.jumpPower;
    if ((keys['KeyW']||keys['ArrowUp']||keys['Space']) && player.onGround) {
        player.vy = jumpF;
        spawnParticles(player.x+player.w/2, player.y+player.h, '#444', 6, 2);
        sfxJump();
    }
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
            e.takeDamage(e.maxHp); // 即死
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

    // アイテム取得
    for (const it of items) {
        if (it.collected) continue;
        if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h},{x:it.x-15,y:it.y-15,w:30,h:30})) {
            it.applyTo();
            sfxItemPickup();
        }
    }

    // ゴール（敵を全滅させないと進めない）
    const enemiesAlive = enemies.filter(e=>e.alive).length;
    if (goal && enemiesAlive === 0 && rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, goal)) {
        score += 500;
        currentLevelIdx++;
        sfxGoal();
        spawnParticles(player.x+player.w/2,player.y,'#f1c40f',20,5);
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
        } else {
            // 面の最初に戻す（能力リセット、HP全回復）
            player.upgrades = JSON.parse(JSON.stringify(savedUpgrades));
            player.weapon = savedWeapon;
            player.maxHp = savedMaxHp;
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
        const dmg = W.dmg * (1 + (up.multiShot-1)*0.3); // multiShotで威力UP
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

    // スコア
    pxRect(8,32,154,18, '#000');
    ctx.fillStyle='#fc0'; ctx.font='bold 12px monospace';
    ctx.fillText(`SCORE ${score}`, 12, 46);

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
    ctx.fillText(`脚力×${player.upgrades.moveSpeed.toFixed(1)} 跳躍×${player.upgrades.jumpPower.toFixed(1)}`, 14, 102);

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
    ctx.fillText('3ステージ×4面 ボスを倒して深淵を制覇せよ', canvas.width/2, 365);
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
    ctx.fillText(`SCORE ${score}`, canvas.width/2, 270);
    ctx.fillStyle='#666'; ctx.font='14px monospace';
    ctx.fillText(`${WEAPONS[player.weapon].name} | 弾×${player.upgrades.multiShot} 速射×${player.upgrades.fireRate.toFixed(1)}`, canvas.width/2, 310);
    if (Math.floor(Date.now()/500)%2) {
        ctx.fillStyle='#fc0'; ctx.font='bold 18px monospace';
        ctx.fillText('PRESS SPACE TO RETRY', canvas.width/2, 380);
    }
    ctx.textAlign='left';
}

// ============================================================
//  報酬選択（ローグライク）
// ============================================================
function enterRewardScreen() {
    state = S.REWARD;
    rewardSelected = 0;
    // ランダムに3つの異なるアイテムを選出
    const allKeys = Object.keys(ITEM_DEFS);
    rewardChoices = [];
    const pool = allKeys.slice();
    for (let i = 0; i < 3 && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        rewardChoices.push(pool[idx]);
        pool.splice(idx, 1);
    }
}

function applyReward() {
    const choice = rewardChoices[rewardSelected];
    if (!choice) return;
    // アイテム効果を適用
    const t = choice;
    if      (t === 'MULTISHOT')  player.upgrades.multiShot   = Math.min(player.upgrades.multiShot + 1, 9);
    else if (t === 'FIRERATE')   player.upgrades.fireRate     = Math.min(player.upgrades.fireRate  * 1.35, 6);
    else if (t === 'BULLETSIZE') player.upgrades.bulletSize   = Math.min(player.upgrades.bulletSize* 1.4, 5);
    else if (t === 'SPEED_UP')   player.upgrades.moveSpeed    = Math.min(player.upgrades.moveSpeed * 1.25, 3);
    else if (t === 'JUMP_UP')    player.upgrades.jumpPower    = Math.min(player.upgrades.jumpPower * 1.2, 2.5);
    else if (t === 'HEAL')       player.hp = Math.min(player.hp + 50, player.maxHp);
    else if (t === 'MAXHP_UP')  { player.maxHp += 30; player.hp = Math.min(player.hp + 30, player.maxHp); }
    else if (t.startsWith('WEAPON_')) player.weapon = t.replace('WEAPON_','');
    sfxItemPickup();
    showPickupText(ITEM_DEFS[t].label, ITEM_DEFS[t].color);
    loadLevel(currentLevelIdx);
}

function drawReward() {
    // 半透明オーバーレイ
    ctx.fillStyle='rgba(0,0,0,0.75)';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    ctx.textAlign='center';

    // タイトル
    ctx.fillStyle='#fc0'; ctx.font='bold 28px monospace';
    ctx.fillText('LEVEL CLEAR!', canvas.width/2, 100);
    pxRect(canvas.width/2-140, 110, 280, 3, '#a80');

    ctx.fillStyle='#aaa'; ctx.font='16px monospace';
    ctx.fillText('報酬を1つ選べ（←→で選択、SPACEで決定）', canvas.width/2, 150);

    // 3つの選択肢を描画
    const cardW = 180, cardH = 220, gap = 30;
    const totalW = cardW * 3 + gap * 2;
    const startX = (canvas.width - totalW) / 2;
    const cardY = 180;

    for (let i = 0; i < 3; i++) {
        const key = rewardChoices[i];
        if (!key) continue;
        const def = ITEM_DEFS[key];
        const cx = startX + i * (cardW + gap);
        const selected = (i === rewardSelected);

        // カード背景
        pxRect(cx, cardY, cardW, cardH, selected ? '#222' : '#111');
        // カード枠
        const borderColor = selected ? '#fc0' : '#444';
        pxRect(cx, cardY, cardW, 3, borderColor);
        pxRect(cx, cardY+cardH-3, cardW, 3, borderColor);
        pxRect(cx, cardY, 3, cardH, borderColor);
        pxRect(cx+cardW-3, cardY, 3, cardH, borderColor);

        // 選択カーソル
        if (selected) {
            pxRect(cx+3, cardY+3, cardW-6, cardH-6, 'rgba(255,204,0,0.08)');
            // 角のドット装飾
            px(cx+6, cardY+6, 2, 2, '#fc0');
            px(cx+cardW-10, cardY+6, 2, 2, '#fc0');
            px(cx+6, cardY+cardH-10, 2, 2, '#fc0');
            px(cx+cardW-10, cardY+cardH-10, 2, 2, '#fc0');
        }

        // アイコン（大きめに中央配置）
        const iconX = cx + cardW/2;
        const iconY = cardY + 70;
        // アイコン背景円
        pxRect(iconX-20, iconY-20, 40, 40, '#000');
        pxRect(iconX-18, iconY-18, 36, 36, selected ? '#1a1a2e' : '#0a0a1e');
        drawItemIcon(def.icon, iconX, iconY, def.color);

        // アイテム名
        ctx.fillStyle = def.color; ctx.font = 'bold 16px monospace';
        ctx.fillText(def.label, cx + cardW/2, cardY + 120);

        // 説明テキスト
        ctx.fillStyle = '#888'; ctx.font = '11px monospace';
        const desc = getItemDescription(key);
        // 説明を複数行に分割
        const lines = desc.split('\n');
        for (let l = 0; l < lines.length; l++) {
            ctx.fillText(lines[l], cx + cardW/2, cardY + 150 + l * 16);
        }
    }

    // 下部の操作説明
    ctx.fillStyle='#555'; ctx.font='12px monospace';
    ctx.fillText('A/← →/D : 選択  SPACE/Enter : 決定', canvas.width/2, cardY + cardH + 40);
    ctx.textAlign='left';
}

function getItemDescription(key) {
    switch(key) {
        case 'MULTISHOT':      return '弾の発射数+1';
        case 'FIRERATE':       return '攻撃速度×1.35';
        case 'BULLETSIZE':     return '弾のサイズ×1.4';
        case 'SPEED_UP':       return '移動速度×1.25';
        case 'JUMP_UP':        return 'ジャンプ力×1.2';
        case 'HEAL':           return 'HP 50回復';
        case 'MAXHP_UP':       return '最大HP +30\nHP 30回復';
        case 'WEAPON_SHOTGUN': return '近距離散弾\n高火力×6発';
        case 'WEAPON_SMG':     return '高速連射\n弾幕で制圧';
        case 'WEAPON_SNIPER':  return '貫通高威力\n一撃必殺';
        case 'WEAPON_PLASMA':  return '反射＆爆発\n範囲ダメージ';
        case 'WEAPON_SWORD':   return '近接斬撃\n広範囲・貫通';
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
        ctx.fillText('PRESS SPACE TO PLAY AGAIN', canvas.width/2, 390);
    }
    ctx.textAlign='left';
}

// ============================================================
//  ゲーム制御
// ============================================================
function startGame() {
    score=0; currentLevelIdx=0;
    lives=5;
    player.hp=100; player.maxHp=100;
    player.weapon='PISTOL';
    player.upgrades={multiShot:1, fireRate:1.0, bulletSize:1.0, moveSpeed:1.0, jumpPower:1.0};
    pickupTexts=[]; enemyBullets=[];
    loadLevel(0); // loadLevel will set state=READY and startBGM
}
function resetGame() { stopBGM(); startGame(); }

// ============================================================
//  メインループ
// ============================================================
function update() {
    if (state===S.READY) {
        readyTimer--;
        if (readyTimer<=0) state=S.PLAY;
        return;
    }
    if (state!==S.PLAY) return;
    updatePlayer();
    for (const e of enemies) if (e.alive) e.update();
    updateBullets();
    // 敵弾更新
    for (const eb of enemyBullets) if (eb.alive) eb.update();
    enemyBullets = enemyBullets.filter(b=>b.alive);
    for (const it of items) if (!it.collected) it.update();
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
        drawGoal();
        for (const e of enemies) e.draw(cameraX);
        drawPlayer();
        drawHUD();
        drawReady();
    } else if (state===S.PLAY) {
        drawBackground();
        drawTiles();
        drawGoal();
        for (const e of enemies) e.draw(cameraX);
        for (const it of items)  it.draw(cameraX);
        for (const b of bullets) b.draw(cameraX);
        for (const eb of enemyBullets) eb.draw(cameraX);
        for (const p of particles) p.draw(cameraX);
        drawPlayer();
        drawPickupTexts(cameraX);
        drawHUD();
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
    }
    ctx.restore();
}

function loop() { update(); draw(); requestAnimationFrame(loop); }
loop();
