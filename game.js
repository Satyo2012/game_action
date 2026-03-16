// ============================================================
//  DARK ABYSS  ─  ダーク プラットフォーム シューター
//  WASD: 移動  |  マウス: 照準  |  クリック: 射撃
//  敵の上から踏みつけても倒せる
// ============================================================

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
canvas.width  = 960;
canvas.height = 540;

// ---- 定数 ----
const GRAVITY     = 0.55;
const FRICTION    = 0.78;
const MOVE_SPEED  = 0.65;   // 遅めに
const JUMP_FORCE  = -12.5;
const TILE        = 40;
const COLS        = Math.ceil(canvas.width  / TILE);
const ROWS        = Math.ceil(canvas.height / TILE);

// ---- ゲーム状態 ----
const S = { TITLE:'title', PLAY:'play', OVER:'over', CLEAR:'clear' };
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

// ---- マウス ----
const mouse = { x: canvas.width/2, y: canvas.height/2, down: false };
canvas.addEventListener('mousemove', e => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) * (canvas.width  / r.width);
    mouse.y = (e.clientY - r.top)  * (canvas.height / r.height);
});
canvas.addEventListener('mousedown', e => { if (e.button === 0) mouse.down = true; });
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouse.down = false; });

// ---- キー ----
const keys = {};
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (['Space','ArrowUp','ArrowDown'].includes(e.code)) e.preventDefault();
    if (state === S.TITLE && e.code === 'Space') startGame();
    if (state === S.OVER  && e.code === 'Space') resetGame();
    if (state === S.CLEAR && e.code === 'Space') resetGame();
});
window.addEventListener('keyup', e => keys[e.code] = false);

// ============================================================
//  武器定義
// ============================================================
const WEAPONS = {
    PISTOL:  { name:'ピストル',   dmg:28,  cd:12, spd:14, spread:0.04, color:'#00e5ff', glow:'#003344', pellets:1, piercing:false, bouncing:false, explosive:false },
    SHOTGUN: { name:'ショットガン',dmg:45,  cd:38, spd:10, spread:0.25, color:'#ff6a00', glow:'#332000', pellets:6, piercing:false, bouncing:false, explosive:false },
    SMG:     { name:'SMG',        dmg:14,  cd:4,  spd:16, spread:0.11, color:'#00ff88', glow:'#003322', pellets:1, piercing:false, bouncing:false, explosive:false },
    SNIPER:  { name:'スナイパー', dmg:200, cd:50, spd:22, spread:0.00, color:'#ff00ff', glow:'#220033', pellets:1, piercing:true,  bouncing:false, explosive:false },
    PLASMA:  { name:'プラズマ',   dmg:70,  cd:25, spd:9,  spread:0.09, color:'#aa00ff', glow:'#110022', pellets:1, piercing:false, bouncing:true,  explosive:true,  explodeR:65 },
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
    upgrades:{ multiShot:1, fireRate:1.0, bulletSize:1.0 },
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
        // トレイル
        for (let i = 0; i < this.trail.length; i++) {
            const a = (i / this.trail.length) * 0.5;
            ctx.globalAlpha = a;
            ctx.fillStyle = this.color;
            const r = this.size * (i / this.trail.length) * 0.7;
            ctx.beginPath();
            ctx.arc(this.trail[i].x - camX, this.trail[i].y, r, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur  = 18;
        ctx.shadowColor = this.color;
        ctx.fillStyle   = this.color;
        ctx.beginPath();
        ctx.arc(sx, this.y, this.size, 0, Math.PI*2);
        ctx.fill();
        // 中心白点
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(sx, this.y, this.size * 0.35, 0, Math.PI*2);
        ctx.fill();
        ctx.shadowBlur = 0;
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
        ctx.fillStyle   = this.color;
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y, this.size * a, 0, Math.PI*2);
        ctx.fill();
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
    WEAPON_SHOTGUN: { label:'ショットガン', color:'#ff6a00', icon:'S' },
    WEAPON_SMG:     { label:'SMG',         color:'#00ff88', icon:'M' },
    WEAPON_SNIPER:  { label:'スナイパー',   color:'#ff00ff', icon:'N' },
    WEAPON_PLASMA:  { label:'プラズマ',    color:'#aa00ff', icon:'P' },
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
        const hover = Math.sin(this.t)*5;
        ctx.shadowBlur  = 20;
        ctx.shadowColor = d.color;
        ctx.strokeStyle = d.color;
        ctx.fillStyle   = 'rgba(0,0,0,0.85)';
        ctx.lineWidth   = 2;
        ctx.fillRect  (sx - 15, this.y - 15 + hover, 30, 30);
        ctx.strokeRect(sx - 15, this.y - 15 + hover, 30, 30);
        ctx.fillStyle   = d.color;
        ctx.font        = 'bold 14px monospace';
        ctx.textAlign   = 'center';
        ctx.fillText(d.icon, sx, this.y + 5 + hover);
        ctx.textAlign   = 'left';
        ctx.shadowBlur  = 0;
    }
    applyTo() {
        const t = this.type;
        if      (t === 'MULTISHOT')  player.upgrades.multiShot   = Math.min(player.upgrades.multiShot + 1, 9);
        else if (t === 'FIRERATE')   player.upgrades.fireRate     = Math.min(player.upgrades.fireRate  * 1.35, 6);
        else if (t === 'BULLETSIZE') player.upgrades.bulletSize   = Math.min(player.upgrades.bulletSize* 1.4, 5);
        else if (t.startsWith('WEAPON_')) player.weapon = t.replace('WEAPON_','');
        this.collected = true;
        spawnParticles(this.x, this.y, ITEM_DEFS[t].color, 14, 4);
        showPickupText(ITEM_DEFS[t].label, ITEM_DEFS[t].color);
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
    }
    rect() { return {x:this.x,y:this.y,w:this.w,h:this.h}; }
    takeDamage(dmg) {
        this.hp -= dmg;
        shakeAmt = Math.max(shakeAmt, 3);
        spawnParticles(this.x+this.w/2, this.y+this.h/2, '#cc0000', 5, 3);
        if (this.hp <= 0) this.die();
    }
    die() {
        this.alive = false;
        score += this.scoreVal || 100;
        spawnParticles(this.x+this.w/2, this.y+this.h/2, this.color, 18, 5);
        spawnParticles(this.x+this.w/2, this.y+this.h/2, '#660000', 12, 4);
        shakeAmt = Math.max(shakeAmt, 6);
        if (Math.random() < this.dropRate) this._dropItem();
    }
    _dropItem() {
        const pool = ['MULTISHOT','FIRERATE','BULLETSIZE','WEAPON_SHOTGUN','WEAPON_SMG','WEAPON_SNIPER','WEAPON_PLASMA'];
        const weights= [35, 30, 25, 3, 3, 2, 2];
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
        const sx = this.x - camX;
        const bw = this.w;
        ctx.fillStyle = '#330000';
        ctx.fillRect(sx, this.y - 8, bw, 4);
        ctx.fillStyle = '#cc0000';
        ctx.fillRect(sx, this.y - 8, bw * (this.hp/this.maxHp), 4);
    }
}

