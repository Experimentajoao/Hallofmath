// ==========================================
// 1. CONFIGURAÇÕES DE ÁUDIO (Web Audio API)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, type, duration, vol=0.1) {
    if(audioCtx.state === 'suspended') return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; 
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
    osc.connect(gain); 
    gain.connect(audioCtx.destination);
    osc.start(); 
    osc.stop(audioCtx.currentTime + duration);
}

let musicInterval;
let currentNote = 0;
let currentBass = 0;
const melody = [261.63, 311.13, 392.00, 523.25, 392.00, 311.13, 261.63, 196.00, 293.66, 349.23, 440.00, 587.33, 440.00, 349.23, 293.66, 220.00];
const bassline = [130.81, 130.81, 130.81, 130.81, 146.83, 146.83, 146.83, 146.83];

function startMusic() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    musicInterval = setInterval(() => {
        if (!isPlaying) return;
        playTone(melody[currentNote], 'square', 0.15, 0.03);
        currentNote = (currentNote + 1) % melody.length;
        if (currentNote % 2 === 0) {
            playTone(bassline[currentBass], 'sawtooth', 0.2, 0.05);
            currentBass = (currentBass + 1) % bassline.length;
        }
    }, 200 / speedMult); 
}

function stopMusic() { clearInterval(musicInterval); }

// ==========================================
// 2. VARIÁVEIS GLOBAIS E ESTADO DO JOGO
// ==========================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let cw, ch, laneW;

let isPlaying = false, lastTime = 0, deltaTime = 0;
let timeSurvived = 0, lives = 3, combo = 0, speedMult = 1;
let entities = [], particles = [], stars = [];

let player = { lane: 1, x: 0, targetX: 0, y: 0, tilt: 0, color: '#00e5ff' };
let visualFlash = { color: 'transparent', alpha: 0 };
let screenShake = 0; // Controle do terremoto na tela

function resize() {
    cw = canvas.width = canvas.parentElement.clientWidth;
    ch = canvas.height = canvas.parentElement.clientHeight;
    laneW = cw / 3;
    player.y = ch - 120;
    player.targetX = player.x = laneW * player.lane + laneW / 2;
}
window.addEventListener('resize', resize); resize();

// ==========================================
// 3. MOTOR MATEMÁTICO GERADOR
// ==========================================
const MathEngine = {
    generate(difficultyLevel) {
        let q, correct, w1, w2;
        if (difficultyLevel < 1) { 
            let a = Math.floor(Math.random() * 8) + 2; let b = Math.floor(Math.random() * 5) + 1;
            let op = Math.random() > 0.5 ? '+' : '-'; let c = Math.floor(Math.random() * 10) + 1;
            q = op === '+' ? `${a} × ${b} + ${c}` : `${a} × ${b} - ${c}`;
            correct = op === '+' ? (a * b) + c : (a * b) - c;
            w1 = correct + (Math.floor(Math.random()*3)+1); w2 = correct - (Math.floor(Math.random()*3)+1);
        } else if (difficultyLevel < 2) { 
            let a = Math.floor(Math.random() * 6) + 2; let b = Math.floor(Math.random() * 4) + 2;
            q = `${a}x + ${b}x`; correct = `${a + b}x`;
            w1 = `${a + b}x²`; w2 = `${a * b}x`;
        } else { 
            let a = Math.floor(Math.random() * 4) + 2; let b = Math.floor(Math.random() * 5) + 1;
            q = `${a}(x + ${b})`; correct = `${a}x + ${a*b}`;
            w1 = `${a}x + ${b}`; w2 = `${a*b}x + ${a}`;
        }
        let options = [correct, w1, w2].sort(() => Math.random() - 0.5);
        return { text: q, options, correctIdx: options.indexOf(correct) };
    }
};

// ==========================================
// 4. ENTIDADES E EFEITOS VISUAIS EXTREMOS
// ==========================================
function createStars() {
    stars = [];
    for(let i=0; i<80; i++) stars.push({ x: Math.random()*cw, y: Math.random()*ch, z: Math.random()*2+1 });
}

function spawnGate() {
    let diff = timeSurvived / 60; 
    let data = MathEngine.generate(diff);
    document.getElementById('question-panel').innerText = data.text;
    entities.push({ type: 'gate', y: -80, data, passed: false });
}

function spawnObstacle() {
    let faixasProibidas = [];
    entities.forEach(e => { if (e.type === 'gate') faixasProibidas.push(e.data.correctIdx); });
    let faixasPermitidas = [0, 1, 2].filter(faixa => !faixasProibidas.includes(faixa));
    if (faixasPermitidas.length === 0) return;
    let faixaEscolhida = faixasPermitidas[Math.floor(Math.random() * faixasPermitidas.length)];
    entities.push({ type: 'obstacle', lane: faixaEscolhida, y: -40 });
}

// Explosão hiper-dinâmica
function spawnExplosion(x, y, color, count = 25, speedRange = 20) {
    for(let i=0; i<count; i++) {
        particles.push({
            x, y,
            vx: (Math.random()-0.5) * speedRange, 
            vy: (Math.random()-0.5) * speedRange,
            life: Math.random() * 0.8 + 0.2, 
            color,
            size: Math.random() * 5 + 3 
        });
    }
}

