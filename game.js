/* ============================================================
   壁よけタップゲーム
   - 画面解像度: 100x100（ドット絵前提）
   - キャラクター: 6x6
   - 操作: 画面タップのみ（ワンボタン）
   - 難度上昇: スピードのみ（隙間の広さは一定 = 理不尽さを抑える）
   - 音: Web Audio APIで自動生成（音声ファイル不要）
   - ハイスコア: localStorage に保存
   ============================================================ */

(function () {
  const GW = 100, GH = 100;
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const liveScoreEl = document.getElementById('liveScore');
  const resultEl = document.getElementById('gameResult');
  const resultScoreEl = document.getElementById('resultScore');
  const resultHighEl = document.getElementById('resultHigh');
  const newRecordEl = document.getElementById('newRecordTag');
  const startCaption = document.getElementById('startCaption');

  const HIGH_KEY = 'nutfes45_wallgame_highscore';
  let highScore = parseInt(localStorage.getItem(HIGH_KEY) || '0', 10);
  resultHighEl.textContent = highScore;

  function accent() {
    return getComputedStyle(document.body).getPropertyValue('--teal').trim() || '#0BA4C8';
  }

  /* ---- 音（自動生成） ---- */
  let actx;
  function audioCtx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function beep(freq, dur, type, gain) {
    const ac = audioCtx();
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'square';
    osc.frequency.value = freq;
    g.gain.value = gain || 0.06;
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    osc.connect(g); g.connect(ac.destination);
    osc.start(); osc.stop(ac.currentTime + dur);
  }
  const sfxJump = () => beep(520, 0.08, 'square', 0.05);
  const sfxScore = () => beep(880, 0.10, 'triangle', 0.06);
  const sfxHit = () => { beep(160, 0.25, 'sawtooth', 0.08); beep(90, 0.3, 'square', 0.06); };

  let bgmTimer = null;
  const bgmNotes = [220, 262, 196, 247];
  let bgmStep = 0;
  function startBgm() {
    stopBgm();
    bgmTimer = setInterval(() => {
      beep(bgmNotes[bgmStep % bgmNotes.length], 0.12, 'sine', 0.025);
      bgmStep++;
    }, 260);
  }
  function stopBgm() { if (bgmTimer) { clearInterval(bgmTimer); bgmTimer = null; } }

  /* ---- ゲーム状態 ---- */
  let state = 'ready'; // ready -> playing -> over
  let player, walls, particles, score, spawnDist, lastSpawnAt, speed, elapsed, loopId;

  function reset() {
    player = { x: 22, y: GH / 2, vy: 0, r: 3 };
    walls = [];
    particles = [];
    score = 0;
    spawnDist = 0;
    lastSpawnAt = 0;
    speed = 0.9;
    elapsed = 0;
    liveScoreEl.textContent = 'SCORE 0';
    resultEl.hidden = true;
  }
  reset();

  function spawnWall() {
    const w = 6;
    const gap = 26; // 隙間の広さは常に一定（難度は速度のみで上げる）
    const gapY = 12 + Math.random() * (GH - 24 - gap);
    walls.push({ x: GW, w, gapY, gap, passed: false });
  }

  function spawnParticles(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 2.4,
        vy: (Math.random() - 0.5) * 2.4,
        life: 18 + Math.random() * 10
      });
    }
  }

  function jump() {
    if (state === 'ready') {
      state = 'playing';
      startCaption.style.display = 'none';
      startBgm();
      player.vy = -2.4;
      loopId = requestAnimationFrame(loop);
      return;
    }
    if (state === 'over') {
      reset();
      state = 'playing';
      startBgm();
      player.vy = -2.4;
      loopId = requestAnimationFrame(loop);
      return;
    }
    player.vy = -2.4;
    sfxJump();
  }

  function endGame() {
    state = 'over';
    stopBgm();
    sfxHit();
    spawnParticles(player.x, player.y, accent(), 14);
    const isRecord = score > highScore;
    if (isRecord) {
      highScore = score;
      localStorage.setItem(HIGH_KEY, String(highScore));
    }
    resultScoreEl.textContent = score;
    resultHighEl.textContent = highScore;
    newRecordEl.style.display = isRecord ? 'inline-block' : 'none';
    resultEl.hidden = false;
  }

  function loop() {
    elapsed++;

    // 物理
    player.vy += 0.14;
    player.y += player.vy;

    // 難度上昇：スコアに応じて速度だけ上げる（隙間は変えない）
    speed = Math.min(3.0, 0.9 + score * 0.035);

    // 壁を進める
    walls.forEach(w => { w.x -= speed; });
    walls = walls.filter(w => w.x + w.w > -4);

    // 移動距離で壁を生成（速度が上がっても壁同士の間隔は一定に保たれる）
    spawnDist += speed;
    if (spawnDist - lastSpawnAt > 46) {
      spawnWall();
      lastSpawnAt = spawnDist;
    }

    // 判定
    let hit = (player.y - player.r < 0) || (player.y + player.r > GH);
    walls.forEach(w => {
      const withinX = player.x + player.r > w.x && player.x - player.r < w.x + w.w;
      if (withinX) {
        const inGap = player.y - player.r > w.gapY && player.y + player.r < w.gapY + w.gap;
        if (!inGap) hit = true;
      }
      if (!w.passed && w.x + w.w < player.x) {
        w.passed = true;
        score++;
        liveScoreEl.textContent = 'SCORE ' + score;
        sfxScore();
      }
    });

    // パーティクル更新
    particles.forEach(p => { p.x += p.vx; p.y += p.vy; p.life--; });
    particles = particles.filter(p => p.life > 0);

    draw();

    if (hit) { endGame(); return; }
    loopId = requestAnimationFrame(loop);
  }

  function draw() {
    const col = accent();
    ctx.clearRect(0, 0, GW, GH);

    // 背景のうっすらライン（線のみ）
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < GW; gx += 10) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, GH); ctx.stroke();
    }

    // 壁（四角のみ）
    ctx.fillStyle = col;
    walls.forEach(w => {
      ctx.fillRect(w.x, 0, w.w, w.gapY);
      ctx.fillRect(w.x, w.gapY + w.gap, w.w, GH - (w.gapY + w.gap));
    });

    // パーティクル（円のみ）
    ctx.fillStyle = col;
    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
      ctx.fill();
    });

    // キャラクター（6x6、四角の組み合わせのみ）
    const cx = Math.round(player.x - 3);
    const cy = Math.round(player.y - 3);
    ctx.fillStyle = '#E8EEFF';
    ctx.fillRect(cx, cy, 6, 6);
    ctx.fillStyle = col;
    ctx.fillRect(cx + 3, cy + 1, 2, 2); // 目（アクセント色の1ドット）
  }

  draw();

  canvas.addEventListener('pointerdown', jump);
  resultEl.addEventListener('pointerdown', jump);
})();