// ゾンビ（低速・壁で折り返し）
class Zombie extends Enemy {
    constructor(x, y) {
        super(x, y, 30, 40, 60, 1.2, '#4a0e0e', 0.5);
        this.vx = (Math.random()<0.5?1:-1)*this.spd;
        this.scoreVal = 120;
    }
    update() {
        this.t++;
        this._applyGravity();
        this._moveX();
        this._moveY();
        // プレイヤー方向に少し引き寄せ
        const dx = player.x - this.x;
        this.vx += Math.sign(dx) * 0.04;
        this.vx = Math.max(-this.spd, Math.min(this.spd, this.vx));
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = this.x - camX;
        const bob = Math.sin(this.t*0.12)*2;
        ctx.shadowBlur = 8; ctx.shadowColor = '#660000';
        // 体
        ctx.fillStyle = '#1a0505';
        ctx.fillRect(sx, this.y + bob, this.w, this.h);
        // 目
        ctx.fillStyle = '#ff2200';
        ctx.shadowBlur = 12; ctx.shadowColor = '#ff2200';
        ctx.beginPath();
        ctx.arc(sx+8, this.y+10+bob, 4, 0, Math.PI*2); ctx.fill();
        ctx.beginPath();
        ctx.arc(sx+22, this.y+10+bob, 4, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        this._drawHpBar(camX);
    }
}

// シェード（高速・飛行）
class Shade extends Enemy {
    constructor(x, y) {
        super(x, y, 26, 26, 35, 2.5, '#2200aa', 0.4);
        this.scoreVal = 150;
        this.angle = 0;
    }
    update() {
        this.t++;
        const dx = player.x+player.w/2 - (this.x+this.w/2);
        const dy = player.y+player.h/2 - (this.y+this.h/2);
        const dist = Math.sqrt(dx*dx+dy*dy) || 1;
        this.vx += (dx/dist)*0.18;
        this.vy += (dy/dist)*0.18;
        const spd = Math.sqrt(this.vx*this.vx+this.vy*this.vy);
        if (spd > this.spd) { this.vx=this.vx/spd*this.spd; this.vy=this.vy/spd*this.spd; }
        this.x += this.vx; this.y += this.vy;
        this.angle = Math.atan2(this.vy, this.vx);
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = this.x + this.w/2 - camX;
        const sy = this.y + this.h/2;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle);
        ctx.shadowBlur = 14; ctx.shadowColor = '#4400cc';
        ctx.fillStyle = '#0d0022';
        // 菱形
        ctx.beginPath();
        ctx.moveTo(18,0); ctx.lineTo(0,-10); ctx.lineTo(-10,0); ctx.lineTo(0,10);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#6600ff'; ctx.lineWidth = 1.5;
        ctx.stroke();
        // 目
        ctx.fillStyle = '#aa00ff';
        ctx.shadowBlur = 10; ctx.shadowColor = '#aa00ff';
        ctx.beginPath();
        ctx.arc(6, -2, 3, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
        this._drawHpBar(camX);
    }
}

// デーモン（巨大・高耐久・確定ドロップ）
class Demon extends Enemy {
    constructor(x, y) {
        super(x, y, 48, 56, 350, 0.8, '#880000', 1.0);
        this.vx = (Math.random()<0.5?1:-1)*this.spd;
        this.scoreVal = 600;
    }
    update() {
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
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = this.x - camX;
        const bob = Math.sin(this.t*0.08)*3;
        ctx.shadowBlur = 16; ctx.shadowColor = '#ff0000';
        // 体
        ctx.fillStyle = '#1a0000';
        ctx.fillRect(sx, this.y+bob, this.w, this.h);
        // 角
        ctx.fillStyle = '#330000';
        ctx.beginPath();
        ctx.moveTo(sx+8, this.y+bob); ctx.lineTo(sx, this.y-14+bob); ctx.lineTo(sx+16, this.y+bob);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sx+this.w-8, this.y+bob); ctx.lineTo(sx+this.w, this.y-14+bob); ctx.lineTo(sx+this.w-16, this.y+bob);
        ctx.fill();
        // 目
        ctx.fillStyle = '#ff3300';
        ctx.shadowBlur = 20; ctx.shadowColor = '#ff3300';
        ctx.beginPath();
        ctx.arc(sx+14, this.y+16+bob, 6, 0, Math.PI*2); ctx.fill();
        ctx.beginPath();
        ctx.arc(sx+34, this.y+16+bob, 6, 0, Math.PI*2); ctx.fill();
        // 牙
        ctx.fillStyle = '#ccc';
        ctx.shadowBlur = 0;
        for (let i=0;i<4;i++) {
            ctx.beginPath();
            ctx.moveTo(sx+8+i*9, this.y+this.h+bob);
            ctx.lineTo(sx+12+i*9, this.y+this.h+10+bob);
            ctx.lineTo(sx+16+i*9, this.y+this.h+bob);
            ctx.fill();
        }
        ctx.shadowBlur = 0;
        this._drawHpBar(camX);
    }
}

