(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // --- Web Audio API ---
  let audioContext;
  let soundBank = {};
  let isAudioReady = false;
  let isBatchAudioLoading = false; // NEW: Tracks if TTS audio is loading

  // Force pixelated rendering
  ctx.imageSmoothingEnabled = false;

  // --- Get elements for start screen and controls ---
  const controls = document.querySelector('.controls');
  const startScreen = document.getElementById('start-screen');
  const loadingScreen = document.getElementById('loading-screen'); // NEW
  const playBtn = document.getElementById('play-btn');

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
  let explosions = [];
  let pendingSpawn = false; // Wait for explosion before next wave

  let level = 1;
  let levelWords = [];
  let hitsThisLevel = 0;
  const hitsPerLevel = 10;
  let score = 0;
  let currentTargetWord = '';
  const enemySpeedBase = 70; // This is no longer used for Y-movement

  // --- New variables for stepped enemy movement ---
  let enemyMoveTimer = 0; // Timer to track when to move
  const enemyMoveInterval = 1.0; // Time in seconds between steps (slower)
  const enemyMoveStepY = 25; // How many pixels to move down on wall hit
  const enemyMoveStepX = 15; // How many pixels to move sideways
  let enemyDirection = 1; // 1 for right, -1 for left
  const enemyStartY = 30;

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
    "but","not","what","all","were","we","when","your","can","said",
    "there","use","an","each","which","she","do","how","their","if"
  ];

  function resize() {
    // Keep CSS layout (var(--app-height)) in sync with the real viewport height.
    document.documentElement.style.setProperty(
      '--app-height',
      `${window.innerHeight}px`
    );

    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    player.y = height - 80;
    clampPlayerX();
  }


  window.addEventListener('resize', resize);

  // On mobile, orientation changes may update innerHeight a little later,
  // so nudge resize shortly after the event.
  window.addEventListener('orientationchange', () => {
    setTimeout(resize, 250);
  });

  // --- Fullscreen Change Listeners ---
  // These events fire *after* the browser has entered or exited
  // fullscreen, ensuring window.innerHeight is correct.
  document.addEventListener('fullscreenchange', resize);
  document.addEventListener('webkitfullscreenchange', resize);
  document.addEventListener('mozfullscreenchange', resize);
  document.addEventListener('msfullscreenchange', resize);


  resize();

  // --- Audio Functions ---

  /**
   * Plays a sound from the sound bank.
   * @param {string} name - The name of the sound to play.
   */
  function playSound(name) {
    if (isAudioReady && soundBank[name]) {
      soundBank[name]();
    }
  }

  /**
   * Initializes the Web Audio API and creates the sound synthesizer functions.
   * This MUST be called from a user-initiated event (like a click).
   */
  function initAudio() {
    if (audioContext) return; // Already initialized

    try {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      isAudioReady = true;

      // --- Define all our sounds ---

      soundBank['shoot'] = () => {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1200, now);
        osc.frequency.linearRampToValueAtTime(400, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.08);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.08);
      };

      soundBank['enemyShoot'] = () => {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.1);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.1);
      };

      soundBank['hitCorrect'] = () => {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sawtooth'; // A much harsher, 8-bit-like wave
        osc.frequency.setValueAtTime(400, now); // Start at a medium-low pitch
        // Rapidly drop the pitch to create an explosion/poof effect
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.1); 
        gain.gain.setValueAtTime(0.3, now);
        // Use exponentialRamp for a more natural-sounding quick decay
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); 
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.12); // Let it ring out just a tiny bit longer
      };

      soundBank['hitWrong'] = () => {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      };

      soundBank['playerHit'] = () => {
        // Generate white noise for an explosion
        const now = audioContext.currentTime;
        const bufferSize = audioContext.sampleRate * 0.5; // 0.5 sec
        const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;
        const gain = audioContext.createGain();
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        noise.connect(gain);
        gain.connect(audioContext.destination);
        noise.start(now);
        noise.stop(now + 0.5);
      };
      
      // Alias for a game over
      soundBank['gameOver'] = soundBank['playerHit'];

      soundBank['levelUp'] = () => {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'square';
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);

        // Arpeggio
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.linearRampToValueAtTime(554.37, now + 0.1);
        osc.frequency.linearRampToValueAtTime(659.25, now + 0.2);
        osc.frequency.linearRampToValueAtTime(880, now + 0.3);

        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.5);
      };

      soundBank['startGame'] = () => {
        const now = audioContext.currentTime;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(261.63, now); // C4
        osc.frequency.setValueAtTime(329.63, now + 0.1); // E4
        osc.frequency.setValueAtTime(392.00, now + 0.2); // G4
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.connect(gain);
        gain.connect(audioContext.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      };

    } catch (e) {
      console.error("Web Audio API is not supported in this browser", e);
      isAudioReady = false;
    }
  }

  /**
   * Creates a function that plays a given AudioBuffer.
   * This fits the soundBank pattern for our loaded TTS sounds.
   * @param {AudioBuffer} buffer - The decoded audio buffer.
   * @returns {Function} A function that plays the sound.
   */
  function createBufferPlayer(buffer) {
    return () => {
      if (!isAudioReady) return;
      try {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        source.start(0);
      } catch (e) {
        console.error("Error playing buffer:", e);
      }
    };
  }

  /**
   * Fetches TTS audio for words, decodes them, and stores them in the soundBank.
   * @param {string[]} words - An array of words to fetch.
   */
  async function loadWordAudio(words) {
    // Don't run if AudioContext isn't ready or there are no words
    if (!isAudioReady || !words || words.length === 0) {
      return;
    }
  
    isBatchAudioLoading = true;
    // drawLoadingScreen(); // No longer needed, HTML loader is shown
  
    try {
      // 1. Call our new API route
      const response = await fetch('/api/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words })
      });
  
      if (!response.ok) {
        throw new Error(`Audio API failed with status ${response.status}`);
      }
  
      const audioMap = await response.json();
      
      // This array will hold all the decoding promises
      const decodePromises = [];
  
      for (const [word, base64Audio] of Object.entries(audioMap)) {
        // 2. Decode Base64 string back into binary data
        const byteCharacters = atob(base64Audio);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        
        // 3. Decode the binary audio data into a Web Audio Buffer
        // This is an async operation, so we add its promise to the array.
        decodePromises.push(
          audioContext.decodeAudioData(byteArray.buffer)
            .then(decodedBuffer => {
              // 4. When decoded, create and store the player function
              soundBank[word] = createBufferPlayer(decodedBuffer);
            })
            .catch(err => {
              console.error(`Failed to decode audio for "${word}":`, err);
            })
        );
      }
      
      // 5. Wait for ALL audio files to be decoded before proceeding
      await Promise.all(decodePromises);
  
    } catch (error) {
      console.error('Failed to load word audio:', error);
      // Don't block the game, just proceed without word audio
    } finally {
      // 6. Signal that loading is complete
      isBatchAudioLoading = false;
    }
  }

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

  function startLevel() { // No longer async
    hitsThisLevel = 0;
    levelWords = pickRandomWords(6);
    if (levelWords.length < 6) {
      levelWords = pickRandomWords(6);
    }
    // spawnBatch is no longer async
    spawnBatch(); // No longer awaited
  }

  function spawnBatch() { // No longer async
    bullets = [];
    enemyBullets = [];
    enemies = [];

    if (!levelWords || levelWords.length !== 6) {
      levelWords = pickRandomWords(6);
    }

    // --- Audio is pre-loaded, so we just pick a word ---
    currentTargetWord = levelWords[Math.floor(Math.random() * levelWords.length)];

    // --- NEW: Play the target word sound ---
    // We play it here so the player hears it as the wave appears.
    playSound(currentTargetWord);

    const words = levelWords.slice();
    for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [words[i], words[j]] = [words[j], words[i]];
    }

    // Reset the step timer so enemies wait before the first step
    enemyMoveTimer = enemyMoveInterval;
    // Reset enemy direction to move right first
    enemyDirection = 1;

  const margin = 70;
  const count = words.length;
  // Calculate spacing for a nice, even formation
  const spacing = count > 1 ? (width - margin * 2) / (count - 1) : 0;

  for (let i = 0; i < count; i++) {
    // Calculate a precise, non-random x position
    const x = margin + spacing * i;
    enemies.push({
      // Clamp the x position to stay on screen
      x: Math.max(60, Math.min(width - 60, x)),
      // All enemies share the same starting Y (Goal 1)
      y: enemyStartY,
      width: 90,
      height: 40,
      word: words[i],
      // 'speed' is no longer needed, movement is handled by the global timer
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
    
    playSound('shoot');
  }

  function createExplosion(x, y) {
    const explosionDuration = 0.4; // 0.4 seconds
    explosions.push({
      x: x,
      y: y,
      timer: explosionDuration,
      maxTimer: explosionDuration
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
    if (gameOver) return; // Don't trigger twice

    gameOver = true;
    gameOverReason = reason || "Game Over";

    // Play the appropriate sound based on the reason
    switch (reason) {
      case "Wrong word!":
        playSound('hitWrong');
        break;
      case "You were hit!":
        playSound('playerHit');
        break;
      case "An enemy slipped through!":
        playSound('gameOver');
        break;
      default:
        playSound('gameOver');
    }
  }

  function restartGame() { // No longer async
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
    // startLevel is no longer async
    startLevel(); // No longer awaited
    playSound('startGame');
  }

  function update(dt) {
    if (gameOver) return;

    // --- Update explosions ---
    for (let i = explosions.length - 1; i >= 0; i--) {
      const expl = explosions[i];
      expl.timer -= dt;
      if (expl.timer <= 0) {
        explosions.splice(i, 1);
      }
    }

    // --- Check for pending spawn ---
    // If we are waiting to spawn, and all explosions are finished, spawn now.
    if (pendingSpawn && explosions.length === 0) {
      pendingSpawn = false; // Set to false immediately to prevent re-triggering
      
      // Functions are no longer async, so we can call them directly.
      if (hitsThisLevel >= hitsPerLevel) {
        level++;
        playSound('levelUp');
        startLevel(); // No longer awaited
      } else {
        spawnBatch(); // No longer awaited
      }
    }

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

    // --- Enemy formation movement (Space Invaders style) ---
    enemyMoveTimer -= dt; // Count down the timer
    let formationMovedDown = false;
    let formationMovedSide = false;

    if (enemyMoveTimer <= 0) {
      enemyMoveTimer = enemyMoveInterval; // Reset timer
      formationMovedSide = true; // Flag that we are trying to move sideways

      // Check for wall hits *before* moving
      let hitWall = false;
      for (const e of enemies) {
        const nextX = e.x + (enemyMoveStepX * enemyDirection);
        const halfW = e.width / 2;
        if (nextX > width - halfW - 10 || nextX < halfW + 10) {
          hitWall = true;
          break;
        }
      }

      if (hitWall) {
        formationMovedDown = true; // Move down instead of sideways
        formationMovedSide = false;
        enemyDirection *= -1; // Change direction
      }
    }

    // enemies
    for (const e of enemies) {
      // Apply movement based on flags
      if (formationMovedDown) {
        e.y += enemyMoveStepY;
      }
      if (formationMovedSide) {
        e.x += (enemyMoveStepX * enemyDirection);
      }

      // REMOVED: The smooth horizontal wave movement.
      // The new blocky movement replaces it.
      /*
      if (level >= 4) { ... }
      */

      // Enemy shooting logic (remains the same)
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
          playSound('enemyShoot');
        }
      }

      // Game over check (remains the same)
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
    // Only check collisions if not game over AND not waiting for the next wave
    if (!gameOver && !pendingSpawn) {
      outerLoop:
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (rectOverlap(b, e)) {
            if (e.word === currentTargetWord) {
              // --- CORRECT HIT ---
              score++;
              hitsThisLevel++;
              playSound('hitCorrect');
              createExplosion(e.x, e.y); // Create explosion
              pendingSpawn = true; // Set flag to spawn next wave

              // Clear all remaining enemies and bullets manually
              // The pendingSpawn logic will handle the respawn.
              enemies = [];
              bullets = [];

            } else {
              // --- WRONG HIT ---
              createExplosion(e.x, e.y); // Create explosion
              setGameOver("Wrong word!");

              // Remove just the specific enemy and bullet
              enemies.splice(j, 1);
              bullets.splice(i, 1);
            }
            // Stop all collision checks for this frame
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

    // Static starfield (no more smooth animation)
    ctx.fillStyle = "#333"; // A bit brighter
    for (let i = 0; i < 40; i++) {
      const x = (i * 53 * 3) % width; // Change positions
      const y = (i * 137) % height;
      ctx.fillRect(x, y, 2, 2); // Blocky 2x2 stars
    }
}

  

  function draw() {
    // operations (like resize) can reset it.
    ctx.imageSmoothingEnabled = false;
    drawBackground();

    // player ship (now a blocky rectangle)
    ctx.fillStyle = "#00FF00"; // Classic arcade green
    ctx.fillRect(
      player.x - player.width / 2,
      player.y - player.height / 2,
      player.width,
      player.height
    );
    // Add a "cannon"
    ctx.fillRect(
      player.x - 4,
      player.y - player.height / 2 - 8,
      8,
      8
    );

    // player bullets
    ctx.fillStyle = "#ffffff";
    for (const b of bullets) {
      ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
    }

    // enemies
    for (const e of enemies) {
      ctx.fillStyle = "#FF0000"; // Classic arcade red
      ctx.fillRect(e.x - e.width / 2, e.y - e.height / 2, e.width, e.height);
      ctx.fillStyle = "#ffffff";
      // Use the 8-bit font
      ctx.font = "10px 'Press Start 2P'";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(e.word, e.x, e.y + 1); // +1 for better pixel alignment
    }

    // enemy bullets
    ctx.fillStyle = "#ffdd33";
    for (const b of enemyBullets) {
      ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
    }

    // --- DRAW EXPLOSIONS ---
    for (const expl of explosions) {
      const progress = 1 - (expl.timer / expl.maxTimer); // 0 -> 1
      const stage = Math.floor(progress * 4); // 0, 1, 2, 3

      // We'll draw expanding, multi-colored squares
      switch (stage) {
        case 0: // Small white flash
          ctx.fillStyle = "#FFFFFF";
          ctx.fillRect(expl.x - 4, expl.y - 4, 8, 8);
          ctx.fillRect(expl.x - 8, expl.y + 2, 4, 4);
          ctx.fillRect(expl.x + 4, expl.y - 6, 4, 4);
          break;
        case 1: // Yellow/Orange expanding
          ctx.fillStyle = "#FFFF00"; // Yellow
          ctx.fillRect(expl.x - 8, expl.y - 8, 16, 16);
          ctx.fillStyle = "#FFA500"; // Orange
          ctx.fillRect(expl.x - 4, expl.y - 4, 8, 8);
          break;
        case 2: // Orange/Red, bigger
          ctx.fillStyle = "#FFA500"; // Orange
          ctx.fillRect(expl.x - 12, expl.y - 12, 24, 24);
          ctx.fillStyle = "#FF0000"; // Red
          ctx.fillRect(expl.x - 6, expl.y - 6, 12, 12);
          break;
        case 3: // Fading Red/Orange (disappearing)
          ctx.fillStyle = "#FF0000"; // Red
          ctx.fillRect(expl.x - 8, expl.y + 4, 8, 8);
          ctx.fillRect(expl.x + 4, expl.y - 4, 8, 8);
          ctx.fillStyle = "#FFA500"; // Orange
          ctx.fillRect(expl.x + 2, expl.y + 8, 4, 4);
          ctx.fillRect(expl.x - 6, expl.y - 6, 4, 4);
          break;
      }
    }
    // --- END EXPLOSIONS ---

    // HUD
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = "10px 'Press Start 2P'";
    ctx.fillText("Level: " + level, 10, 8);
    ctx.fillText("Score: " + score, 10, 26);
    ctx.fillText("Streak: " + hitsThisLevel + " / " + hitsPerLevel, 10, 44);

    ctx.textBaseline = "bottom";
    ctx.font = "10px 'Press Start 2P'";
    // Adjust HUD to not overlap buttons
    ctx.fillText("Hit the word:", 10, height - 120);
    ctx.font = "16px 'Press Start 2P'";
    ctx.fillStyle = "#00FF00"; // Make the target word green
    ctx.fillText(currentTargetWord, 10, height - 92);

    if (gameOver) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      ctx.font = "20px 'Press Start 2P'";
      ctx.fillText("Game Over", width / 2, height / 2 - 40);

      ctx.font = "10px 'Press Start 2P'";
      ctx.fillText(gameOverReason, width / 2, height / 2);

      ctx.font = "10px 'Press Start 2P'";
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
    const onShootPress = (e) => { // No longer async
      e.preventDefault();
      if (gameOver) {
        // restartGame is no longer async
        restartGame(); // No longer awaited
      } else {
        shoot();
      }
    };

    shootBtn.addEventListener('touchstart', onShootPress, { passive: false });
    shootBtn.addEventListener('mousedown', onShootPress, { passive: false });
  }
  
  // Set up the new controls
  setupControls();

  // --- Fullscreen API Handler ---
  function enterFullScreen() {
    const element = document.documentElement; // Request fullscreen for the whole page
    const requestFullScreen =
      element.requestFullscreen ||
      element.webkitRequestFullscreen ||
      element.mozRequestFullScreen ||
      element.msRequestFullscreen;

    const fallbackToPseudoFullscreen = () => {
      // For browsers (especially iOS/Firefox) that don't support fullscreen
      // for arbitrary elements: use our dynamic height + a tiny scroll.
      resize();
      window.scrollTo(0, 1);
    };

    if (requestFullScreen) {
      const result = requestFullScreen.call(element);
      // Modern Fullscreen API returns a Promise; if it fails, use fallback.
      if (result && typeof result.catch === 'function') {
        result.catch(() => {
          fallbackToPseudoFullscreen();
        });
      }
    } else {
      fallbackToPseudoFullscreen();
    }
  }


  // --- Start Button Listener ---
  playBtn.addEventListener('click', async () => { // Make the handler async
    // 0. Hide start screen, show loading screen
    startScreen.style.display = 'none';
    loadingScreen.style.display = 'flex'; // Show the new loader

    // 1. Initialize the Audio Context (MUST be first)
    initAudio();
    
    // 2. Load ALL audio for the entire game
    // This is the part that takes time.
    await loadWordAudio(sightWords);
    // Audio is now loaded (or failed). 'isBatchAudioLoading' is false.

    // 3. Hide loading screen
    loadingScreen.style.display = 'none';

    // 4. Show game elements
    canvas.style.display = 'block';
    controls.style.display = 'flex'; // Use 'flex' as defined in CSS

    // 5. Make sure our CSS var and canvas size match the current viewport
    resize();

    // 6. Try real fullscreen where supported; otherwise fall back
    //    to the pseudo-fullscreen behavior (mobile iOS/Firefox).
    enterFullScreen();

    // 7. A small delayed resize helps once browser toolbars finish animating.
    setTimeout(resize, 350);

    // 8. Start the game logic. This is no longer async.
    restartGame(); // No longer awaited
    
    // 9. Start the main game loop
    lastTime = performance.now(); // Initialize lastTime right before starting
    requestAnimationFrame(loop);
  });


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

  // We no longer start the game here, we wait for the play button.
})();

