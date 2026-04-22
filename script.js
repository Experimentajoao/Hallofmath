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

// Sequenciador Chiptune (Background Music)
let musicInterval;
let currentNote = 0;
let currentBass = 0;

// Melodia Arpejada (Dó menor / Ré menor)
const melody = [261.63, 311.13, 392.00, 523.25, 392.00, 311.13, 261.63, 196.00, 293.66, 349.23, 440.00, 587.33, 440.00, 349.23, 293.66, 220.00];
const bassline = [130.81, 130.81, 130.81, 130.81, 146.83, 146.83, 146.83, 146.83];

function startMusic() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    musicInterval = setInterval(() => {
        if (!isPlaying) return;
        playTone(melody[currentNote], 'square', 0.15, 0.04);
        currentNote = (currentNote + 1) % melody.length;
        if (currentNote % 2 === 0) {
            playTone(bassline[currentBass], 'sawtooth', 0.2, 0.06);
            currentBass = (currentBass + 1) % bassline.length;
        }
    }, 200 / speedMult); // A música acelera com a velocidade do jogo
}

function stopMusic() {
    clearInterval(musicInterval);
}

// ==========================================
// 2. VARIÁVEIS GLOBAIS E ESTADO DO JOGO
// ==========================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let cw, ch, laneW;

let isPlaying = false, lastTime = 0, deltaTime = 0;
let timeSurvived = 0, lives = 3, combo = 0, speedMult = 1;
let entities = [], particles = [], stars = [];
let player = { lane: 1, y: 0, color: '#00e5ff' };
let visualFlash = { color: 'transparent', alpha: 0 };

// Redimensionamento Dinâmico
function resize() {
    cw = canvas.width = canvas.parentElement.clientWidth;
    ch = canvas.height = canvas.parentElement.clientHeight;
    laneW = cw / 3;
    player.y = ch - 120;
}
window.addEventListener('resize', resize);
resize();

// ==========================================
// 3. MOTOR MATEMÁTICO GERADOR
// ==========================================
const MathEngine = {
    generate(difficultyLevel) {
        let q, correct, w1, w2;
        if (difficultyLevel < 1) { 
            let a = Math.floor(Math.random() * 8) + 2;
            let b = Math.floor(Math.random() * 5) + 1;
            let op = Math.random() > 0.5 ? '+' : '-';
            let c = Math.floor(Math.random() * 10) + 1;
            q = op === '+' ? `${a} × ${b} + ${c}` : `${a} × ${b} - ${c}`;
            correct = op === '+' ? (a * b) + c : (a * b) - c;
            w1 = correct + (Math.floor(Math.random()*3)+1);
            w2 = correct - (Math.floor(Math.random()*3)+1);
        } else if (difficultyLevel < 2) { 
            let a = Math.floor(Math.random() * 6) + 2;
            let b = Math.floor(Math.random() * 4) + 2;
            q = `${a}x + ${b}x`; correct = `${a + b}x`;
            w1 = `${a + b}x²`; w2 = `${a * b}x`;
        } else { 
            let a = Math.floor(Math.random() * 4) + 2;
            let b = Math.floor(Math.random() * 5) + 1;
            q = `${a}(x + ${b})`; correct = `${a}x + ${a*b}`;
            w1 = `${a}x + ${b}`; w2 = `${a*b}x + ${a}`;
        }
        
        let options = [correct, w1, w2].sort(() => Math.random() - 0.5);
        return { text: q, options, correctIdx: options.indexOf(correct) };
    }
};

// ==========================================
// 4. ENTIDADES E EFEITOS VISUAIS
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
    // 1. Vasculha a tela e anota a faixa de todas as respostas certas ativas
    let faixasProibidas = [];
    entities.forEach(e => {
        if (e.type === 'gate') {
            faixasProibidas.push(e.data.correctIdx);
        }
    });

    // 2. Pega as faixas totais (0, 1 e 2) e filtra, tirando as proibidas
    let faixasPermitidas = [0, 1, 2].filter(faixa => !faixasProibidas.includes(faixa));

    // 3. Se por algum motivo todas as faixas estiverem proibidas, cancela o obstáculo
    if (faixasPermitidas.length === 0) return;

    // 4. Sorteia APENAS entre as faixas que sobraram e que são 100% seguras
    let faixaEscolhida = faixasPermitidas[Math.floor(Math.random() * faixasPermitidas.length)];

    // 5. Cria o obstáculo na faixa segura
    entities.push({ type: 'obstacle', lane: faixaEscolhida, y: -40 });
}

