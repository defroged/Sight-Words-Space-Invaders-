(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  let width = window.innerWidth;
  let height = window.innerHeight;

  const player = {
    x: width / 2,
    y: height - 80,
    width: 70,
    height: 26
  };

  let bullets = [];
  let enemies = [];
  let enemyBullets = [];

  let level = 1;
  let levelWords = [];
  let hitsThisLevel = 0;
  const hitsPerLevel = 10;
  let score = 0;
  let currentTargetWord = '';
  const enemySpeedBase = 70;

  let gameOver = false;
  let gameOverReason = '';

  let lastShotTime = 0;
  const shotCooldown = 200; // ms

  let rightTouchId = null;

  const sightWords = [
    "the","and","to","of","a","in","is","you","that","it",
    "he","was","for","on","are","as","with","his","they","I",
    "at","be","this","have","from","or","one","had","by","word",
    "but","not","what","all","were","we","when","your","can","said",
    "there","use","an","each","which","she","do","how","their","if"
  ];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    player.y = height - 80;
    clampPlayerX();
  }

  window.addEventListener('resize', resize);
  resize();

  function clampPlayerX() {
    const half = player.width / 2;
    if (player.x < half) player.x = half;
    if (player.x > width - half) player.x = width - half;
  }

  function pickRandomWords(count) {
    const pool = sightWords.slice();
    const chosen = [];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      chosen.push(pool.splice(idx, 1)[0]);
    }
    return chosen;
  }

  function startLevel() {
    hitsThisLevel = 0;
    levelWords = pickRandomWords(6);
    if (levelWords.length < 6) {
      // reset if we ever run out (shouldn't really happen)
      levelWords = pickRandomWords(6);
    }
    spawnBatch();
  }

  function spawnBatch() {
    bullets = [];
    enemyBullets = [];
    enemies = [];

    if (!levelWords || levelWords.length !== 6) {
      levelWords = pickRandomWords(6);
    }

    // choose a target word from the 6 for this wave
    currentTargetWord = levelWords[Math.floor(Math.random() * levelWords.length)];

    // randomize order of words for enemy positions
    const words = levelWords.slice();
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }

    const margin = 70;
    const count = words.length;
    const spacing = count > 1 ? (width - margin * 2) / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const x = margin + spacing * i + (Math.random() * 40 - 20); // slight randomness
      const y = -Math.random() * 160 - 60;
      enemies.push({
        x: Math.max(60, Math.min(width - 60, x)),
        y,
        width: 90,
        height: 40,
        word: words[i],
        speed: enemySpeedBase + (level - 1) * 25,
        shootTimer: 0.8 + Math.random() * 1.5
      });
    }
  }

  function shoot() {
    if (gameOver) return;
    const now = performance.now();
    if (now - lastShotTime < shotCooldown) return;
    lastShotTime = now;

    bullets.push({
      x: player.x,
      y: player.y - player.height / 2,
      width: 6,
      height: 16,
      speed: 520
    });
  }

  function rectOverlap(a, b) {
    const aL = a.x - a.width / 2;
    const aR = a.x + a.width / 2;
    const aT = a.y - a.height / 2;
    const aB = a.y + a.height / 2;

    const bL = b.x - b.width / 2;
    const bR = b.x + b.width / 2;
    const bT = b.y - b.height / 2;
    const bB = b.y + b.height / 2;

    return aL < bR && aR > bL && aT < bB && aB > bT;
  }

  function setGameOver(reason) {
    gameOver = true;
    gameOverReason = reason || "Game Over";
  }

  function restartGame() {
    level = 1;
    score = 0;
    hitsThisLevel = 0;
    gameOver = false;
    gameOverReason = "";
    bullets = [];
    enemies = [];
    enemyBullets = [];
    player.x = width / 2;
    clampPlayerX();
    startLevel();
  }

  function update(dt) {
    if (gameOver) return;

    // player is moved directly by touch; nothing to update here besides clamp
    clampPlayerX();

    // bullets (player)
    for (const b of bullets) {
      b.y -= b.speed * dt;
    }
    bullets = bullets.filter(b => b.y + b.height / 2 > 0);

    // enemies
    for (const e of enemies) {
      e.y += e.speed * dt;

      // from level 4, slight weaving movement
      if (level >= 4) {
        const wave = Math.sin((e.y + e.word.length * 13) / 50);
        e.x += wave * 35 * dt;
        const halfW = e.width / 2;
        if (e.x < halfW + 10) e.x = halfW + 10;
        if (e.x > width - halfW - 10) e.x = width - halfW - 10;
      }

      // from level 3, enemies shoot
      if (level >= 3) {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 0.8 + Math.random() * 1.5;
          enemyBullets.push({
            x: e.x,
            y: e.y + e.height / 2,
            width: 6,
            height: 18,
            speed: 260 + level * 35
          });
        }
      }

      // enemy reaches bottom = fail
      if (e.y - e.height / 2 > height) {
        setGameOver("An enemy slipped through!");
      }
    }

    // enemy bullets
    for (const b of enemyBullets) {
      b.y += b.speed * dt;
    }
    enemyBullets = enemyBullets.filter(b => b.y - b.height / 2 < height + 30);

    // collisions: player bullets with enemies
    if (!gameOver) {
      outerLoop:
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (rectOverlap(b, e)) {
            if (e.word === currentTargetWord) {
              // correct target
              score++;
              hitsThisLevel++;

              if (hitsThisLevel >= hitsPerLevel) {
                level++;
                startLevel();
              } else {
                // new wave with same 6 words
                spawnBatch();
              }
            } else {
              // wrong word
              setGameOver("Wrong word!");
            }
            break outerLoop;
          }
        }
      }
    }

    // collisions: enemy bullets with player
    if (!gameOver) {
      for (const b of enemyBullets) {
        if (rectOverlap(b, player)) {
          setGameOver("You were hit!");
          break;
        }
      }
    }
  }

  function drawBackground() {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // simple starfield
    ctx.fillStyle = "#111";
    for (let i = 0; i < 40; i++) {
      const x = (i * 53) % width;
      const y = (i * 137 + (Date.now() * 0.05)) % height;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function draw() {
    drawBackground();

    // player ship
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.fillStyle = "#00ffcc";
    ctx.beginPath();
    ctx.moveTo(-player.width / 2, player.height / 2);
    ctx.lineTo(player.width / 2, player.height / 2);
    ctx.lineTo(0, -player.height / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // player bullets
    ctx.fillStyle = "#ffffff";
    for (const b of bullets) {
      ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
    }

    // enemies
    for (const e of enemies) {
      ctx.fillStyle = "#ff5555";
      ctx.fillRect(e.x - e.width / 2, e.y - e.height / 2, e.width, e.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.word, e.x, e.y);
    }

    // enemy bullets
    ctx.fillStyle = "#ffdd33";
    for (const b of enemyBullets) {
      ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
    }

    // HUD
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "14px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Level: " + level, 10, 8);
    ctx.fillText("Score: " + score, 10, 26);
    ctx.fillText("Streak: " + hitsThisLevel + " / " + hitsPerLevel, 10, 44);

    ctx.textBaseline = "bottom";
    ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Hit the word:", 10, height - 50);
    ctx.font = "26px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(currentTargetWord, 10, height - 22);

    ctx.textAlign = "right";
    ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText("Right half: move ship  |  Left half: shoot", width - 10, height - 18);

    if (gameOver) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font = "30px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("Game Over", width / 2, height / 2 - 40);

      ctx.font = "18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText(gameOverReason, width / 2, height / 2);

      ctx.font = "16px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillText("Tap left side to restart", width / 2, height / 2 + 40);
    }
  }

  // Touch controls
  function movePlayerTo(x) {
    const half = player.width / 2;
    player.x = Math.max(half, Math.min(width - half, x));
  }

  function handleTouchStart(e) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = touch.clientX - rect.left;

      if (x > width / 2) {
        // right side: movement joystick
        if (rightTouchId === null) rightTouchId = touch.identifier;
        movePlayerTo(x);
      } else {
        // left side: shoot or restart
        if (gameOver) {
          restartGame();
        } else {
          shoot();
        }
      }
    }
  }

  function handleTouchMove(e) {
    e.preventDefault();
    if (rightTouchId === null) return;
    const rect = canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === rightTouchId) {
        const x = touch.clientX - rect.left;
        movePlayerTo(x);
      }
    }
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === rightTouchId) {
        rightTouchId = null;
      }
    }
  }

  canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
  canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
  canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  // Main loop
  let lastTime = 0;
  function loop(timestamp) {
    const dt = (timestamp - lastTime) / 1000 || 0;
    lastTime = timestamp;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  restartGame();
  requestAnimationFrame(loop);
})();