function triggerShake(intensity) { screenShake = intensity; }

// ==========================================
// 5. LOOP DE JOGO (UPDATE & DRAW)
// ==========================================
function update(dt) {
    timeSurvived += dt;
    let mins = Math.floor(timeSurvived / 60); let secs = Math.floor(timeSurvived % 60);
    document.getElementById('timer').innerText = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    speedMult = 1 + (timeSurvived / 60) * 0.4; 

    // MOVIMENTO SUAVE E INCLINAÇÃO (TILT EXAGERADO)
    let moveVel = (player.targetX - player.x) * 0.25; 
    player.x += moveVel;
    player.tilt = moveVel * 0.1; // O multiplicador alto deixa a inclinação muito visível!

    // Reduz o tremor de tela aos poucos
    if (screenShake > 0) screenShake *= 0.9;
    if (screenShake < 0.1) screenShake = 0;

    let espacoLivre = entities.every(e => e.y > 200);
    if (espacoLivre) {
        if (entities.filter(e => e.type === 'gate').length === 0 && Math.random() < 0.02 * speedMult) spawnGate();
        else if (Math.random() < 0.01 * speedMult) spawnObstacle();
    }

    stars.forEach(s => {
        s.y += (300 * dt * speedMult) / s.z; // Estrelas mais rápidas (Warp Speed)
        if (s.y > ch) { s.y = 0; s.x = Math.random()*cw; }
    });

    for (let i = entities.length - 1; i >= 0; i--) {
        let e = entities[i];
        e.y += 150 * dt * speedMult; 

        if (e.type === 'gate' && !e.passed && e.y + 60 > player.y) {
            e.passed = true;
            if (player.lane === e.data.correctIdx) {
                combo++;
                playTone(800, 'sine', 0.1); playTone(1200, 'sine', 0.15);
                spawnExplosion(player.x, player.y, '#00ff00', 50, 30); // Explosão gigante
                triggerFlash('rgba(0, 255, 0, 0.3)');
                triggerShake(10); // Tela dá um tranco de alegria
                if(combo > 2) document.getElementById('combo-display').style.opacity = 1;
            } else {
                takeDamage();
                spawnExplosion(player.x, player.y, '#ff0000', 30, 20);
            }
        }

        if (e.type === 'obstacle' && e.y + 40 > player.y && e.y < player.y + 40 && Math.abs(e.lane * laneW + laneW/2 - player.x) < 30) {
            takeDamage();
            spawnExplosion(e.lane * laneW + laneW/2, e.y, '#ff0055', 40, 25);
            entities.splice(i, 1);
            continue;
        }

        if (e.y > ch) entities.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; 
        p.vy += 0.5; // Gravidade puxando as partículas pra baixo
        p.life -= dt * 2;
        if (p.life <= 0) particles.splice(i, 1);
    }
    if (visualFlash.alpha > 0) visualFlash.alpha -= dt;
}

function takeDamage() {
    lives--; combo = 0;
    document.getElementById('combo-display').style.opacity = 0;
    playTone(200, 'sawtooth', 0.4);
    triggerFlash('rgba(255, 0, 85, 0.5)');
    triggerShake(25); // Terremoto forte no erro
    
    let hearts = document.querySelectorAll('.heart');
    if (hearts[lives]) hearts[lives].classList.add('lost');
    if (lives <= 0) gameOver();
}

function triggerFlash(color) { visualFlash.color = color; visualFlash.alpha = 1; }

