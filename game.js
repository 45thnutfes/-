/* ============================================================
   壁よけタップゲーム
   - 画面解像度: 100x100（ドット絵前提）
   - キャラクター: 6x6
   - 操作: 画面タップのみ（ワンボタン）
   - 難度上昇: スピード＋隙間の広さ（序盤は隙間を広めにし、スコアに応じて既定の広さまで徐々に狭める）
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

  // 経過時間ベースの進行用（端末の性能・リフレッシュレート差を吸収する）
  const REF_FPS = 60; // 既存の速度・加速度の数値は60fps基準で調整されているため、この基準に正規化する
  const MAX_DT_FACTOR = 5; // タブ非アクティブからの復帰直後などdeltaTimeが跳ねた場合の1フレームあたりの上限
  let lastTime = null;

  const SPEED_START = 0.65; // 初速（従来と同じ、序盤の速さは維持）
  const SPEED_MAX = 3.6; // 最高速度（従来の2.6より引き上げ、後半の伸びを体感しやすくする）
  const SPEED_GROWTH = 0.025; // スコア1につき上がる速度（従来の0.025から3倍）

  function reset() {
    player = { x: 22, y: GH / 2, vy: 0, r: 3 };
    walls = [];
    particles = [];
    score = 0;
    spawnDist = 0;
    lastSpawnAt = 0;
    speed = SPEED_START;
    elapsed = 0;
    liveScoreEl.textContent = 'SCORE 0';
    resultEl.classList.remove('show');
  }
  reset();

  const GAP_START = 50; // 序盤の隙間の広さ（易しめ）
  const GAP_MIN = 30; // 隙間の広さの下限（従来のバランスと同じ値）
  const GAP_EASE_SCORE = 15; // このスコアに達するまでに隙間がGAP_MINまで狭まる

  function spawnWall() {
    const w = 6;
    const gap = Math.max(GAP_MIN, GAP_START - (GAP_START - GAP_MIN) * (score / GAP_EASE_SCORE));
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
      window.dispatchEvent(new CustomEvent('gameStart'));
      startBgm();
      player.vy = -2.4;
      lastTime = null;
      loopId = requestAnimationFrame(loop);
      return;
    }
    if (state === 'over') {
      reset();
      state = 'playing';
      window.dispatchEvent(new CustomEvent('gameStart'));
      startBgm();
      player.vy = -2.4;
      lastTime = null;
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
    resultEl.classList.add('show');
    window.dispatchEvent(new CustomEvent('gameEnd', { detail: { score, highScore } }));
  }

  function loop(timestamp) {
    // 実経過時間を「60fps基準で何フレーム分か」に正規化する。
    // こうすることで既存のフレーム単位の数値（重力・速度など）をそのまま使いつつ、
    // 端末の性能やリフレッシュレートに関わらず実時間基準で進行するようになる。
    let dtFactor;
    if (lastTime === null) {
      dtFactor = 1; // 初回フレームは1フレーム分として扱う
    } else {
      dtFactor = Math.min((timestamp - lastTime) / 1000 * REF_FPS, MAX_DT_FACTOR);
    }
    lastTime = timestamp;

    elapsed += dtFactor;

    // 物理
    player.vy += 0.13 * dtFactor;
    player.y += player.vy * dtFactor;

    // 難度上昇：スコアに応じて速度・隙間の広さを変化させる
    speed = Math.min(SPEED_MAX, SPEED_START + score * SPEED_GROWTH);

    // 壁を進める
    walls.forEach(w => { w.x -= speed * dtFactor; });
    walls = walls.filter(w => w.x + w.w > -4);

    // 移動距離で壁を生成（速度が上がっても壁同士の間隔は一定に保たれる）
    spawnDist += speed * dtFactor;
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
    particles.forEach(p => { p.x += p.vx * dtFactor; p.y += p.vy * dtFactor; p.life -= dtFactor; });
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

  canvas.addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  resultEl.addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
})();