// スポーナー（固定・周期的に雑魚召喚）
class Spawner extends Enemy {
    constructor(x, y) {
        super(x, y, 36, 36, 180, 0, '#330022', 0.8);
        this.spawnCd = 0;
        this.scoreVal = 300;
    }
    update() {
        this.t++;
        this.spawnCd--;
        if (this.spawnCd <= 0) {
            this.spawnCd = 200;
            if (enemies.length < 30) {
                enemies.push(new Shade(this.x + (Math.random()-0.5)*60, this.y - 20));
            }
        }
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = this.x - camX;
        const pulse = Math.sin(this.t*0.1)*4;
        ctx.shadowBlur = 18; ctx.shadowColor = '#aa00ff';
        ctx.strokeStyle = '#880055';
        ctx.fillStyle   = '#0d000d';
        ctx.lineWidth   = 2;
        ctx.beginPath();
        ctx.arc(sx+18, this.y+18, 18+pulse, 0, Math.PI*2);
        ctx.fill(); ctx.stroke();
        // 内側の記号
        ctx.fillStyle = '#cc00aa';
        ctx.font = 'bold 18px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✦', sx+18, this.y+24);
        ctx.textAlign = 'left';
        ctx.shadowBlur = 0;
        this._drawHpBar(camX);
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
const LEVELS = [
    {
        name:'廃墟の地下',
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
            fillRow(m, ROWS-1, 0, w,   1);
            fillRow(m, ROWS-2, 0, w,   1);
            // 穴
            for (const [s,l] of [[10,3],[22,4],[36,3],[46,3]]) clearCols(m,s,l,ROWS-2,ROWS);
            // 浮遊床
            platf(m, [[7,ROWS-5,4],[14,ROWS-6,3],[23,ROWS-5,4],[29,ROWS-4,3],[38,ROWS-5,3],[43,ROWS-6,4],[52,ROWS-5,3]]);
            // 階段
            for (let i=0;i<5;i++) for(let j=0;j<=i;j++) set(m,55+i,ROWS-3-j,2);
            setGoal(m, w-3, ROWS-3);
            return m;
        }
    },
    {
        name:'呪われた塔',
        bg1:'#050008', bg2:'#10001a',
        width:75,
        enemySpawns: [
            {type:'zombie', col:8,  row:ROWS-3},{type:'zombie',col:12,row:ROWS-3},
            {type:'shade',  col:18, row:ROWS-7},{type:'shade', col:25,row:ROWS-8},
            {type:'zombie', col:32, row:ROWS-3},{type:'demon', col:40,row:ROWS-3},
            {type:'shade',  col:48, row:ROWS-6},{type:'spawner',col:55,row:ROWS-3},
            {type:'demon',  col:65, row:ROWS-3},{type:'shade', col:60,row:ROWS-7},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, w, 1);
            fillRow(m, ROWS-2, 0, w, 1);
            for (const [s,l] of [[8,4],[20,5],[34,4],[50,5],[62,3]]) clearCols(m,s,l,ROWS-2,ROWS);
            platf(m,[
                [5,ROWS-5,3],[10,ROWS-7,3],[16,ROWS-5,4],[23,ROWS-8,3],[28,ROWS-5,4],
                [35,ROWS-6,2],[40,ROWS-4,3],[45,ROWS-7,3],[51,ROWS-5,4],[58,ROWS-6,3],[65,ROWS-4,4]
            ]);
            // 縦の柱
            for (let j=0;j<5;j++) set(m,30,ROWS-3-j,2);
            for (let j=0;j<4;j++) set(m,52,ROWS-3-j,2);
            setGoal(m, w-3, ROWS-3);
            return m;
        }
    },
    {
        name:'奈落の深淵',
        bg1:'#000005', bg2:'#080014',
        width:90,
        enemySpawns: [
            {type:'zombie',col:6,row:ROWS-3},{type:'shade',col:10,row:ROWS-6},
            {type:'demon',col:18,row:ROWS-3},{type:'zombie',col:24,row:ROWS-3},
            {type:'shade',col:28,row:ROWS-7},{type:'spawner',col:35,row:ROWS-3},
            {type:'demon',col:45,row:ROWS-3},{type:'shade',col:50,row:ROWS-6},
            {type:'spawner',col:58,row:ROWS-3},{type:'zombie',col:65,row:ROWS-3},
            {type:'demon',col:72,row:ROWS-3},{type:'shade',col:76,row:ROWS-8},
            {type:'demon',col:82,row:ROWS-3},{type:'spawner',col:86,row:ROWS-3},
        ],
        generate(w) {
            const m = blank(w, ROWS);
            fillRow(m, ROWS-1, 0, 8,  1); fillRow(m, ROWS-2, 0, 8, 1);
            fillRow(m, ROWS-1, w-8, w, 1); fillRow(m, ROWS-2, w-8, w, 1);
            // 空中プラットフォーム群
            let px=10;
            const rng = (a,b)=>a+Math.floor((b-a+1)*( (px*137+wave*31)%(b-a+1) )/(b-a+1) );
            for (let i=0;i<22;i++) {
                const y = ROWS-3-Math.floor(Math.random()*7);
                const ww= 2+Math.floor(Math.random()*4);
                for (let j=0;j<ww;j++) set(m,px+j,y,2);
                px += ww + 2 + Math.floor(Math.random()*2);
                if (px >= w-6) break;
            }
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
    if (idx >= LEVELS.length) { state=S.CLEAR; return; }
    currentLevelIdx = idx;
    const lvl = LEVELS[idx];
    levelMap = lvl.generate(lvl.width);

    enemies=[]; items=[]; bullets=[]; particles=[]; goal=null;

    // ゴール
    for (let r=0; r<levelMap.length; r++) for (let c=0; c<levelMap[r].length; c++) {
        if (levelMap[r][c]===5) {
            goal = {x:c*TILE, y:r*TILE - TILE*2, w:TILE, h:TILE*3, t:0};
            levelMap[r][c]=0;
        }
    }
    // 敵スポーン
    for (const sp of lvl.enemySpawns) {
        const ex = sp.col*TILE, ey = sp.row*TILE;
        if      (sp.type==='zombie')  enemies.push(new Zombie (ex, ey));
        else if (sp.type==='shade')   enemies.push(new Shade  (ex, ey));
        else if (sp.type==='demon')   enemies.push(new Demon  (ex, ey));
        else if (sp.type==='spawner') enemies.push(new Spawner(ex, ey));
    }

    player.x=80; player.y=100; player.vx=0; player.vy=0; player.onGround=false;
    player.invincible=0;
    cameraX=0;
}

// ============================================================
//  プレイヤー更新
// ============================================================
function updatePlayer() {
    // 移動
    if (keys['KeyA']||keys['ArrowLeft'])  player.vx -= MOVE_SPEED;
    if (keys['KeyD']||keys['ArrowRight']) player.vx += MOVE_SPEED;
    // ジャンプ
    if ((keys['KeyW']||keys['ArrowUp']||keys['Space']) && player.onGround) {
        player.vy = JUMP_FORCE;
        spawnParticles(player.x+player.w/2, player.y+player.h, '#444', 6, 2);
    }
    player.vy += GRAVITY;
    player.vx *= FRICTION;
    player.vx = Math.max(-7, Math.min(7, player.vx));
    player.vy = Math.max(-15, Math.min(15, player.vy));

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

    // 敵との当たり判定
    for (const e of enemies) {
        if (!e.alive) continue;
        if (!rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, e.rect())) continue;
        // 踏みつけ判定
        if (player.vy>1 && player.y+player.h < e.y+e.h*0.5+8) {
            e.takeDamage(e.maxHp); // 即死
            player.vy = JUMP_FORCE*0.65;
            score += 50;
            shakeAmt = 7;
        } else if (player.invincible<=0) {
            playerHit(25);
        }
    }

    // アイテム取得
    for (const it of items) {
        if (it.collected) continue;
        if (rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h},{x:it.x-15,y:it.y-15,w:30,h:30}))
            it.applyTo();
    }

    // ゴール
    if (goal && rectsOverlap({x:player.x,y:player.y,w:player.w,h:player.h}, goal)) {
        score += 500;
        currentLevelIdx++;
        if (currentLevelIdx >= LEVELS.length) state=S.CLEAR;
        else { spawnParticles(player.x+player.w/2,player.y,'#f1c40f',20,5); loadLevel(currentLevelIdx); }
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
    if (player.hp<=0) { player.hp=0; state=S.OVER; }
}

