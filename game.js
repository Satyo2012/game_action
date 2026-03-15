// ========================================
// Sky Runner - プラットフォーマーゲーム
// ========================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 960;
canvas.height = 540;

// ---- 定数 ----
const GRAVITY = 0.6;
const FRICTION = 0.85;
const PLAYER_SPEED = 1.2;
const JUMP_FORCE = -13;
const TILE = 40;
const COLS = Math.ceil(canvas.width / TILE);
const ROWS = Math.ceil(canvas.height / TILE);

// ---- ゲーム状態 ----
const STATE = {
    TITLE: 'title',
    PLAYING: 'playing',
    GAMEOVER: 'gameover',
    CLEAR: 'clear',
};

let gameState = STATE.TITLE;
let score = 0;
let currentLevel = 0;
let lives = 3;
let cameraX = 0;
let particles = [];
let screenShake = 0;

// ---- 入力管理 ----
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        e.preventDefault();
    }
    if (gameState === STATE.TITLE && e.code === 'Space') {
        startGame();
    }
    if (gameState === STATE.GAMEOVER && e.code === 'Space') {
        resetGame();
    }
    if (gameState === STATE.CLEAR && e.code === 'Space') {
        nextLevel();
    }
});
window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
});

// ---- レベルデータ ----
// 0=空, 1=地面, 2=ブロック, 3=コイン, 4=スパイク, 5=ゴール, 6=移動床, 7=敵
const levels = [
    // レベル1: チュートリアル
    {
        width: 60,
        name: 'はじめの谷',
        bg: { top: '#0f0c29', bottom: '#302b63' },
        generate() {
            const map = createEmptyMap(this.width, ROWS);
            // 地面
            fillRow(map, ROWS - 1, 0, this.width, 1);
            fillRow(map, ROWS - 2, 0, this.width, 1);
            // 穴
            clearCol(map, 12, ROWS - 2, ROWS);
            clearCol(map, 13, ROWS - 2, ROWS);
            clearCol(map, 25, ROWS - 2, ROWS);
            clearCol(map, 26, ROWS - 2, ROWS);
            clearCol(map, 27, ROWS - 2, ROWS);
            // 浮遊ブロック
            setTile(map, 8, ROWS - 5, 2);
            setTile(map, 9, ROWS - 5, 2);
            setTile(map, 15, ROWS - 5, 2);
            setTile(map, 16, ROWS - 5, 2);
            setTile(map, 17, ROWS - 5, 2);
            setTile(map, 22, ROWS - 4, 2);
            setTile(map, 23, ROWS - 4, 2);
            setTile(map, 29, ROWS - 5, 2);
            setTile(map, 30, ROWS - 5, 2);
            // 階段
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j <= i; j++) {
                    setTile(map, 35 + i, ROWS - 3 - j, 2);
                }
            }
            // コイン
            setTile(map, 8, ROWS - 6, 3);
            setTile(map, 9, ROWS - 6, 3);
            setTile(map, 15, ROWS - 6, 3);
            setTile(map, 16, ROWS - 6, 3);
            setTile(map, 22, ROWS - 5, 3);
            setTile(map, 30, ROWS - 6, 3);
            setTile(map, 42, ROWS - 3, 3);
            setTile(map, 43, ROWS - 3, 3);
            setTile(map, 44, ROWS - 3, 3);
            // スパイク
            setTile(map, 45, ROWS - 3, 4);
            setTile(map, 46, ROWS - 3, 4);
            // 敵
            setTile(map, 20, ROWS - 3, 7);
            setTile(map, 40, ROWS - 3, 7);
            // ゴール
            setTile(map, this.width - 3, ROWS - 3, 5);
            return map;
        },
    },
    // レベル2: 挑戦
    {
        width: 80,
        name: '危険な遺跡',
        bg: { top: '#1a0a2e', bottom: '#5b2c6f' },
        generate() {
            const map = createEmptyMap(this.width, ROWS);
            // 地面（穴あき）
            fillRow(map, ROWS - 1, 0, this.width, 1);
            fillRow(map, ROWS - 2, 0, this.width, 1);
            // 大きな穴
            for (const start of [10, 22, 38, 52, 65]) {
                const w = 3 + Math.floor(Math.random() * 2);
                for (let i = 0; i < w; i++) {
                    clearCol(map, start + i, ROWS - 2, ROWS);
                }
            }
            // 浮遊プラットフォーム
            const platforms = [
                [11, ROWS - 5, 3], [23, ROWS - 6, 3], [30, ROWS - 4, 2],
                [39, ROWS - 5, 4], [48, ROWS - 6, 2], [53, ROWS - 5, 3],
                [60, ROWS - 7, 2], [66, ROWS - 5, 3], [72, ROWS - 4, 2],
            ];
            for (const [x, y, w] of platforms) {
                for (let i = 0; i < w; i++) setTile(map, x + i, y, 2);
            }
            // コイン
            for (const [x, y, w] of platforms) {
                for (let i = 0; i < w; i++) setTile(map, x + i, y - 1, 3);
            }
            // スパイク
            for (const x of [18, 19, 34, 35, 49, 50, 62, 63]) {
                setTile(map, x, ROWS - 3, 4);
            }
            // 敵
            for (const x of [15, 28, 42, 55, 70]) {
                setTile(map, x, ROWS - 3, 7);
            }
            // ゴール
            setTile(map, this.width - 3, ROWS - 3, 5);
            return map;
        },
    },
    // レベル3: 最終
    {
        width: 100,
        name: '天空の城',
        bg: { top: '#0d1b2a', bottom: '#1b4332' },
        generate() {
            const map = createEmptyMap(this.width, ROWS);
            // 地面（断続的）
            fillRow(map, ROWS - 1, 0, 8, 1);
            fillRow(map, ROWS - 2, 0, 8, 1);
            // 空中ステージ - 地面が少ない
            const platforms = [];
            let px = 10;
            for (let i = 0; i < 25; i++) {
                const y = ROWS - 3 - Math.floor(Math.random() * 6);
                const w = 2 + Math.floor(Math.random() * 3);
                platforms.push([px, y, w]);
                for (let j = 0; j < w; j++) setTile(map, px + j, y, 2);
                px += w + 2 + Math.floor(Math.random() * 2);
            }
            // コイン（交互に配置）
            for (let i = 0; i < platforms.length; i += 2) {
                const [x, y, w] = platforms[i];
                for (let j = 0; j < w; j++) setTile(map, x + j, y - 1, 3);
            }
            // スパイク（一部のプラットフォーム上）
            for (let i = 1; i < platforms.length; i += 4) {
                const [x, y] = platforms[i];
                setTile(map, x, y - 1, 4);
            }
            // 敵
            for (let i = 2; i < platforms.length; i += 3) {
                const [x, y, w] = platforms[i];
                if (w >= 3) setTile(map, x + 1, y - 1, 7);
            }
            // ゴールエリア
            fillRow(map, ROWS - 1, this.width - 6, this.width, 1);
            fillRow(map, ROWS - 2, this.width - 6, this.width, 1);
            setTile(map, this.width - 3, ROWS - 3, 5);
            return map;
        },
    },
];

