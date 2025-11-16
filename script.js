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

  // --- New state variables for button controls ---
  let moveLeft = false;
  let moveRight = false;
  const playerSpeed = 350; // pixels per second

  // --- Get button elements from the DOM ---
  const leftBtn = document.getElementById('left-btn');
  const rightBtn = document.getElementById('right-btn');
  const shootBtn = document.getElementById('shoot-btn');

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

    currentTargetWord = levelWords[Math.floor(Math.random() * levelWords.length)];

    const words = levelWords.slice();
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }

    const margin = 70;
    const count = words.length;
    const spacing = count > 1 ? (width - margin * 2) / (count - 1) : 0;

    for (let i = 0; i < count; i++) {
      const x = margin + spacing * i + (Math.random() * 40 - 20);
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

    // --- Player movement based on button state ---
    if (moveLeft) {
      player.x -= playerSpeed * dt;
    }
    if (moveRight) {
      player.x += playerSpeed * dt;
    }
    clampPlayerX(); // Clamp player position after moving

    // bullets (player)
    for (const b of bullets) {
      b.y -= b.speed * dt;
    }
    bullets = bullets.filter(b => b.y + b.height / 2 > 0);

    // enemies
    for (const e of enemies) {
      e.y += e.speed * dt;

      if (level >= 4) {
        const wave = Math.sin((e.y + e.word.length * 13) / 50);
        e.x += wave * 35 * dt;
        const halfW = e.width / 2;
        if (e.x < halfW + 10) e.x = halfW + 10;
        if (e.x > width - halfW - 10) e.x = width - halfW - 10;
      }

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
              score++;
              hitsThisLevel++;

              if (hitsThisLevel >= hitsPerLevel) {
                level++;
                startLevel();
              } else {
                spawnBatch();
              }
            } else {
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
    // Adjust HUD to not overlap buttons
    ctx.fillText("Hit the word:", 10, height - 120);
    ctx.font = "26px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillText(currentTargetWord, 10, height - 92);

    // Removed the old controls text
    // ctx.textAlign = "right";
    // ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    // ctx.fillText("Right half: move ship  |  Left half: shoot", width - 10, height - 18);

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
      // Updated restart text
      ctx.fillText("Tap SHOOT to restart", width / 2, height / 2 + 40);
    }
  }

  // --- New Control Handlers ---

  function setupControls() {
    // --- Movement Listeners ---
    // We need functions that handle both touch and mouse events
    const startMove = (e, direction) => {
      e.preventDefault();
      if (direction === 'left') moveLeft = true;
      if (direction === 'right') moveRight = true;
    };

    const endMove = (e, direction) => {
      e.preventDefault();
      // Check if the event is a touch event, and if so,
      // only stop moving if all touches are off the button.
      // This is a simple way to handle multi-touch, though
      // for this game, just stopping is fine.
      if (direction === 'left') moveLeft = false;
      if (direction === 'right') moveRight = false;
    };

    // Left Button
    leftBtn.addEventListener('touchstart', (e) => startMove(e, 'left'), { passive: false });
    leftBtn.addEventListener('mousedown', (e) => startMove(e, 'left'), { passive: false });
    leftBtn.addEventListener('touchend', (e) => endMove(e, 'left'), { passive: false });
    leftBtn.addEventListener('touchcancel', (e) => endMove(e, 'left'), { passive: false });
    leftBtn.addEventListener('mouseup', (e) => endMove(e, 'left'), { passive: false });
    leftBtn.addEventListener('mouseleave', (e) => endMove(e, 'left'), { passive: false });

    // Right Button
    rightBtn.addEventListener('touchstart', (e) => startMove(e, 'right'), { passive: false });
    rightBtn.addEventListener('mousedown', (e) => startMove(e, 'right'), { passive: false });
    rightBtn.addEventListener('touchend', (e) => endMove(e, 'right'), { passive: false });
    rightBtn.addEventListener('touchcancel', (e) => endMove(e, 'right'), { passive: false });
    rightBtn.addEventListener('mouseup', (e) => endMove(e, 'right'), { passive: false });
    rightBtn.addEventListener('mouseleave', (e) => endMove(e, 'right'), { passive: false });

    // --- Shoot/Restart Listener ---
    const onShootPress = (e) => {
      e.preventDefault();
      if (gameOver) {
        restartGame();
      } else {
        shoot();
      }
    };

    shootBtn.addEventListener('touchstart', onShootPress, { passive: false });
    shootBtn.addEventListener('mousedown', onShootPress, { passive: false });
  }
  
  // Set up the new controls
  setupControls();

  // Main loop
  let lastTime = 0;
  function loop(timestamp) {
    // Ensure dt is reasonable, especially on the first frame
    let dt = (timestamp - lastTime) / 1000;
    if (dt > 0.1) dt = 0.1; // Cap delta time to prevent large jumps
    lastTime = timestamp;

    // Only run update if dt is valid
    if (dt > 0) {
      update(dt);
    }
    
    draw();
    requestAnimationFrame(loop);
  }

  restartGame();
  requestAnimationFrame(loop);
})();
