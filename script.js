(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // --- Web Audio API ---
  let audioContext;
  let soundBank = {};
  let isAudioReady = false;
  let isBatchAudioLoading = false; // NEW: Tracks if TTS audio is loading
  let currentMusicSource = null; // Tracks the currently playing background music

  // --- Intro Music ---
  const introAudio = new Audio('intro.mp3');
  introAudio.loop = true;
  introAudio.volume = 0.5; // Set volume (0.0 to 1.0)

  // Attempt to autoplay immediately
  introAudio.play().catch(() => {
    // If browser blocks autoplay, wait for the first user interaction
    const playIntroOnInteraction = () => {
      introAudio.play();
      // Remove listeners once played
      document.removeEventListener('click', playIntroOnInteraction);
      document.removeEventListener('touchstart', playIntroOnInteraction);
      document.removeEventListener('keydown', playIntroOnInteraction);
    };
    document.addEventListener('click', playIntroOnInteraction);
    document.addEventListener('touchstart', playIntroOnInteraction);
    document.addEventListener('keydown', playIntroOnInteraction);
  });

  // Force pixelated rendering
  ctx.imageSmoothingEnabled = false;

  // --- Get elements for start screen and controls ---
  const controls = document.querySelector('.controls');
  const startScreen = document.getElementById('start-screen');
  const loadingScreen = document.getElementById('loading-screen'); // NEW
  const playBtn = document.getElementById('play-btn');
    
  // --- NEW: Pause/Review Elements ---
  const pauseBtn = document.getElementById('pause-btn');
  // Removed old pauseMenu references
  const reviewScreen = document.getElementById('review-screen');
  const reviewTitle = document.getElementById('review-title');
  const reviewGrid = document.getElementById('review-grid');
  const reviewActionBtn = document.getElementById('review-action-btn');
  
  let isPaused = false;
  let isInitialReview = true; // Tracks if we are in the pre-game review

  // --- NEW: Game Over Elements ---
  const gameOverScreen = document.getElementById('game-over-screen');
  const gameOverReasonText = document.getElementById('game-over-reason');
  const gameOverScoreText = document.getElementById('game-over-score');
  const restartBtn = document.getElementById('restart-btn');

  let width = window.innerWidth;
  let height = window.innerHeight;

  // --- Visual Assets ---
  let stars = []; // Store star positions and speeds
  let screenShake = 0; // NEW: Controls the intensity of the screen shake

  const player = {
    x: width / 2,
    y: height - 30,
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
  const baseEnemyMoveInterval = 1.0; // Base time in seconds between steps
  let currentEnemyMoveInterval = baseEnemyMoveInterval; // Current time, scales with level
  const enemyMoveStepY = 25; // How many pixels to move down on wall hit
  const enemyMoveStepX = 15; // How many pixels to move sideways
  let enemyDirection = 1; // 1 for right, -1 for left
  const enemyStartY = 30;

  let gameOver = false;
  let gameOverReason = '';

  // --- NEW: Level Up State ---
  let isLevelingUp = false;
  let levelUpTimer = 0;
  const levelUpDuration = 3.0; // 3 seconds

  // --- NEW: Game Start (Warp In) State ---
  let isGameStarting = false;

  // --- NEW: Boss Intro State ---
  let isBossIntro = false;
  let bossIntroTimer = 0;
  const BOSS_INTRO_DURATION = 9.8; // Exactly 9.8 seconds
  const BOSS_TARGET_Y = 120; // Where the boss settles

  let lastShotTime = 0;
  const shotCooldown = 100; // ms (Reduced to make shooting feel snappy and reactive)

  // --- New state variables for button controls ---
  let moveLeft = false;
  let moveRight = false;
  const playerSpeed = 350; // pixels per second

  // --- Get button elements from the DOM ---
  const leftBtn = document.getElementById('left-btn');
  const rightBtn = document.getElementById('right-btn');
  const replayBtn = document.getElementById('replay-btn'); // NEW

const sightWords = [
  "clean",
  "dirty",
  "beautiful",
  "ugly",
  "wet",
  "dry",
  "good",
  "bad",
  "happy",
  "sad",
  "strong",
  "weak",
  "He",
  "She",
  "young",
  "old",
  "fat",
  "thin",
  "tall",
  "short"
];

  function initStars() {
    stars = [];
    const starCount = 150; // Increased count for better density
    for (let i = 0; i < starCount; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        // z represents depth: 1 is close/fast, 4 is far/slow
        z: Math.random() * 3 + 1 
      });
    }
  }

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
    player.y = height - 30;
    clampPlayerX();
    
    // Re-initialize stars on resize to cover new area
    initStars();
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
   * @returns {AudioBufferSourceNode|undefined} The source node if played.
   */
  function playSound(name) {
    if (isAudioReady && soundBank[name]) {
      return soundBank[name]();
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

      // Old levelUp sound removed (replaced by MP3 load in playBtn listener)

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
   * @param {boolean} loop - Whether to loop the audio.
   * @returns {Function} A function that plays the sound.
   */
  function createBufferPlayer(buffer, loop = false) {
    return () => {
      if (!isAudioReady) return;
      try {
        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.loop = loop; // Set loop property
        source.connect(audioContext.destination);
        source.start(0);
        return source;
      } catch (e) {
        console.error("Error playing buffer:", e);
      }
    };
  }

  /**
   * Fetches and decodes a static audio file (like an MP3) from the server.
   * @param {string} url - The path to the file (e.g., '/boss.mp3').
   * @param {string} name - The key to store it in the soundBank.
   * @param {boolean} loop - Whether to loop the audio.
   */
  async function loadStaticAudio(url, name, loop = false) {
    if (!isAudioReady) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${url}`);
      const arrayBuffer = await response.arrayBuffer();
      const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
      soundBank[name] = createBufferPlayer(decodedBuffer, loop);
    } catch (e) {
      console.error(`Failed to load audio file "${name}":`, e);
    }
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

  function generateReviewGrid() {
    reviewGrid.innerHTML = ''; // Clear existing
    
    sightWords.forEach(word => {
      const card = document.createElement('div');
      card.className = 'review-word-card';
      card.innerText = word;
      
      // Add click listener to play audio
      const playWordAudio = (e) => {
        e.stopPropagation(); // Prevent triggering other clicks
        e.preventDefault();
        playSound(word);
      };
      
      card.addEventListener('mousedown', playWordAudio);
      card.addEventListener('touchstart', playWordAudio, { passive: false });
      
      reviewGrid.appendChild(card);
    });
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
    // NEW: Adjust enemy speed based on level. 3% faster per level.
    currentEnemyMoveInterval = baseEnemyMoveInterval * Math.pow(0.97, level - 1);
    
    hitsThisLevel = 0;
    levelWords = pickRandomWords(6);
    
    bullets = [];
    enemyBullets = [];
    enemies = [];

    // --- CHECK FOR BOSS LEVEL ---
    if (level % 10 === 0) {
      spawnBoss();
    } else {
      spawnBatch(); 
    }
  }

  function spawnBoss() {
    // Pick a random word from the pool to be the BOSS word
    const randomIndex = Math.floor(Math.random() * sightWords.length);
    currentTargetWord = sightWords[randomIndex];
    
    playSound(currentTargetWord);
    
    // Stop any existing music first to be safe
    if (currentMusicSource) {
        try { currentMusicSource.stop(); } catch(e) {}
    }
    currentMusicSource = playSound('bossMusic'); // Play and track the music

    // --- Trigger Boss Intro Animation ---
    isBossIntro = true;
    bossIntroTimer = BOSS_INTRO_DURATION;

    // Create the Boss Object
    enemies.push({
      x: width / 2,
      y: -200, // NEW: Spawn completely off-screen (above top)
      width: 220, 
      height: 90,
      word: currentTargetWord,
      isBoss: true,
      hp: 15 + (level * 2),
      maxHp: 15 + (level * 2),
      hoverOffset: 0, 
      attackTimer: 2.0 
    });
  }

  function spawnDrone() {
    // Drones are small, fast, and contain WRONG words
    const wrongWords = sightWords.filter(w => w !== currentTargetWord);
    const randomWrong = wrongWords[Math.floor(Math.random() * wrongWords.length)];
    
    enemies.push({
      x: width / 2 + (Math.random() * 100 - 50), // Spawn near boss center
      y: 150, // Just below boss
      width: 60,
      height: 30,
      word: randomWrong,
      isDrone: true, // Special flag for movement logic
      speed: 150 // Fast!
    });
  }

  function spawnBatch() { // No longer async
    if (levelWords.length < 6) {
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
    enemyMoveTimer = currentEnemyMoveInterval;
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
        height: 50, // Increased height for more text room
        word: words[i],
        // 'speed' is no longer needed, movement is handled by the global timer
        shootTimer: 0.8 + Math.random() * 1.5,
        isShooter: false // NEW: Flag to designate if this enemy can shoot
      });
    }

    // --- NEW: Designate shooters based on level ---
    let numShooters = 0;
    if (level >= 3) {
      // 1 shooter at level 3, +1 every 3 levels (level 6, 9, etc.)
      numShooters = 1 + Math.floor((level - 3) / 3);
    }
    numShooters = Math.min(numShooters, enemies.length); // Cap at total enemy count

    // Randomly assign shooters
    let availableEnemies = enemies.map((_, i) => i); // Array of indices [0, 1, ..., 5]
    while (numShooters > 0 && availableEnemies.length > 0) {
      const randIndex = Math.floor(Math.random() * availableEnemies.length);
      const enemyIndex = availableEnemies.splice(randIndex, 1)[0];
      enemies[enemyIndex].isShooter = true;
      numShooters--;
    }
  }

  function shoot() {
    if (gameOver) return;
    // --- NEW: Block shooting during Boss Intro or Game Start ---
    if (isBossIntro || isGameStarting) return; 

    const now = performance.now();
    if (now - lastShotTime < shotCooldown) return;
    lastShotTime = now;

    screenShake = 4; // NEW: Small kickback when shooting

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
    screenShake = 15; // NEW: Big shake when something explodes!

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

    // --- NEW: Show Game Over Screen (HTML Overlay) ---
    gameOverReasonText.innerText = gameOverReason;
    gameOverScoreText.innerText = "SCORE: " + score;
    gameOverScreen.style.display = 'flex';

    // --- NEW: Stop background/boss music on Game Over ---
    if (currentMusicSource) {
      try { currentMusicSource.stop(); } catch(e) {}
      currentMusicSource = null;
    }

    // Hide pause button on game over
    pauseBtn.style.display = 'none';

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
    // --- NEW: Safety stop for any lingering music ---
    if (currentMusicSource) {
      try { currentMusicSource.stop(); } catch(e) {}
      currentMusicSource = null;
    }

    // --- NEW: Hide Game Over Screen ---
    gameOverScreen.style.display = 'none';
    
    // Show pause button again
    pauseBtn.style.display = 'flex';

    level = 1;
    score = 0;
    hitsThisLevel = 0;
    gameOver = false;
    isPaused = false; // Reset pause state
    isBossIntro = false; // --- NEW: Reset intro state
    gameOverReason = "";
    bullets = [];
    enemies = [];
    enemyBullets = [];
    
    // --- NEW: Warp In Setup ---
    player.x = width / 2;
    // Start player OFF SCREEN at the bottom
    player.y = height + 100; 
    
    isGameStarting = true; // Trigger the warp-in state
    playSound('startGame');
    
    // We DO NOT call startLevel() here. 
    // The update() loop will call it when the ship reaches position.
  }

  function update(dt) {
    // --- NEW: Shake Decay ---
    // Only decay shake if we are NOT in the boss intro (intro keeps it shaking)
    if (!isBossIntro && screenShake > 0) {
      screenShake -= dt * 60; // Decay speed
      if (screenShake < 0) screenShake = 0;
    }

    // Always update stars for visual effect, even if game over (optional)
    updateStars(dt);

    if (gameOver) return;

    // --- NEW: Game Start (Warp In) Logic ---
    if (isGameStarting) {
        // Target Y position
        const targetY = height - 30;
        // Move ship up quickly (400px per second)
        player.y -= 400 * dt;

        // If we reached (or passed) the target
        if (player.y <= targetY) {
            player.y = targetY;
            isGameStarting = false; // Animation done
            startLevel(); // NOW we spawn the enemies
        }
        return; // Skip rest of update loop while warping in
    }

    // --- NEW: Boss Intro Logic ---
    if (isBossIntro) {
      bossIntroTimer -= dt;
      
      // 1. Continuous Rumble
      screenShake = 5; 

      // 2. Move Boss Down slowly
      const boss = enemies.find(e => e.isBoss);
      if (boss) {
          // Calculate percentage complete (0.0 to 1.0)
          const progress = 1 - (bossIntroTimer / BOSS_INTRO_DURATION);
          
          // Linear Interpolation (Lerp) from -200 to BOSS_TARGET_Y (120)
          const startY = -200;
          boss.y = startY + (BOSS_TARGET_Y - startY) * progress;
      }

      // 3. End of Intro
      if (bossIntroTimer <= 0) {
          isBossIntro = false;
          screenShake = 0; // Stop the rumble
          if (boss) boss.y = BOSS_TARGET_Y; // Snap to exact position
      }
      
      // Stop other updates (collisions, etc) during intro, but allow drawing
      return;
    }

    // --- NEW: Handle Level Up state ---
    // If we are leveling up, pause all game logic
    if (isLevelingUp) {
      levelUpTimer -= dt;
      if (levelUpTimer <= 0) {
        isLevelingUp = false;
        startLevel(); // Start the next level now
      }
      // We return here to pause all other game logic (explosions, spawns, movement)
      // We still draw, so the animation is visible.
      return; 
    }

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
        // --- LEVEL UP ---
        level++;
        // NEW: Only play sound if NOT a boss level (multiples of 10)
        if (level % 10 !== 0) {
          playSound('levelUp');
        }
        isLevelingUp = true; // Set the new state
        levelUpTimer = levelUpDuration; // Set the timer
        // We DO NOT call startLevel() here anymore.
        // The update() function will call it when the timer finishes.
      } else {
        // Just spawn the next wave
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

    // --- Enemy Logic ---
    
    // Check if there is a boss active
    const boss = enemies.find(e => e.isBoss);

    // 1. Standard Grid Movement (ONLY if no boss)
    let formationMovedDown = false;
    let formationMovedSide = false;

    if (!boss) {
      enemyMoveTimer -= dt; // Count down the timer
      if (enemyMoveTimer <= 0) {
        enemyMoveTimer = currentEnemyMoveInterval; // Reset timer
        formationMovedSide = true; // Flag that we are trying to move sideways

        // Check for wall hits *before* moving
        let hitWall = false;
        for (const e of enemies) {
          // Drones and Bosses don't trigger formation logic
          if (e.isDrone) continue; 
          
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
    }

    // 2. Update Individual Enemies
    for (const e of enemies) {
      
      // --- NEW: Boss Dying Sequence ---
      if (e.isBoss && e.isDying) {
        e.dyingTimer -= dt;
        screenShake = 10; // Violent shake continuously

        // Create random explosions all over the boss's body
        // High frequency: roughly every other frame
        if (Math.random() < 0.5) { 
            const ex = e.x + (Math.random() * e.width - e.width / 2);
            const ey = e.y + (Math.random() * e.height - e.height / 2);
            createExplosion(ex, ey);
        }

        // When the 8-second timer ends, cleanup the boss
        if (e.dyingTimer <= 0) {
             score += 300; // Increased Bonus score
             hitsThisLevel = hitsPerLevel; // Max out hits to satisfy level-up condition
             pendingSpawn = true; // Trigger the level completion logic in the main loop
             enemies = []; // Remove the boss immediately
        }
        
        // Skip movement and shooting logic while dying
        continue; 
      }

      // --- CASE A: BOSS MOVEMENT ---
      if (e.isBoss) {
        // Gentle Hover effect
        e.hoverOffset = (e.hoverOffset || 0) + dt * 2;
        e.x = (width / 2) + Math.sin(e.hoverOffset) * 50; // Hover left/right
        e.y = 120 + Math.cos(e.hoverOffset * 1.5) * 15;   // Hover up/down

// Boss Attack Logic (Spawn Homing Spaceship)
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          // Calculate how many bosses we have faced (Level 10 = 1, Level 20 = 2, etc.)
          const bossLevel = level / 10;

          // Cooldown: Starts at 3.5s, gets 0.2s faster per boss level (capped at 1.0s minimum)
          e.attackTimer = Math.max(1.0, 3.5 - (bossLevel * 0.2));

          // Speed: Starts at 100, gets 30 faster per boss level
          const missileSpeed = 50 + (bossLevel * 30);

          enemyBullets.push({
            x: e.x,
            y: e.y + e.height / 2,
            width: 20, // Larger than normal bullets
            height: 20,
            speed: missileSpeed, // Dynamic speed
            isHoming: true // Special flag for movement
          });
          playSound('enemyShoot');
        }
      }
      // --- CASE B: DRONE MOVEMENT (Dive bomb) ---
      else if (e.isDrone) {
        // Move down fast, and slightly towards player X
        e.y += e.speed * dt;
        if (e.x < player.x) e.x += 20 * dt;
        if (e.x > player.x) e.x -= 20 * dt;
      }
      // --- CASE C: STANDARD GRID MOVEMENT ---
      else {
        if (formationMovedDown) e.y += enemyMoveStepY;
        if (formationMovedSide) e.x += (enemyMoveStepX * enemyDirection);
      }


      // Enemy shooting logic (standard shooters)
      if (e.isShooter && !e.isBoss) {
        e.shootTimer -= dt;
        if (e.shootTimer <= 0) {
          e.shootTimer = 0.8 + Math.random() * 1.5;
          // Calculate Aim Vector
          const dx = player.x - e.x;
          const dy = player.y - e.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const bulletSpeed = 50 + level * 10; 

          enemyBullets.push({
            x: e.x,
            y: e.y + e.height / 2,
            width: 8, 
            height: 8,
            vx: (dx / dist) * bulletSpeed, 
            vy: (dy / dist) * bulletSpeed 
          });
          playSound('enemyShoot');
        }
      }

      // --- COLLISION & GAME OVER CHECKS ---

      // 1. Check if enemy physically hit the player (Drones or Regular)
      if (rectOverlap(player, e)) {
         setGameOver("You were hit!");
      }

      // 2. Game over check (when enemy reaches bottom)
      // Drones are exempt from this specific check; they only kill via collision
      if (!e.isDrone && e.y + e.height / 2 > player.y - player.height / 2) {
        setGameOver("An enemy slipped through!");
      }
    }

// enemy bullets
    for (const b of enemyBullets) {
      if (b.isHoming) {
        // Homing Logic:
        // 1. Always move down so it eventually leaves the screen
        b.y += b.speed * dt; 

        // 2. Steer X towards player (Weak tracking)
        const steerSpeed = 80; // Pixels per second
        if (b.x < player.x) b.x += steerSpeed * dt;
        if (b.x > player.x) b.x -= steerSpeed * dt;
        
      } else {
        // Standard straight-line bullet
        b.x += b.vx * dt;
        b.y += b.vy * dt;
      }
    }
    // Remove bullets that go off the bottom, left, or right of the screen
    enemyBullets = enemyBullets.filter(b => 
      b.y - b.height / 2 < height + 30 && 
      b.x > -50 && 
      b.x < width + 50
    );

    // collisions: player bullets with enemies
    if (!gameOver && !pendingSpawn) {
      outerLoop:
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        for (let j = enemies.length - 1; j >= 0; j--) {
          const e = enemies[j];
          
          if (rectOverlap(b, e)) {
            // Remove bullet immediately
            bullets.splice(i, 1);

            if (e.word === currentTargetWord) {
              // --- CORRECT HIT ---
              enemyBullets = []; // Clear all existing enemy bullets
              createExplosion(b.x, b.y); // Explosion at impact point
              playSound('hitCorrect');
              
              if (e.isBoss) {
                e.hp--;

                // Boss Destroyed Check
                if (e.hp <= 0 && !e.isDying) {
                   // --- START DYING SEQUENCE ---
                   e.isDying = true;
                   e.dyingTimer = 8.0; // 8 seconds (matches sound file)
                   
                   // Play the big explosion sound
                   playSound('bossExplosion');

                   // Stop Boss Music immediately
                   if (currentMusicSource) {
                       try { currentMusicSource.stop(); } catch(e) {}
                       currentMusicSource = null;
                   }
                   
                   // We DO NOT remove the enemy or set pendingSpawn yet.
                   // That happens in the update() loop when dyingTimer expires.
                }
                // We no longer spawn drones here. The Boss is the only word.
              }
              else {
                // Normal Enemy Hit
                score += 10;
                hitsThisLevel++;
                
                // Logic: If it's a drone, just remove it. 
                // If it's a standard grid enemy, remove it and check win condition.
                if (e.isDrone) {
                   enemies.splice(j, 1);
                } else {
                   // For standard enemies, clearing the board usually means win,
                   // but using existing logic:
                   pendingSpawn = true; 
                   enemies = []; 
                }
              }

            } else {
              // --- WRONG HIT ---
              createExplosion(b.x, b.y);
              setGameOver("Wrong word!");
            }
            
            // Bullet used, break inner loop
            break; 
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

  function updateStars(dt) {
    let baseSpeed = 100 + (level * 10); 
    
    // --- NEW: Warp Speed during Boss Intro ---
    if (isBossIntro) {
        baseSpeed = 1200; // Extreme speed
    }

    for (const star of stars) {
      // Movement depends on depth (1/z). Closer stars move faster.
      star.y += (baseSpeed / star.z) * dt;
      
      // If star goes off bottom, wrap to top at random X
      if (star.y > height) {
        star.y = 0;
        star.x = Math.random() * width;
      }
    }
  }

  function drawBackground() {
    // --- NEW: Red Alert Pulse during Boss Intro ---
    if (isBossIntro) {
        // Oscillate red value between 20 and 80 based on timer
        const redIntensity = 20 + Math.abs(Math.sin(bossIntroTimer * 4)) * 60;
        ctx.fillStyle = `rgb(${Math.floor(redIntensity)}, 0, 0)`;
    } else {
        ctx.fillStyle = "#000000";
    }
    
    ctx.fillRect(0, 0, width, height);

    // Draw moving stars with depth
    for (const star of stars) {
      // Calculate brightness based on depth (closer = brighter)
      const brightness = Math.floor(255 / star.z);
      // Calculate size based on depth (closer = bigger)
      const size = Math.max(1, 4 - star.z);
      
      ctx.fillStyle = `rgb(${brightness}, ${brightness}, ${brightness})`;
      ctx.fillRect(star.x, star.y, size, size);
    }
  }

  

  function draw() {
    // operations (like resize) can reset it.
    ctx.imageSmoothingEnabled = false;
    
    // 1. Clear background (Static black)
    drawBackground(); 

    // 2. Apply Screen Shake to the rest of the game
    ctx.save(); // Save current state
    if (screenShake > 0) {
      const dx = (Math.random() - 0.5) * screenShake;
      const dy = (Math.random() - 0.5) * screenShake;
      ctx.translate(dx, dy);
    }

    // --- DRAW PLAYER SHIP (Retro Style) ---
    const px = player.x;
    const py = player.y;
    const pw = player.width;
    const ph = player.height;

    ctx.fillStyle = "#00FF00"; // Main Green

    // 1. Main Body (Bottom wide part)
    ctx.fillRect(px - pw / 2, py - ph / 4, pw, ph / 2);

    // 2. Cockpit/Fuselage (Middle narrower part)
    ctx.fillRect(px - pw / 4, py - ph / 2, pw / 2, ph);

    // 3. Nose/Cannon (Top tip)
    ctx.fillRect(px - 4, py - ph / 2 - 10, 8, 10);

    // 4. Engine Thrusters (Visual detail on bottom)
    ctx.fillStyle = "#004400"; // Darker green for detail
    ctx.fillRect(px - pw / 2 + 5, py + ph / 4, 10, 6);
    ctx.fillRect(px + pw / 2 - 15, py + ph / 4, 10, 6);

    // player bullets
    ctx.fillStyle = "#ffffff";
    for (const b of bullets) {
      ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
    }

    // enemies
    for (const e of enemies) {
      if (e.isBoss) {
         // --- DRAW BOSS ---
         
         // Flashing effect: If dying, randomly swap colors to white
         const isFlashing = e.isDying && Math.random() > 0.5;

         // 1. Dome
         ctx.fillStyle = isFlashing ? "#FFFFFF" : "#00FFFF";
         ctx.fillRect(e.x - e.width/4, e.y - e.height/2 - 15, e.width/2, 30);
         // 2. Main Saucer
         ctx.fillStyle = isFlashing ? "#FFFFFF" : "#9900FF"; // Purple Boss
         ctx.fillRect(e.x - e.width/2, e.y - e.height/2, e.width, e.height);
         // 3. Lights
         ctx.fillStyle = Math.random() > 0.5 ? "#FFFF00" : "#FF0000";
         ctx.fillRect(e.x - e.width/2 + 10, e.y, 10, 10);
         ctx.fillRect(e.x + e.width/2 - 20, e.y, 10, 10);
         
         // 4. HP Bar (Above boss) - Only draw if NOT dying
         if (!e.isDying) {
             const hpPct = e.hp / e.maxHp;
             ctx.fillStyle = "red";
             ctx.fillRect(e.x - e.width/2, e.y - e.height/2 - 25, e.width, 5);
             ctx.fillStyle = "#00FF00";
             ctx.fillRect(e.x - e.width/2, e.y - e.height/2 - 25, e.width * hpPct, 5);
         }
         const hpPct = e.hp / e.maxHp;
         ctx.fillStyle = "red";
         ctx.fillRect(e.x - e.width/2, e.y - e.height/2 - 25, e.width, 5);
         ctx.fillStyle = "#00FF00";
         ctx.fillRect(e.x - e.width/2, e.y - e.height/2 - 25, e.width * hpPct, 5);

         // Text
         ctx.fillStyle = "#ffffff";
         ctx.font = "24px 'Press Start 2P'"; // Giant text
         ctx.textAlign = "center";
         ctx.textBaseline = "middle";
         ctx.fillText(e.word, e.x, e.y);
      } 
      else if (e.isDrone) {
          // --- DRAW DRONE ---
          // Spaceship look, no word rendered
          const dx = e.x;
          const dy = e.y;
          const dw = e.width;
          const dh = e.height;

          ctx.fillStyle = "#FF9900"; // Orange body

          // Main Body (Wide part)
          ctx.fillRect(dx - dw / 2, dy - dh / 4, dw, dh / 2);
          // Cockpit/Dome (Top part)
          ctx.fillRect(dx - dw / 4, dy - dh / 2, dw / 2, dh / 4);
          // Engines/Wings details (Bottom details)
          ctx.fillStyle = "#CC6600"; // Darker orange
          ctx.fillRect(dx - dw / 2, dy + dh / 4, 10, 6);
          ctx.fillRect(dx + dw / 2 - 10, dy + dh / 4, 10, 6);
      }
      else {
         // --- STANDARD ENEMY ---
         ctx.fillStyle = "#FF0000"; // Classic arcade red
         ctx.fillRect(e.x - e.width / 2, e.y - e.height / 2, e.width, e.height);
         ctx.fillStyle = "#ffffff";
         ctx.font = "14px 'Press Start 2P'";
         ctx.textAlign = "center";
         ctx.textBaseline = "middle";
         ctx.fillText(e.word, e.x, e.y + 1);
      }
    }

    // enemy bullets
    for (const b of enemyBullets) {
      if (b.isHoming) {
        // Draw Homing Spaceship (Diamond shape)
        ctx.fillStyle = "#FF4400"; // Red-Orange
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - b.height/2); // Top
        ctx.lineTo(b.x + b.width/2, b.y); // Right
        ctx.lineTo(b.x, b.y + b.height/2); // Bottom
        ctx.lineTo(b.x - b.width/2, b.y); // Left
        ctx.closePath();
        ctx.fill();
      } else {
        // Standard Bullet
        ctx.fillStyle = "#ffdd33";
        ctx.fillRect(b.x - b.width / 2, b.y - b.height / 2, b.width, b.height);
      }
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
    const hudText = "Level: " + level + "   Score: " + score;
    ctx.fillText(hudText, 10, 8);

    // --- NEW: Level Up Animation ---
    if (isLevelingUp) {
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Timer goes from 3.0 down to 0.0
      // We calculate 'timeElapsed' from 0.0 to 3.0
      const timeElapsed = levelUpDuration - levelUpTimer;
      let scale = 1.0;
      let alpha = 1.0;
      const fadeInTime = 0.4;
      const fadeOutTime = 0.6;

      // First 0.4 seconds: Zoom in and fade in
      if (timeElapsed < fadeInTime) {
        scale = (timeElapsed / fadeInTime) * 1.5; // Zooms from 0 to 1.5x
        alpha = timeElapsed / fadeInTime; // Fades from 0 to 1
      } 
      // Last 0.6 seconds: Fade out
      else if (timeElapsed > (levelUpDuration - fadeOutTime)) {
        alpha = (levelUpDuration - timeElapsed) / fadeOutTime; // Fades from 1 to 0
        scale = 1.5; // Hold scale
      }
      // Middle section: Hold
      else {
        scale = 1.5;
        alpha = 1.0;
      }

      // Clamp values to be safe
      scale = Math.max(0.1, Math.min(1.5, scale));
      alpha = Math.max(0, Math.min(1, alpha));

      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.font = `${20 * scale}px 'Press Start 2P'`; // Base size 20px
      ctx.fillText(`Level ${level}`, width / 2, height / 2 - 60);
    }
    // --- END Level Up Animation ---

    // --- NEW: Game Start Animation Text ---
    if (isGameStarting) {
        ctx.fillStyle = "#00FF00"; // Green text matching ship
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = "40px 'Press Start 2P'";
        ctx.fillText("READY", width / 2, height / 2 - 50);
    }

    // Note: gameOver text is now handled by HTML overlay in setGameOver()

    ctx.restore(); // NEW: Restore context to undo the shake translation
  }

  // --- New Control Handlers ---

  function setupControls() {
    // --- Cheat Code Variables ---
    let inputHistory = [];
    const cheatSequence = ['left', 'left', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'left'];

    // --- Movement Listeners ---
    const startMove = (e, direction) => {
      e.preventDefault();

      // --- CHEAT CODE LOGIC ---
      inputHistory.push(direction);
      // Keep the history buffer only as long as the cheat code
      if (inputHistory.length > cheatSequence.length) {
        inputHistory.shift(); 
      }
      
      // Check if the last 4 inputs match "Left, Right, Left, Right"
      // We use JSON.stringify for a quick array comparison
      if (JSON.stringify(inputHistory) === JSON.stringify(cheatSequence)) {
         // --- ACTIVATE CHEAT ---
         level = 10; // Jump to Boss Level
         score += 1000; // Cheat bonus
         
         // Reset game state elements so we don't crash
         hitsThisLevel = 0;
         gameOver = false; 
         enemies = [];
		 bullets = [];
          enemyBullets = [];
          pendingSpawn = false;
          startLevel(); // Start the level immediately
          
          inputHistory = []; // Reset history so it doesn't trigger twice
         return; // Don't move the ship on the final trigger tap
      }
      // ------------------------

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

    // --- Replay Button (Plays current word) ---
    const onReplayPress = (e) => {
      e.preventDefault(); // Prevent ghost clicks/selection
      if (currentTargetWord) {
        playSound(currentTargetWord);
      }
    };

    replayBtn.addEventListener('touchstart', onReplayPress, { passive: false });
    replayBtn.addEventListener('mousedown', onReplayPress, { passive: false });

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

    // --- Tap to Shoot Listener (Global) ---
    let lastTouchTime = 0; // Track the time of the last touch

    const onScreenTap = (e) => {
      // 1. Ignore taps if the target is one of our buttons (Left, Right, Replay, Restart, Review Card)
      // We also check .review-word-card explicitly just in case bubbling causes issues, 
      // though stopPropagation in generateReviewGrid usually handles it.
      if (e.target.closest('button') || e.target.closest('.review-word-card')) return;

      // 2. Ignore taps if on the Start Screen
      if (startScreen.style.display !== 'none') return;

      // 3. NEW: Ignore taps if on the Review/Pause Screen
      // This prevents shooting when clicking the background of the review grid
      if (reviewScreen.style.display !== 'none') return;

      // 4. Ghost Click Prevention:
      // If this is a mouse event that happened immediately after a touch, ignore it.
      if (e.type === 'mousedown' && performance.now() - lastTouchTime < 500) {
        return;
      }

      // 5. Record timestamp if it's a touch event
      if (e.type === 'touchstart') {
        lastTouchTime = performance.now();
      }

      // 6. Resume AudioContext immediately on interaction
      if (audioContext && audioContext.state === 'suspended') {
        audioContext.resume();
      }

      // 7. Trigger Shoot
      if (!gameOver) {
        shoot();
      }
    };

    // Attach to window to catch clicks anywhere
    window.addEventListener('touchstart', onScreenTap, { passive: false });
    window.addEventListener('mousedown', onScreenTap, { passive: false });

    // --- NEW: Restart Button Listener ---
    const onRestartPress = (e) => {
      // e.preventDefault() prevents ghost clicks
      if (e.cancelable) e.preventDefault();
      if (gameOver) {
        restartGame();
      }
    };
    restartBtn.addEventListener('click', onRestartPress);
    restartBtn.addEventListener('touchstart', onRestartPress, { passive: false });

    // --- PAUSE / REVIEW LOGIC ---
    const togglePause = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      if (gameOver) return;

      isPaused = !isPaused;

      if (isPaused) {
        // Show Review Screen in Pause Mode
        isInitialReview = false;
        reviewTitle.innerText = "PAUSED";
        reviewActionBtn.innerText = "RESUME";
        
        generateReviewGrid(); // Ensure grid is populated
        reviewScreen.style.display = 'flex';
        pauseBtn.style.display = 'none'; 

        // We removed audioContext.suspend() here so TTS works
      } else {
        // Hide Review Screen
        reviewScreen.style.display = 'none';
        pauseBtn.style.display = 'flex';
        
        // Ensure audio is running when we resume
        if (audioContext && audioContext.state === 'suspended') {
            audioContext.resume();
        }
        lastTime = performance.now();
      }
    };

    const onReviewAction = (e) => {
      if (e && e.preventDefault) e.preventDefault();
      
      // If this is the initial pre-game review
      if (isInitialReview) {
        reviewScreen.style.display = 'none';
        pauseBtn.style.display = 'flex';
        controls.style.display = 'flex';
        canvas.style.display = 'block';
        
        // Start the actual gameplay logic
        restartGame();
        
        // Start the loop if not already running
        lastTime = performance.now();
        requestAnimationFrame(loop);
      } 
      // If this is a pause menu resume
      else {
        togglePause();
      }
    };

    pauseBtn.addEventListener('click', togglePause);
    pauseBtn.addEventListener('touchstart', togglePause, { passive: false });
    
    // Listener for the big Start/Resume button
    reviewActionBtn.addEventListener('click', onReviewAction);
    reviewActionBtn.addEventListener('touchstart', onReviewAction, { passive: false });

    // --- NEW: Keyboard Listeners ---
    window.addEventListener('keydown', (e) => {
      // Check for arrow keys to move
      if (e.key === 'ArrowLeft') {
        moveLeft = true;
        e.preventDefault(); // Prevent window scrolling
      } else if (e.key === 'ArrowRight') {
        moveRight = true;
        e.preventDefault(); // Prevent window scrolling
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        // Only shoot, do not restart via Spacebar to keep controls consistent
        if (!gameOver) {
          shoot();
        }
        e.preventDefault(); // Prevent spacebar from scrolling page
      }
    });

    window.addEventListener('keyup', (e) => {
      // Check for arrow keys to stop moving
      if (e.key === 'ArrowLeft') {
        moveLeft = false;
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        moveRight = false;
        e.preventDefault();
      } else if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        // No action needed on keyup for 'shoot', as the cooldown
        // in the shoot() function already handles rapid-fire.
      }
    });
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
    loadingScreen.style.display = 'flex'; 

    // 1. Initialize the Audio Context (MUST be first)
    initAudio();
    
    // 2. Load ALL audio for the entire game
    await Promise.all([
      loadWordAudio(sightWords),
      loadStaticAudio('/level-up.mp3', 'levelUp', false), 
      loadStaticAudio('/boss-explosion.mp3', 'bossExplosion', false), 
      loadStaticAudio('/boss.mp3', 'bossMusic', true)
    ]);

    // --- Stop Intro Music ---
    introAudio.pause();
    introAudio.currentTime = 0;

    // 3. Hide loading screen
    loadingScreen.style.display = 'none';

    // 4. SHOW REVIEW SCREEN (Instead of starting game immediately)
    isInitialReview = true;
    reviewTitle.innerText = "REVIEW WORDS";
    reviewActionBtn.innerText = "START GAME";
    generateReviewGrid();
    reviewScreen.style.display = 'flex';

    // 5. Make sure our CSS var matches viewport
    resize();

    // 6. Enter Fullscreen
    enterFullScreen();

    // 7. Delayed resize
    setTimeout(resize, 350);
    
    // NOTE: We do NOT call restartGame() or requestAnimationFrame(loop) here anymore.
    // That happens when the user clicks the "START GAME" button on the review screen.
  });


  // Main loop
  let lastTime = 0;
  function loop(timestamp) {
    // If paused, we skip update/draw but keep requesting frames
    // so we can resume smoothly later.
    if (isPaused) {
      // We still update lastTime so that when we unpause, 
      // 'dt' doesn't become huge (the time elapsed during pause).
      lastTime = timestamp; 
      requestAnimationFrame(loop);
      return;
    }

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