// ---- マップヘルパー ----
function createEmptyMap(w, h) {
    return Array.from({ length: h }, () => Array(w).fill(0));
}
function fillRow(map, row, from, to, val) {
    for (let i = from; i < to && i < map[0].length; i++) map[row][i] = val;
}
function clearCol(map, col, fromRow, toRow) {
    for (let r = fromRow; r < toRow && r < map.length; r++) map[r][col] = 0;
}
function setTile(map, x, y, val) {
    if (y >= 0 && y < map.length && x >= 0 && x < map[0].length) map[y][x] = val;
}

// ---- プレイヤー ----
const player = {
    x: 80,
    y: 0,
    w: 28,
    h: 36,
    vx: 0,
    vy: 0,
    onGround: false,
    jumping: false,
    facing: 1,
    animFrame: 0,
    animTimer: 0,
    invincible: 0,
    wallSliding: false,
};

// ---- 敵クラス ----
let enemies = [];
class Enemy {
    constructor(x, y) {
        this.x = x * TILE + 4;
        this.y = y * TILE;
        this.w = 32;
        this.h = 32;
        this.vx = 1.5;
        this.startX = this.x;
        this.range = TILE * 3;
        this.alive = true;
        this.animTimer = 0;
    }
    update() {
        if (!this.alive) return;
        this.x += this.vx;
        if (this.x < this.startX - this.range || this.x > this.startX + this.range) {
            this.vx *= -1;
        }
        this.animTimer += 0.05;
    }
    draw(camX) {
        if (!this.alive) return;
        const sx = this.x - camX;
        if (sx < -TILE || sx > canvas.width + TILE) return;
        const bounce = Math.sin(this.animTimer * 3) * 2;
        // 体
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.arc(sx + this.w / 2, this.y + this.h / 2 + bounce, this.w / 2, 0, Math.PI * 2);
        ctx.fill();
        // 目
        ctx.fillStyle = '#fff';
        const eyeDir = this.vx > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.arc(sx + this.w / 2 + eyeDir * 5, this.y + this.h / 2 - 4 + bounce, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(sx + this.w / 2 + eyeDir * 7, this.y + this.h / 2 - 4 + bounce, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // 怒り眉毛
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx + this.w / 2 - 8, this.y + this.h / 2 - 12 + bounce);
        ctx.lineTo(sx + this.w / 2 + 2, this.y + this.h / 2 - 9 + bounce);
        ctx.stroke();
    }
}

// ---- コイン ----
let coins = [];
class Coin {
    constructor(x, y) {
        this.x = x * TILE + TILE / 2;
        this.y = y * TILE + TILE / 2;
        this.r = 10;
        this.collected = false;
        this.animTimer = Math.random() * Math.PI * 2;
    }
    update() {
        this.animTimer += 0.06;
    }
    draw(camX) {
        if (this.collected) return;
        const sx = this.x - camX;
        if (sx < -TILE || sx > canvas.width + TILE) return;
        const hover = Math.sin(this.animTimer) * 4;
        const scaleX = Math.cos(this.animTimer * 1.5);
        ctx.save();
        ctx.translate(sx, this.y + hover);
        ctx.scale(scaleX, 1);
        // 外円
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(0, 0, this.r, 0, Math.PI * 2);
        ctx.fill();
        // 内円
        ctx.fillStyle = '#f39c12';
        ctx.beginPath();
        ctx.arc(0, 0, this.r - 3, 0, Math.PI * 2);
        ctx.fill();
        // 光沢
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(-2, -2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ---- スパイク ----
let spikes = [];
class Spike {
    constructor(x, y) {
        this.x = x * TILE;
        this.y = y * TILE;
        this.w = TILE;
        this.h = TILE;
    }
    draw(camX) {
        const sx = this.x - camX;
        if (sx < -TILE || sx > canvas.width + TILE) return;
        ctx.fillStyle = '#e74c3c';
        const spCount = 3;
        const spW = this.w / spCount;
        for (let i = 0; i < spCount; i++) {
            ctx.beginPath();
            ctx.moveTo(sx + i * spW, this.y + this.h);
            ctx.lineTo(sx + i * spW + spW / 2, this.y + 8);
            ctx.lineTo(sx + (i + 1) * spW, this.y + this.h);
            ctx.fill();
        }
    }
}

// ---- ゴール ----
let goal = null;
class Goal {
    constructor(x, y) {
        this.x = x * TILE;
        this.y = y * TILE - TILE * 2;
        this.w = TILE;
        this.h = TILE * 3;
        this.animTimer = 0;
    }
    update() {
        this.animTimer += 0.03;
    }
    draw(camX) {
        const sx = this.x - camX;
        if (sx < -TILE * 2 || sx > canvas.width + TILE * 2) return;
        // ポール
        ctx.fillStyle = '#bdc3c7';
        ctx.fillRect(sx + TILE / 2 - 3, this.y, 6, this.h);
        // 旗
        const wave = Math.sin(this.animTimer * 2) * 5;
        ctx.fillStyle = '#e74c3c';
        ctx.beginPath();
        ctx.moveTo(sx + TILE / 2 + 3, this.y + 5);
        ctx.lineTo(sx + TILE / 2 + 35 + wave, this.y + 15);
        ctx.lineTo(sx + TILE / 2 + 3, this.y + 30);
        ctx.fill();
        // 星
        ctx.fillStyle = '#f1c40f';
        drawStar(sx + TILE / 2 + 16 + wave * 0.5, this.y + 17, 5, 5, 2.5);
        // 光るエフェクト
        const glow = Math.sin(this.animTimer * 3) * 0.3 + 0.3;
        ctx.fillStyle = `rgba(241, 196, 15, ${glow})`;
        ctx.beginPath();
        ctx.arc(sx + TILE / 2, this.y, 20, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawStar(cx, cy, spikes, outerR, innerR) {
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;
    ctx.beginPath();
    ctx.moveTo(cx, cy - outerR);
    for (let i = 0; i < spikes; i++) {
        ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
        rot += step;
        ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
        rot += step;
    }
    ctx.closePath();
    ctx.fill();
}

// ---- パーティクル ----
class Particle {
    constructor(x, y, color, vx, vy, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = vx || (Math.random() - 0.5) * 4;
        this.vy = vy || (Math.random() - 0.5) * 4 - 2;
        this.life = life || 30;
        this.maxLife = this.life;
        this.r = Math.random() * 3 + 1;
    }
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1;
        this.life--;
    }
    draw(camX) {
        const alpha = this.life / this.maxLife;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x - camX, this.y, this.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
}

function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

// ---- レベルロード ----
let levelMap = [];
let solidTiles = []; // 衝突判定用

function loadLevel(index) {
    if (index >= levels.length) {
        gameState = STATE.CLEAR;
        return;
    }
    currentLevel = index;
    const lvl = levels[index];
    levelMap = lvl.generate();
    enemies = [];
    coins = [];
    spikes = [];
    goal = null;
    solidTiles = [];

    for (let r = 0; r < levelMap.length; r++) {
        for (let c = 0; c < levelMap[r].length; c++) {
            const tile = levelMap[r][c];
            if (tile === 3) {
                coins.push(new Coin(c, r));
                levelMap[r][c] = 0;
            } else if (tile === 4) {
                spikes.push(new Spike(c, r));
                levelMap[r][c] = 0;
            } else if (tile === 5) {
                goal = new Goal(c, r);
                levelMap[r][c] = 0;
            } else if (tile === 7) {
                enemies.push(new Enemy(c, r));
                levelMap[r][c] = 0;
            }
            if (tile === 1 || tile === 2) {
                solidTiles.push({ x: c * TILE, y: r * TILE, w: TILE, h: TILE, type: tile });
            }
        }
    }

    player.x = 80;
    player.y = 100;
    player.vx = 0;
    player.vy = 0;
    player.onGround = false;
    player.invincible = 0;
    cameraX = 0;
}

// ---- 衝突判定 ----
function rectCollide(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function getTilesAround(px, py) {
    const results = [];
    const startCol = Math.floor(px / TILE) - 1;
    const endCol = Math.ceil((px + player.w) / TILE) + 1;
    const startRow = Math.floor(py / TILE) - 1;
    const endRow = Math.ceil((py + player.h) / TILE) + 1;

    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            if (r >= 0 && r < levelMap.length && c >= 0 && c < levelMap[0].length) {
                if (levelMap[r][c] === 1 || levelMap[r][c] === 2) {
                    results.push({ x: c * TILE, y: r * TILE, w: TILE, h: TILE });
                }
            }
        }
    }
    return results;
}

// ---- プレイヤー更新 ----
function updatePlayer() {
    // 左右移動
    if (keys['ArrowLeft'] || keys['KeyA']) {
        player.vx -= PLAYER_SPEED;
        player.facing = -1;
    }
    if (keys['ArrowRight'] || keys['KeyD']) {
        player.vx += PLAYER_SPEED;
        player.facing = 1;
    }

    // ジャンプ
    if ((keys['ArrowUp'] || keys['KeyW'] || keys['Space']) && player.onGround) {
        player.vy = JUMP_FORCE;
        player.onGround = false;
        player.jumping = true;
        spawnParticles(player.x + player.w / 2, player.y + player.h, '#aaa', 5);
    }

    // 重力
    player.vy += GRAVITY;
    player.vx *= FRICTION;

    // 速度制限
    player.vx = Math.max(-8, Math.min(8, player.vx));
    player.vy = Math.max(-15, Math.min(15, player.vy));

    // X軸移動と衝突
    player.x += player.vx;
    const tilesX = getTilesAround(player.x, player.y);
    for (const tile of tilesX) {
        if (rectCollide(player, tile)) {
            if (player.vx > 0) {
                player.x = tile.x - player.w;
            } else if (player.vx < 0) {
                player.x = tile.x + tile.w;
            }
            player.vx = 0;
        }
    }

    // Y軸移動と衝突
    player.y += player.vy;
    player.onGround = false;
    const tilesY = getTilesAround(player.x, player.y);
    for (const tile of tilesY) {
        if (rectCollide(player, tile)) {
            if (player.vy > 0) {
                player.y = tile.y - player.h;
                player.vy = 0;
                player.onGround = true;
                player.jumping = false;
            } else if (player.vy < 0) {
                player.y = tile.y + tile.h;
                player.vy = 0;
            }
        }
    }

    // 落下死
    if (player.y > canvas.height + 100) {
        playerDie();
    }

    // 無敵時間
    if (player.invincible > 0) player.invincible--;

    // アニメーション
    if (Math.abs(player.vx) > 0.5 && player.onGround) {
        player.animTimer += 0.15;
        player.animFrame = Math.floor(player.animTimer) % 4;
    } else {
        player.animFrame = 0;
        player.animTimer = 0;
    }

    // コイン取得
    for (const coin of coins) {
        if (coin.collected) continue;
        const dx = player.x + player.w / 2 - coin.x;
        const dy = player.y + player.h / 2 - coin.y;
        if (Math.sqrt(dx * dx + dy * dy) < 25) {
            coin.collected = true;
            score += 100;
            spawnParticles(coin.x, coin.y, '#f1c40f', 8);
        }
    }

    // スパイクとの衝突
    if (player.invincible <= 0) {
        for (const spike of spikes) {
            const spikeHitbox = { x: spike.x + 5, y: spike.y + 10, w: spike.w - 10, h: spike.h - 10 };
            if (rectCollide(player, spikeHitbox)) {
                playerDie();
                return;
            }
        }
    }

    // 敵との衝突
    for (const enemy of enemies) {
        if (!enemy.alive) continue;
        if (rectCollide(player, enemy)) {
            // 上から踏む
            if (player.vy > 0 && player.y + player.h - 10 < enemy.y + enemy.h / 2) {
                enemy.alive = false;
                player.vy = JUMP_FORCE * 0.7;
                score += 200;
                spawnParticles(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, '#e74c3c', 10);
                screenShake = 5;
            } else if (player.invincible <= 0) {
                playerDie();
                return;
            }
        }
    }

    // ゴール判定
    if (goal) {
        const goalHitbox = { x: goal.x, y: goal.y, w: goal.w, h: goal.h };
        if (rectCollide(player, goalHitbox)) {
            score += 1000;
            spawnParticles(player.x + player.w / 2, player.y + player.h / 2, '#f1c40f', 20);
            if (currentLevel + 1 >= levels.length) {
                gameState = STATE.CLEAR;
            } else {
                currentLevel++;
                loadLevel(currentLevel);
            }
        }
    }

    // カメラ追従
    const targetCam = player.x - canvas.width / 3;
    const maxCam = (levelMap[0] ? levelMap[0].length : COLS) * TILE - canvas.width;
    cameraX += (targetCam - cameraX) * 0.1;
    cameraX = Math.max(0, Math.min(maxCam, cameraX));
}

function playerDie() {
    lives--;
    spawnParticles(player.x + player.w / 2, player.y + player.h / 2, '#e74c3c', 15);
    screenShake = 10;
    if (lives <= 0) {
        gameState = STATE.GAMEOVER;
    } else {
        player.x = 80;
        player.y = 100;
        player.vx = 0;
        player.vy = 0;
        player.invincible = 90;
        cameraX = 0;
    }
}

// ---- 描画 ----
function drawBackground() {
    const lvl = levels[currentLevel];
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, lvl.bg.top);
    grad.addColorStop(1, lvl.bg.bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 背景の星
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 50; i++) {
        const sx = ((i * 137.5 + 50) % (canvas.width + 200)) - cameraX * 0.1 % (canvas.width + 200);
        const sy = (i * 97.3 + 30) % canvas.height;
        const r = (i % 3) + 0.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    // 遠景の山
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    for (let x = 0; x <= canvas.width; x += 60) {
        const h = Math.sin((x + cameraX * 0.2) * 0.01) * 80 + 120;
        ctx.lineTo(x, canvas.height - h);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.fill();
}

function drawTiles() {
    const startCol = Math.floor(cameraX / TILE);
    const endCol = startCol + COLS + 2;

    for (let r = 0; r < levelMap.length; r++) {
        for (let c = startCol; c < endCol && c < levelMap[r].length; c++) {
            if (c < 0) continue;
            const tile = levelMap[r][c];
            if (tile === 0) continue;
            const sx = c * TILE - cameraX;
            const sy = r * TILE;

            if (tile === 1) {
                // 地面
                ctx.fillStyle = '#2d5016';
                ctx.fillRect(sx, sy, TILE, TILE);
                ctx.fillStyle = '#4a7c23';
                ctx.fillRect(sx + 1, sy + 1, TILE - 2, TILE - 2);
                if (r > 0 && levelMap[r - 1][c] === 0) {
                    ctx.fillStyle = '#6ab04c';
                    ctx.fillRect(sx, sy, TILE, 6);
                }
            } else if (tile === 2) {
                // ブロック
                ctx.fillStyle = '#7f8c8d';
                ctx.fillRect(sx, sy, TILE, TILE);
                ctx.fillStyle = '#95a5a6';
                ctx.fillRect(sx + 2, sy + 2, TILE - 4, TILE - 4);
                // ハイライト
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fillRect(sx + 2, sy + 2, TILE - 4, 3);
            }
        }
    }
}

function drawPlayer() {
    if (player.invincible > 0 && Math.floor(player.invincible / 3) % 2 === 0) return;

    const sx = player.x - cameraX;
    const sy = player.y;

    ctx.save();
    ctx.translate(sx + player.w / 2, sy + player.h / 2);
    ctx.scale(player.facing, 1);

    // 体
    ctx.fillStyle = '#3498db';
    const bodyOffset = player.onGround ? [0, -2, 0, 2][player.animFrame] : (player.vy < 0 ? -2 : 2);
    ctx.fillRect(-player.w / 2, -player.h / 2 + bodyOffset, player.w, player.h - 4);

    // 頭
    ctx.fillStyle = '#5dade2';
    ctx.fillRect(-player.w / 2 + 2, -player.h / 2 + bodyOffset, player.w - 4, 14);

    // 目
    ctx.fillStyle = '#fff';
    ctx.fillRect(2, -player.h / 2 + 4 + bodyOffset, 8, 8);
    ctx.fillStyle = '#222';
    ctx.fillRect(5, -player.h / 2 + 5 + bodyOffset, 4, 5);

    // 足（走りアニメ）
    if (player.onGround && Math.abs(player.vx) > 0.5) {
        const legAngle = Math.sin(player.animTimer * 2) * 0.4;
        ctx.fillStyle = '#2980b9';
        ctx.save();
        ctx.translate(-4, player.h / 2 - 6);
        ctx.rotate(legAngle);
        ctx.fillRect(-3, 0, 6, 10);
        ctx.restore();
        ctx.save();
        ctx.translate(4, player.h / 2 - 6);
        ctx.rotate(-legAngle);
        ctx.fillRect(-3, 0, 6, 10);
        ctx.restore();
    } else {
        ctx.fillStyle = '#2980b9';
        ctx.fillRect(-player.w / 2 + 4, player.h / 2 - 8, 8, 8);
        ctx.fillRect(player.w / 2 - 12, player.h / 2 - 8, 8, 8);
    }

    ctx.restore();
}

function drawHUD() {
    // スコア
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(10, 10, 180, 35);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(`SCORE: ${score}`, 20, 33);

    // ライフ
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(canvas.width - 120, 10, 110, 35);
    ctx.fillStyle = '#e74c3c';
    for (let i = 0; i < lives; i++) {
        drawHeart(canvas.width - 105 + i * 30, 27, 10);
    }

    // レベル名
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(canvas.width / 2 - 80, 10, 160, 30);
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`Stage ${currentLevel + 1}: ${levels[currentLevel].name}`, canvas.width / 2, 30);
    ctx.textAlign = 'left';
}

function drawHeart(cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + r / 4);
    ctx.quadraticCurveTo(cx, cy - r / 2, cx - r / 2, cy - r / 2);
    ctx.quadraticCurveTo(cx - r, cy - r / 2, cx - r, cy + r / 8);
    ctx.quadraticCurveTo(cx - r, cy + r / 2, cx, cy + r);
    ctx.quadraticCurveTo(cx + r, cy + r / 2, cx + r, cy + r / 8);
    ctx.quadraticCurveTo(cx + r, cy - r / 2, cx + r / 2, cy - r / 2);
    ctx.quadraticCurveTo(cx, cy - r / 2, cx, cy + r / 4);
    ctx.fill();
}

function drawParticles() {
    for (const p of particles) {
        p.draw(cameraX);
    }
}

// ---- タイトル画面 ----
function drawTitle() {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#0f0c29');
    grad.addColorStop(0.5, '#302b63');
    grad.addColorStop(1, '#24243e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 星
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 80; i++) {
        const x = (i * 137.5 + Date.now() * 0.01 * (i % 3 + 1) * 0.1) % canvas.width;
        const y = (i * 97.3) % canvas.height;
        ctx.beginPath();
        ctx.arc(x, y, (i % 3) + 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // タイトル
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3498db';
    ctx.font = 'bold 64px monospace';
    ctx.fillText('SKY RUNNER', canvas.width / 2, 180);

    // サブタイトル
    ctx.fillStyle = '#5dade2';
    ctx.font = '20px monospace';
    ctx.fillText('~ 空を駆ける冒険 ~', canvas.width / 2, 220);

    // 操作説明
    ctx.fillStyle = '#bdc3c7';
    ctx.font = '16px monospace';
    ctx.fillText('← → / A D : 移動', canvas.width / 2, 310);
    ctx.fillText('↑ / W / SPACE : ジャンプ', canvas.width / 2, 340);
    ctx.fillText('敵の上に乗って倒そう！', canvas.width / 2, 370);

    // スタート
    const blink = Math.sin(Date.now() * 0.005) > 0;
    if (blink) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 22px monospace';
        ctx.fillText('SPACE でスタート', canvas.width / 2, 440);
    }

    ctx.textAlign = 'left';
}

// ---- ゲームオーバー画面 ----
function drawGameOver() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#e74c3c';
    ctx.font = 'bold 56px monospace';
    ctx.fillText('GAME OVER', canvas.width / 2, 220);

    ctx.fillStyle = '#fff';
    ctx.font = '24px monospace';
    ctx.fillText(`スコア: ${score}`, canvas.width / 2, 290);

    const blink = Math.sin(Date.now() * 0.005) > 0;
    if (blink) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = '20px monospace';
        ctx.fillText('SPACE でリトライ', canvas.width / 2, 370);
    }
    ctx.textAlign = 'left';
}

// ---- クリア画面 ----
function drawClear() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 56px monospace';
    ctx.fillText('ALL CLEAR!', canvas.width / 2, 200);

    ctx.fillStyle = '#fff';
    ctx.font = '24px monospace';
    ctx.fillText(`最終スコア: ${score}`, canvas.width / 2, 270);

    ctx.fillStyle = '#2ecc71';
    ctx.font = '20px monospace';
    ctx.fillText('おめでとうございます！', canvas.width / 2, 320);

    const blink = Math.sin(Date.now() * 0.005) > 0;
    if (blink) {
        ctx.fillStyle = '#f1c40f';
        ctx.font = '20px monospace';
        ctx.fillText('SPACE でもう一度', canvas.width / 2, 400);
    }
    ctx.textAlign = 'left';
}

// ---- ゲーム制御 ----
function startGame() {
    score = 0;
    lives = 3;
    currentLevel = 0;
    loadLevel(0);
    gameState = STATE.PLAYING;
}

function resetGame() {
    score = 0;
    lives = 3;
    currentLevel = 0;
    particles = [];
    loadLevel(0);
    gameState = STATE.PLAYING;
}

function nextLevel() {
    // ALL CLEAR後はリスタート
    resetGame();
}

// ---- メインループ ----
function update() {
    if (gameState === STATE.PLAYING) {
        updatePlayer();
        for (const enemy of enemies) enemy.update();
        for (const coin of coins) coin.update();
        if (goal) goal.update();

        // パーティクル更新
        particles = particles.filter((p) => p.life > 0);
        for (const p of particles) p.update();

        // 画面揺れ減衰
        if (screenShake > 0) screenShake *= 0.8;
    }
}

function draw() {
    ctx.save();

    // 画面揺れ
    if (screenShake > 0.5) {
        ctx.translate(
            (Math.random() - 0.5) * screenShake * 2,
            (Math.random() - 0.5) * screenShake * 2
        );
    }

    if (gameState === STATE.TITLE) {
        drawTitle();
    } else if (gameState === STATE.PLAYING) {
        drawBackground();
        drawTiles();
        for (const spike of spikes) spike.draw(cameraX);
        for (const coin of coins) coin.draw(cameraX);
        for (const enemy of enemies) enemy.draw(cameraX);
        if (goal) goal.draw(cameraX);
        drawPlayer();
        drawParticles();
        drawHUD();
    } else if (gameState === STATE.GAMEOVER) {
        drawBackground();
        drawTiles();
        drawGameOver();
    } else if (gameState === STATE.CLEAR) {
        drawBackground();
        drawTiles();
        drawClear();
    }

    ctx.restore();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// ゲーム開始
gameLoop();