function spawnExplosion(x, y, color) {
    for(let i=0; i<15; i++) {
        particles.push({
            x, y,
            vx: (Math.random()-0.5)*15, vy: (Math.random()-0.5)*15,
            life: 1, color
        });
    }
}

// ==========================================
// 5. LOOP DE JOGO (UPDATE & DRAW)
// ==========================================
function update(dt) {
    timeSurvived += dt;
    let mins = Math.floor(timeSurvived / 60);
    let secs = Math.floor(timeSurvived % 60);
    document.getElementById('timer').innerText = `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
    
    speedMult = 1 + (timeSurvived / 60) * 0.4; 

    // --- LÓGICA DE SPAWN SEGURA ---
    // Garante que haja um espaço de pelo menos 300 pixels entre qualquer obstáculo ou pergunta
    let topIsClear = entities.every(e => e.y > 300);

    if (topIsClear) {
        let hasGate = entities.some(e => e.type === 'gate');
        
        // Prioriza criar uma pergunta se não houver nenhuma
        if (!hasGate && Math.random() < 0.02 * speedMult) {
            spawnGate();
        } 
        // Caso contrário, cria um obstáculo
        else if (Math.random() < 0.01 * speedMult) {
            spawnObstacle();
        }
    }

    stars.forEach(s => {
        s.y += (200 * dt * speedMult) / s.z;
        if (s.y > ch) { s.y = 0; s.x = Math.random()*cw; }
    });

    for (let i = entities.length - 1; i >= 0; i--) {
        let e = entities[i];
        e.y += 150 * dt * speedMult; // Velocidade reduzida para dar tempo de leitura

        if (e.type === 'gate' && !e.passed && e.y + 60 > player.y) {
            e.passed = true;
            if (player.lane === e.data.correctIdx) {
                combo++;
                playTone(800, 'sine', 0.1); playTone(1200, 'sine', 0.15);
                spawnExplosion(player.lane * laneW + laneW/2, player.y, '#00ff00');
                triggerFlash('rgba(0, 255, 0, 0.2)');
                if(combo > 2) document.getElementById('combo-display').style.opacity = 1;
            } else {
                takeDamage();
                spawnExplosion(player.lane * laneW + laneW/2, player.y, '#ff0000');
            }
        }

        if (e.type === 'obstacle' && e.y + 40 > player.y && e.y < player.y + 40 && e.lane === player.lane) {
            takeDamage();
            spawnExplosion(e.lane * laneW + laneW/2, e.y, '#ff0055');
            entities.splice(i, 1);
            continue;
        }

        if (e.y > ch) entities.splice(i, 1);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.x += p.vx; p.y += p.vy; p.life -= dt * 2;
        if (p.life <= 0) particles.splice(i, 1);
    }
    if (visualFlash.alpha > 0) visualFlash.alpha -= dt;
}

function takeDamage() {
    lives--;
    combo = 0;
    document.getElementById('combo-display').style.opacity = 0;
    playTone(200, 'sawtooth', 0.4);
    triggerFlash('rgba(255, 0, 85, 0.4)');
    
    let hearts = document.querySelectorAll('.heart');
    if (lives >= 0 && lives < 3) hearts[lives].classList.add('lost');
    if (lives <= 0) gameOver();
}

function triggerFlash(color) {
    visualFlash.color = color;
    visualFlash.alpha = 1;
}

function draw() {
    ctx.fillStyle = '#0b0b1a';
    ctx.fillRect(0, 0, cw, ch);

    ctx.fillStyle = '#fff';
    stars.forEach(s => {
        ctx.globalAlpha = 1 / s.z;
        ctx.fillRect(s.x, s.y, 2, 2);
    });
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(138, 43, 226, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(laneW, 0); ctx.lineTo(laneW, ch);
    ctx.moveTo(laneW*2, 0); ctx.lineTo(laneW*2, ch);
    ctx.stroke();

    entities.forEach(e => {
        if (e.type === 'gate') {
            e.data.options.forEach((opt, idx) => {
                let x = idx * laneW + 10;
                let y = e.y;
                let w = laneW - 20;
                
                ctx.fillStyle = 'rgba(20, 20, 40, 0.9)';
                ctx.strokeStyle = e.passed ? (idx === e.data.correctIdx ? '#00ff00' : '#444') : '#8a2be2';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.roundRect(x, y, w, 60, 8); ctx.fill(); ctx.stroke();
                
                ctx.fillStyle = e.passed && idx !== e.data.correctIdx ? '#666' : '#fff';
                ctx.font = 'bold 20px Poppins'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(opt, x + w/2, y + 30);
            });
        } else if (e.type === 'obstacle') {
            let cx = e.lane * laneW + laneW/2;
            ctx.fillStyle = '#ff0055';
            ctx.shadowBlur = 15; ctx.shadowColor = '#ff0055';
            ctx.beginPath();
            ctx.moveTo(cx, e.y); ctx.lineTo(cx - 20, e.y + 40); ctx.lineTo(cx + 20, e.y + 40);
            ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
        }
    });

    particles.forEach(p => {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 4, 4);
    });
    ctx.globalAlpha = 1;

    let px = player.lane * laneW + laneW/2;
    let py = player.y;
    
    ctx.fillStyle = combo > 2 ? '#ffde00' : '#00e5ff';
    ctx.beginPath(); ctx.moveTo(px-8, py+20); ctx.lineTo(px, py+40 + Math.random()*20); ctx.lineTo(px+8, py+20); ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(px, py - 25);
    ctx.lineTo(px - 25, py + 20);
    ctx.lineTo(px, py + 10);
    ctx.lineTo(px + 25, py + 20);
    ctx.closePath(); ctx.fill();

    if (visualFlash.alpha > 0) {
        ctx.fillStyle = visualFlash.color;
        ctx.globalAlpha = visualFlash.alpha;
        ctx.fillRect(0, 0, cw, ch);
        ctx.globalAlpha = 1;
    }
}

function gameLoop(timestamp) {
    if (!isPlaying) return;
    deltaTime = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    if (deltaTime > 0.1) deltaTime = 0.1; 
    update(deltaTime);
    draw();
    requestAnimationFrame(gameLoop);
}

// ==========================================
// 6. CONTROLES E EVENTOS DE TELA
// ==========================================
function movePlayer(direction) {
    if (!isPlaying) return;
    if (direction === 'left' && player.lane > 0) player.lane--;
    if (direction === 'right' && player.lane < 2) player.lane++;
}

window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') movePlayer('left');
    if (e.key === 'ArrowRight') movePlayer('right');
});

canvas.addEventListener('touchstart', e => {
    const touchX = e.touches[0].clientX;
    const canvasRect = canvas.getBoundingClientRect();
    const relX = touchX - canvasRect.left;
    if (relX < cw/3) player.lane = 0;
    else if (relX < (cw/3)*2) player.lane = 1;
    else player.lane = 2;
});

// ==========================================
// 7. GESTÃO DE ESTADO E PLACAR (LOCALSTORAGE)
// ==========================================
function loadLeaderboard() {
    let scores = JSON.parse(localStorage.getItem('mathRunnerScores')) || [];
    let html = scores.slice(0, 3).map((s, i) => 
        `<div class="lb-entry"><span>${i+1}. ${s.name}</span> <span style="color:#00e5ff">${s.time}</span></div>`
    ).join('');
    document.getElementById('lb-list-start').innerHTML = html || "<div class='lb-entry'>Nenhum registro ainda.</div>";
}

function startGame() {
    document.getElementById('start-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('game-ui').style.display = 'flex';
    
    isPlaying = true; timeSurvived = 0; lives = 3; combo = 0; speedMult = 1; player.lane = 1;
    entities = []; particles = [];
    document.querySelectorAll('.heart').forEach(h => h.classList.remove('lost'));
    document.getElementById('combo-display').style.opacity = 0;
    
    createStars();
    spawnGate();
    startMusic();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
}

function gameOver() {
    isPlaying = false;
    stopMusic();
    playTone(150, 'sawtooth', 1.0, 0.3); // Som dramático
    document.getElementById('game-ui').style.display = 'none';
    document.getElementById('game-over-screen').classList.remove('hidden');
    document.getElementById('final-time').innerText = document.getElementById('timer').innerText;
}

function saveScoreAndRestart() {
    let name = document.getElementById('player-name').value || "Anônimo";
    let timeStr = document.getElementById('timer').innerText;
    let timeVal = timeSurvived; 

    let scores = JSON.parse(localStorage.getItem('mathRunnerScores')) || [];
    scores.push({ name, time: timeStr, rawTime: timeVal });
    scores.sort((a, b) => b.rawTime - a.rawTime); 
    localStorage.setItem('mathRunnerScores', JSON.stringify(scores));

    loadLeaderboard();
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('start-screen').classList.remove('hidden');
}

// Eventos de Botões (Substituindo onclick inline)
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', saveScoreAndRestart);

// Inicialização
loadLeaderboard();
draw();