function draw() {
    ctx.save(); // Salva o canvas inteiro

    // APLICA O SCREEN SHAKE (Tremores)
    if (screenShake > 0) {
        let dx = (Math.random() - 0.5) * screenShake;
        let dy = (Math.random() - 0.5) * screenShake;
        ctx.translate(dx, dy);
    }

    // COR DE FUNDO DINÂMICA (Muda suavemente de acordo com o tempo)
    let hue = (timeSurvived * 5) % 360; 
    ctx.fillStyle = `hsl(${hue}, 40%, 8%)`; 
    ctx.fillRect(0, 0, cw, ch);

    ctx.fillStyle = '#fff';
    stars.forEach(s => {
        ctx.globalAlpha = 1 / s.z;
        ctx.fillRect(s.x, s.y, 2, s.z * 3); // Estrelas esticadas (efeito velocidade)
    });
    ctx.globalAlpha = 1;

    let pulseFactor = Math.sin(timeSurvived * 8) * 0.2 + 0.3; // Pulsa mais rápido
    ctx.strokeStyle = `rgba(138, 43, 226, ${pulseFactor})`;
    ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(laneW, 0); ctx.lineTo(laneW, ch);
    ctx.moveTo(laneW*2, 0); ctx.lineTo(laneW*2, ch); ctx.stroke();

    entities.forEach(e => {
        if (e.type === 'gate') {
            e.data.options.forEach((opt, idx) => {
                let x = idx * laneW + 10; let y = e.y; let w = laneW - 20;
                ctx.fillStyle = 'rgba(20, 20, 40, 0.9)';
                ctx.strokeStyle = e.passed ? (idx === e.data.correctIdx ? '#00ff00' : '#444') : '#8a2be2';
                ctx.shadowBlur = 15; ctx.shadowColor = ctx.strokeStyle;
                ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(x, y, w, 60, 8); ctx.fill(); ctx.stroke();
                ctx.shadowBlur = 0; 
                ctx.fillStyle = e.passed && idx !== e.data.correctIdx ? '#666' : '#fff';
                ctx.font = 'bold 20px Poppins'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(opt, x + w/2, y + 30);
            });
        } else if (e.type === 'obstacle') {
            let cx = e.lane * laneW + laneW/2;
            ctx.fillStyle = '#ff0055';
            ctx.shadowBlur = 25; ctx.shadowColor = '#ff0055'; // Muito mais brilho
            ctx.beginPath();
            ctx.moveTo(cx, e.y); ctx.lineTo(cx - 25, e.y + 45); ctx.lineTo(cx + 25, e.y + 45);
            ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        }
    });

    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 10; ctx.shadowColor = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
        ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    let px = player.x; let py = player.y;
    
    ctx.save(); 
    ctx.translate(px, py); 
    ctx.rotate(player.tilt); 

    ctx.fillStyle = combo > 2 ? '#ffde00' : '#00e5ff';
    ctx.shadowBlur = combo > 2 ? 30 : 15; ctx.shadowColor = ctx.fillStyle;
    ctx.beginPath(); ctx.moveTo(-10, 20); ctx.lineTo(0, 50 + Math.random()*30); ctx.lineTo(10, 20); ctx.fill(); // Rastro enorme
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#8a2be2'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -30); ctx.lineTo(-30, 25); ctx.lineTo(0, 15); ctx.lineTo(30, 25);
    ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.restore(); 

    if (visualFlash.alpha > 0) {
        ctx.fillStyle = visualFlash.color; ctx.globalAlpha = visualFlash.alpha;
        ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
    }

    ctx.restore(); // Restaura o canvas que foi mexido pelo Screen Shake
}

function gameLoop(timestamp) {
    if (!isPlaying) return;
    deltaTime = (timestamp - lastTime) / 1000; lastTime = timestamp;
    if (deltaTime > 0.1) deltaTime = 0.1; 
    update(deltaTime); draw();
    requestAnimationFrame(gameLoop);
}

// ==========================================
// 6. CONTROLES E EVENTOS DE TELA
// ==========================================
function setPlayerLane(newLanes) {
    if (!isPlaying) return;
    player.lane = newLanes;
    player.targetX = laneW * player.lane + laneW / 2;
}

window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' && player.lane > 0) setPlayerLane(player.lane - 1);
    if (e.key === 'ArrowRight' && player.lane < 2) setPlayerLane(player.lane + 1);
});

canvas.addEventListener('touchstart', e => {
    const touchX = e.touches[0].clientX; const canvasRect = canvas.getBoundingClientRect();
    const relX = touchX - canvasRect.left;
    if (relX < cw/3) setPlayerLane(0);
    else if (relX < (cw/3)*2) setPlayerLane(1);
    else setPlayerLane(2);
});

// ==========================================
// 7. GESTÃO DE ESTADO E PLACAR
// ==========================================
function loadLeaderboard() {
    let scores = JSON.parse(localStorage.getItem('mathRunnerScores')) || [];
    let html = scores.slice(0, 3).map((s, i) => `<div class="lb-entry"><span>${i+1}. ${s.name}</span> <span style="color:#00e5ff">${s.time}</span></div>`).join('');
    document.getElementById('lb-list-start').innerHTML = html || "<div class='lb-entry'>Nenhum registro ainda.</div>";
}

function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-ui').style.display = 'flex';
    
    isPlaying = true; timeSurvived = 0; lives = 3; combo = 0; speedMult = 1; player.lane = 1;
    player.x = player.targetX = laneW * player.lane + laneW / 2;
    entities = []; particles = []; screenShake = 0;
    document.querySelectorAll('.heart').forEach(h => h.classList.remove('lost'));
    document.getElementById('combo-display').style.opacity = 0;
    
    createStars(); spawnGate(); startMusic();
    lastTime = performance.now(); requestAnimationFrame(gameLoop);
}

function gameOver() {
    isPlaying = false; stopMusic(); playTone(150, 'sawtooth', 1.0, 0.3); 
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('final-time').innerText = document.getElementById('timer').innerText;
}

function saveScoreAndRestart() {
    let name = document.getElementById('player-name').value || "Anônimo";
    let timeStr = document.getElementById('timer').innerText; let timeVal = timeSurvived; 
    let scores = JSON.parse(localStorage.getItem('mathRunnerScores')) || [];
    scores.push({ name, time: timeStr, rawTime: timeVal });
    scores.sort((a, b) => b.rawTime - a.rawTime); 
    localStorage.setItem('mathRunnerScores', JSON.stringify(scores));
    loadLeaderboard();
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', saveScoreAndRestart);
loadLeaderboard(); draw();