// ============================================================
//  射撃
// ============================================================
function fireWeapon() {
    const W   = WEAPONS[player.weapon];
    const up  = player.upgrades;
    const cd  = Math.max(1, W.cd / up.fireRate | 0);
    player.fireCd = cd;

    const pellets  = (W.pellets||1) + (player.weapon==='SHOTGUN' ? up.multiShot-1 : 0);
    const multiCnt = player.weapon==='SHOTGUN' ? pellets : up.multiShot;

    const ox = player.x + player.w/2;
    const oy = player.y + player.h/2;
    const tx = mouse.x + cameraX;
    const ty = mouse.y;
    const base = Math.atan2(ty-oy, tx-ox);

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
    const lvl = LEVELS[currentLevelIdx];
    const g = ctx.createLinearGradient(0,0,0,canvas.height);
    g.addColorStop(0, lvl.bg1);
    g.addColorStop(1, lvl.bg2);
    ctx.fillStyle=g;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // 遠景霧
    ctx.fillStyle='rgba(60,0,80,0.06)';
    for (let i=0;i<6;i++) {
        const ox=(cameraX*0.15+i*200)%(canvas.width+400)-200;
        ctx.beginPath();
        ctx.ellipse(ox, canvas.height-60, 120, 50, 0, 0, Math.PI*2);
        ctx.fill();
    }

    // 背景の瞳
    ctx.fillStyle='rgba(120,0,0,0.15)';
    ctx.shadowBlur=20; ctx.shadowColor='#440000';
    for (let i=0;i<12;i++) {
        const bx=((i*157+50)%(canvas.width+300))-150 - cameraX*0.05%300;
        const by=(i*113+40)%canvas.height;
        ctx.beginPath();
        ctx.arc(bx,by,2.5,0,Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur=0;
}

function drawTiles() {
    const s0=Math.floor(cameraX/TILE), s1=s0+COLS+2;
    for (let r=0;r<levelMap.length;r++) {
        for (let c=s0;c<=s1&&c<(levelMap[r]||[]).length;c++) {
            if (c<0) continue;
            const v=levelMap[r][c]; if (!v) continue;
            const sx=c*TILE-cameraX, sy=r*TILE;
            if (v===1) {
                ctx.fillStyle='#0a0012'; ctx.fillRect(sx,sy,TILE,TILE);
                ctx.fillStyle='#1a0028'; ctx.fillRect(sx+1,sy+1,TILE-2,TILE-2);
                if (r>0&&levelMap[r-1][c]===0) {
                    // 上面に赤いライン
                    ctx.fillStyle='#550022'; ctx.fillRect(sx,sy,TILE,3);
                    ctx.shadowBlur=6; ctx.shadowColor='#aa0044';
                    ctx.fillStyle='#330011'; ctx.fillRect(sx,sy,TILE,2);
                    ctx.shadowBlur=0;
                }
            } else if (v===2) {
                ctx.fillStyle='#080010'; ctx.fillRect(sx,sy,TILE,TILE);
                ctx.fillStyle='#120018'; ctx.fillRect(sx+2,sy+2,TILE-4,TILE-4);
                ctx.strokeStyle='#220033'; ctx.lineWidth=1;
                ctx.strokeRect(sx+1,sy+1,TILE-2,TILE-2);
            }
        }
    }
}

function drawGoal() {
    if (!goal) return;
    goal.t += 0.03;
    const sx = goal.x - cameraX;
    if (sx < -60 || sx > canvas.width+60) return;
    ctx.shadowBlur=25; ctx.shadowColor='#ffcc00';
    // ポール
    ctx.fillStyle='#554400';
    ctx.fillRect(sx+TILE/2-3, goal.y, 6, goal.h);
    // 旗
    const w=Math.cos(goal.t*2)*4;
    ctx.fillStyle='#cc0000';
    ctx.beginPath();
    ctx.moveTo(sx+TILE/2+3, goal.y+4);
    ctx.lineTo(sx+TILE/2+36+w, goal.y+14);
    ctx.lineTo(sx+TILE/2+3, goal.y+28);
    ctx.fill();
    // 光
    ctx.fillStyle=`rgba(255,200,0,${0.2+Math.sin(goal.t*3)*0.15})`;
    ctx.beginPath();
    ctx.arc(sx+TILE/2, goal.y, 24, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;
}

function drawPlayer() {
    if (player.invincible>0 && Math.floor(player.invincible/4)%2===0) return;
    const sx = player.x - cameraX;
    const sy = player.y;
    ctx.save();
    ctx.translate(sx+player.w/2, sy+player.h/2);
    ctx.scale(player.facing, 1);
    const bob = player.onGround ? Math.sin(player.animTimer*2)*2 : (player.vy<0?-3:2);

    // 体（暗いシルエット）
    ctx.shadowBlur=10; ctx.shadowColor='#220033';
    ctx.fillStyle='#0d0011';
    ctx.fillRect(-player.w/2, -player.h/2+bob, player.w, player.h-4);

    // 外套（マント）
    ctx.fillStyle='#0a0008';
    ctx.beginPath();
    ctx.moveTo(-player.w/2-4, -player.h/2+4+bob);
    ctx.lineTo(player.w/2+4,  -player.h/2+4+bob);
    ctx.lineTo(player.w/2+8,   player.h/2+bob);
    ctx.lineTo(-player.w/2-8,  player.h/2+bob);
    ctx.closePath(); ctx.fill();

    // 光る目
    ctx.shadowBlur=16; ctx.shadowColor='#ff2200';
    ctx.fillStyle='#ff2200';
    ctx.beginPath();
    ctx.arc(6, -player.h/2+8+bob, 4, 0, Math.PI*2); ctx.fill();
    ctx.shadowBlur=0;

    // 銃の向き（マウスへ）
    const mx = mouse.x + cameraX;
    const my = mouse.y;
    const gunAngle = Math.atan2(my-(sy+player.h/2), mx-(sx+player.w/2)) * player.facing;
    ctx.rotate(gunAngle);
    const W = WEAPONS[player.weapon];
    ctx.shadowBlur=10; ctx.shadowColor=W.color;
    ctx.fillStyle=W.color;
    ctx.fillRect(8, -3, 18, 6);
    ctx.fillStyle='#222';
    ctx.fillRect(8, -2, 16, 4);
    ctx.shadowBlur=0;

    ctx.restore();
}

function drawHUD() {
    // HP バー
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(10,10,204,18);
    const hpRatio = player.hp/player.maxHp;
    const hpColor = hpRatio>0.5?'#cc0000': hpRatio>0.25?'#ff4400':'#ff0000';
    ctx.shadowBlur=8; ctx.shadowColor=hpColor;
    ctx.fillStyle=hpColor;
    ctx.fillRect(12,12,200*hpRatio,14);
    ctx.shadowBlur=0;
    ctx.strokeStyle='#440022'; ctx.lineWidth=1;
    ctx.strokeRect(10,10,204,18);
    ctx.fillStyle='#aaa'; ctx.font='11px monospace';
    ctx.fillText(`HP: ${player.hp|0}/${player.maxHp}`,14,23);

    // スコア
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(10,34,150,20);
    ctx.fillStyle='#cc8800'; ctx.font='bold 13px monospace';
    ctx.shadowBlur=6; ctx.shadowColor='#cc8800';
    ctx.fillText(`SCORE: ${score}`, 15, 49);
    ctx.shadowBlur=0;

    // 武器
    const W = WEAPONS[player.weapon];
    ctx.fillStyle='rgba(0,0,0,0.7)';
    ctx.fillRect(10,60,200,50);
    ctx.shadowBlur=10; ctx.shadowColor=W.color;
    ctx.strokeStyle=W.color; ctx.lineWidth=1;
    ctx.strokeRect(10,60,200,50);
    ctx.fillStyle=W.color; ctx.font='bold 13px monospace';
    ctx.fillText(`武器: ${W.name}`, 15, 77);
    ctx.fillStyle='#888'; ctx.font='11px monospace';
    ctx.fillText(`弾数×${player.upgrades.multiShot}  速射×${player.upgrades.fireRate.toFixed(1)}  弾サイズ×${player.upgrades.bulletSize.toFixed(1)}`, 15, 92);
    ctx.shadowBlur=0;

    // レベル
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(canvas.width/2-100,10,200,22);
    ctx.fillStyle='#aa44ff'; ctx.font='bold 13px monospace';
    ctx.textAlign='center';
    ctx.fillText(`STAGE ${currentLevelIdx+1}: ${LEVELS[currentLevelIdx].name}`, canvas.width/2, 26);
    ctx.textAlign='left';

    // 残り敵数
    const alive = enemies.filter(e=>e.alive).length;
    ctx.fillStyle='rgba(0,0,0,0.6)';
    ctx.fillRect(canvas.width-140,10,130,22);
    ctx.fillStyle='#ff4444'; ctx.font='13px monospace';
    ctx.fillText(`敵: ${alive}体`, canvas.width-135, 26);

    // 照準線
    drawCrosshair();
}

function drawCrosshair() {
    const mx=mouse.x, my=mouse.y;
    const W=WEAPONS[player.weapon];
    ctx.strokeStyle=W.color; ctx.lineWidth=1;
    ctx.shadowBlur=8; ctx.shadowColor=W.color;
    ctx.globalAlpha=0.8;
    ctx.beginPath();
    ctx.moveTo(mx-12,my); ctx.lineTo(mx-4,my);
    ctx.moveTo(mx+4,my);  ctx.lineTo(mx+12,my);
    ctx.moveTo(mx,my-12); ctx.lineTo(mx,my-4);
    ctx.moveTo(mx,my+4);  ctx.lineTo(mx,my+12);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(mx,my,4,0,Math.PI*2);
    ctx.stroke();
    ctx.globalAlpha=1; ctx.shadowBlur=0;
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
    // 背景の揺れる瞳
    for (let i=0;i<20;i++) {
        const tx=(i*137.5)%canvas.width;
        const ty=(i*97.3)%canvas.height;
        const a=Math.sin(titleT*0.02+i)*0.3+0.15;
        ctx.fillStyle=`rgba(200,0,0,${a})`;
        ctx.shadowBlur=15+Math.sin(titleT*0.05)*5;
        ctx.shadowColor='#ff0000';
        ctx.beginPath();
        ctx.arc(tx,ty,3,0,Math.PI*2); ctx.fill();
    }
    ctx.shadowBlur=0;
    // 霧
    const g=ctx.createRadialGradient(canvas.width/2,canvas.height/2,50,canvas.width/2,canvas.height/2,350);
    g.addColorStop(0,'rgba(40,0,60,0.4)');
    g.addColorStop(1,'rgba(0,0,0,0.0)');
    ctx.fillStyle=g; ctx.fillRect(0,0,canvas.width,canvas.height);
    // タイトル
    ctx.textAlign='center';
    ctx.shadowBlur=40; ctx.shadowColor='#aa00ff';
    ctx.fillStyle='#cc00ff';
    ctx.font='bold 72px monospace';
    ctx.fillText('DARK ABYSS', canvas.width/2, 180);
    ctx.shadowBlur=20; ctx.shadowColor='#ff0000';
    ctx.fillStyle='#ff3333';
    ctx.font='22px monospace';
    ctx.fillText('─ 深淵を走れ ─', canvas.width/2, 225);
    ctx.shadowBlur=0;
    // 操作説明
    ctx.fillStyle='#664466'; ctx.font='15px monospace';
    ctx.fillText('WASD / ←→ : 移動    W/↑/Space : ジャンプ', canvas.width/2, 310);
    ctx.fillText('マウス : 照準    クリック : 射撃', canvas.width/2, 340);
    ctx.fillText('敵の上に乗って踏みつけることもできる', canvas.width/2, 370);
    ctx.fillText('アイテムを拾って武器を強化しよう！', canvas.width/2, 395);
    const blink = Math.sin(titleT*0.08)>0;
    if (blink) {
        ctx.shadowBlur=14; ctx.shadowColor='#ff6600';
        ctx.fillStyle='#ff8800'; ctx.font='bold 22px monospace';
        ctx.fillText('SPACE でゲームスタート', canvas.width/2, 455);
        ctx.shadowBlur=0;
    }
    ctx.textAlign='left';
}

function drawGameOver() {
    ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center';
    ctx.shadowBlur=30; ctx.shadowColor='#ff0000';
    ctx.fillStyle='#cc0000'; ctx.font='bold 64px monospace';
    ctx.fillText('YOU DIED', canvas.width/2, 210);
    ctx.shadowBlur=0;
    ctx.fillStyle='#888'; ctx.font='22px monospace';
    ctx.fillText(`スコア: ${score}`, canvas.width/2, 280);
    ctx.fillStyle='#555'; ctx.font='16px monospace';
    ctx.fillText(`武器: ${WEAPONS[player.weapon].name}  |  弾数×${player.upgrades.multiShot}  速射×${player.upgrades.fireRate.toFixed(1)}`, canvas.width/2, 320);
    const blink=Math.sin(Date.now()*0.006)>0;
    if (blink) { ctx.fillStyle='#cc6600'; ctx.font='20px monospace'; ctx.fillText('SPACE でリトライ', canvas.width/2, 390); }
    ctx.textAlign='left';
}

function drawClear() {
    ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.textAlign='center';
    ctx.shadowBlur=30; ctx.shadowColor='#ffcc00';
    ctx.fillStyle='#ffcc00'; ctx.font='bold 60px monospace';
    ctx.fillText('ALL CLEARED', canvas.width/2, 200);
    ctx.shadowBlur=0;
    ctx.fillStyle='#aaa'; ctx.font='24px monospace';
    ctx.fillText(`最終スコア: ${score}`, canvas.width/2, 270);
    ctx.fillStyle='#66aa66'; ctx.font='18px monospace';
    ctx.fillText('深淵より生還せり…', canvas.width/2, 315);
    const blink=Math.sin(Date.now()*0.006)>0;
    if (blink) { ctx.fillStyle='#ffaa00'; ctx.font='20px monospace'; ctx.fillText('SPACE でもう一度', canvas.width/2, 400); }
    ctx.textAlign='left';
}

// ============================================================
//  ゲーム制御
// ============================================================
function startGame() {
    score=0; currentLevelIdx=0;
    player.hp=player.maxHp;
    player.weapon='PISTOL';
    player.upgrades={multiShot:1, fireRate:1.0, bulletSize:1.0};
    pickupTexts=[];
    loadLevel(0);
    state=S.PLAY;
}
function resetGame() { startGame(); }

// ============================================================
//  メインループ
// ============================================================
function update() {
    if (state!==S.PLAY) return;
    updatePlayer();
    for (const e of enemies) if (e.alive) e.update();
    updateBullets();
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
    } else if (state===S.PLAY) {
        drawBackground();
        drawTiles();
        drawGoal();
        for (const e of enemies) e.draw(cameraX);
        for (const it of items)  it.draw(cameraX);
        for (const b of bullets) b.draw(cameraX);
        for (const p of particles) p.draw(cameraX);
        drawPlayer();
        drawPickupTexts(cameraX);
        drawHUD();
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
