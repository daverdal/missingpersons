(function() {
  if (window.startEasterEggGame) {
    // Already loaded
    return;
  }

  let overlay = null;
  let canvas = null;
  let ctx = null;
  let animationId = null;
  let keysDown = {};
  let gameRunning = false;
  let gameWon = false;
  let hasKey = false;
  let danceFrame = 0;
  let lastDanceSwitch = 0;
  let musicCtx = null;
  let musicStopTimeout = null;
  let videoButton = null;
  const RICKROLL_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

  const width = 800;
  const height = 600;

  // Simple multi-room world: 3 rooms in a row (0,1,2)
  const ROOM_COUNT = 3;
  const START_ROOM = 0;
  const CASTLE_ROOM = ROOM_COUNT - 1;
  let currentRoom = START_ROOM;

  const player = {
    x: 60,
    y: height - 120,
    w: 24,
    h: 24,
    speed: 3
  };

  const castle = {
    x: width - 120,
    y: height - 180,
    w: 80,
    h: 120
  };

  const keyItem = {
    room: START_ROOM,
    x: 140,
    y: 100,
    w: 16,
    h: 16,
    taken: false
  };

  function rectsOverlap(a, b) {
    return !(
      a.x + a.w < b.x ||
      a.x > b.x + b.w ||
      a.y + a.h < b.y ||
      a.y > b.y + b.h
    );
  }

  function positionKeyRandomly() {
    // Choose a room for the key, prefer not to be in the castle room
    let room = Math.floor(Math.random() * ROOM_COUNT);
    if (room === CASTLE_ROOM && ROOM_COUNT > 1) {
      room = (room + 1) % ROOM_COUNT;
    }
    keyItem.room = room;

    // Place key somewhere within the playfield of that room, avoiding castle / start areas
    const margin = 40;
    const maxAttempts = 20;
    let attempts = 0;
    while (attempts < maxAttempts) {
      attempts += 1;
      const x = margin + Math.random() * (width - margin * 2 - keyItem.w);
      const y = margin + Math.random() * (height - margin * 2 - keyItem.h);
      const candidate = { x, y, w: keyItem.w, h: keyItem.h };
      const castleRect = { x: castle.x - 20, y: castle.y - 20, w: castle.w + 40, h: castle.h + 40 };
      const playerStartRect = { x: 40, y: height - 160, w: 120, h: 120 };
      const avoidCastle = room === CASTLE_ROOM && rectsOverlap(candidate, castleRect);
      const avoidStart = room === START_ROOM && rectsOverlap(candidate, playerStartRect);
      if (!avoidCastle && !avoidStart) {
        keyItem.x = x;
        keyItem.y = y;
        return;
      }
    }
    // Fallback to a fixed position if we somehow fail to find a spot
    keyItem.room = START_ROOM;
    keyItem.x = 140;
    keyItem.y = 100;
  }

  function createOverlay() {
    overlay = document.createElement('div');
    overlay.id = 'easter-egg-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.background = 'rgba(0,0,0,0.9)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '9999';
    overlay.style.flexDirection = 'column';
    overlay.style.color = '#6fcf6f';
    overlay.style.fontFamily = "Fira Mono, Consolas, 'Roboto Mono', monospace";

    const info = document.createElement('div');
    info.style.marginBottom = '0.8rem';
    info.style.textAlign = 'center';
    info.innerHTML = 'Use arrow keys to move. Find the key, then unlock the castle.<br>Press ESC to exit.';
    overlay.appendChild(info);

    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.style.border = '2px solid #6fcf6f';
    canvas.style.boxShadow = '0 0 12px #6fcf6f66';
    overlay.appendChild(canvas);

    document.body.appendChild(overlay);
    ctx = canvas.getContext('2d');

    // Pause any playing audio/video while overlay is active
    pauseMedia();
  }

  function pauseMedia() {
    const media = document.querySelectorAll('audio, video');
    media.forEach(m => {
      try {
        if (!m.paused) {
          m.dataset.easterEggWasPlaying = 'true';
          m.pause();
        }
      } catch (_) {
        // ignore
      }
    });
  }

  function resumeMedia() {
    const media = document.querySelectorAll('audio, video');
    media.forEach(m => {
      try {
        if (m.dataset.easterEggWasPlaying === 'true') {
          delete m.dataset.easterEggWasPlaying;
          m.play();
        }
      } catch (_) {
        // ignore
      }
    });
  }

  function drawBackground() {
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#222';
    ctx.fillRect(0, height - 80, width, 80);
  }

  function drawKey() {
    if (keyItem.taken) return;
    if (keyItem.room !== currentRoom) return;
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(keyItem.x, keyItem.y, keyItem.w, keyItem.h);
  }

  function drawCastle() {
    if (currentRoom !== CASTLE_ROOM) return;
    ctx.fillStyle = '#aa3333';
    ctx.fillRect(castle.x, castle.y, castle.w, castle.h);
    ctx.fillStyle = '#660000';
    ctx.fillRect(castle.x + castle.w / 3, castle.y + castle.h / 2, castle.w / 3, castle.h / 2);
  }

  function drawPlayer() {
    ctx.fillStyle = hasKey ? '#3cb371' : '#1e90ff';
    ctx.fillRect(player.x, player.y, player.w, player.h);
  }

  function drawUI() {
    ctx.fillStyle = '#6fcf6f';
    ctx.font = '16px Fira Mono, monospace';
    const roomLabel = 'Room ' + (currentRoom + 1) + ' / ' + ROOM_COUNT;
    const msg = hasKey ? 'Key collected! Find the castle.' : 'Find the key.';
    ctx.fillText(msg + ' [' + roomLabel + ']', 20, 30);
  }

  function drawWinScreen() {
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#f7c873';
    ctx.font = '22px Fira Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🏰 You found the secret!', width / 2, height / 2 - 20);
    ctx.fillStyle = '#6fcf6f';
    ctx.font = '18px Fira Mono, monospace';
    ctx.fillText('Developed by the MMFNP Team (2025)', width / 2, height / 2 + 10);
    ctx.fillText('Press ESC to return to the app.', width / 2, height / 2 + 40);
    ctx.fillText('Press V for celebration video.', width / 2, height / 2 + 70);
    ctx.textAlign = 'start';

    // Animate stick figure dance
    const now = performance.now();
    if (now - lastDanceSwitch > 200) {
      danceFrame = (danceFrame + 1) % 4;
      lastDanceSwitch = now;
    }
    drawDancer();
    ensureRickrollButton();
  }

  function playPickupSound() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
      oscillator.connect(gain);
      gain.connect(audioCtx.destination);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.25);
      oscillator.onended = function() {
        try {
          audioCtx.close();
        } catch (_) {
          // ignore
        }
      };
    } catch (e) {
      // Audio might be blocked; ignore
    }
  }

  function drawDancer() {
    const x = width / 2;
    const y = height / 2 + 90;
    ctx.strokeStyle = '#6fcf6f';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Head
    ctx.beginPath();
    ctx.arc(x, y - 40, 12, 0, Math.PI * 2);
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.moveTo(x, y - 28);
    ctx.lineTo(x, y);
    ctx.stroke();

    // Arms & legs by frame
    ctx.beginPath();
    switch (danceFrame) {
      case 0:
        // Neutral pose
        ctx.moveTo(x - 16, y - 24);
        ctx.lineTo(x + 16, y - 24);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 12, y + 24);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 12, y + 24);
        break;
      case 1:
        // Hands up
        ctx.moveTo(x - 4, y - 36);
        ctx.lineTo(x - 20, y - 52);
        ctx.moveTo(x + 4, y - 36);
        ctx.lineTo(x + 20, y - 52);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 10, y + 26);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 14, y + 20);
        break;
      case 2:
        // Lean left
        ctx.moveTo(x, y - 28);
        ctx.lineTo(x - 18, y - 10);
        ctx.moveTo(x, y - 28);
        ctx.lineTo(x + 10, y - 6);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 16, y + 22);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6, y + 24);
        break;
      case 3:
        // Lean right
        ctx.moveTo(x, y - 28);
        ctx.lineTo(x + 18, y - 10);
        ctx.moveTo(x, y - 28);
        ctx.lineTo(x - 10, y - 6);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 16, y + 22);
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y + 24);
        break;
    }
    ctx.stroke();
  }

  function startWinMusic() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (musicCtx) return;
      musicCtx = new AudioCtx();

      const masterGain = musicCtx.createGain();
      masterGain.gain.value = 0.2;
      masterGain.connect(musicCtx.destination);

      // 8-bit style riff inspired by 80s dance pop (not a direct copy)
      // Each entry: { d: durationSeconds, leadHz, bassHz }
      const pattern = [
        // Part A
        { d: 0.25, lead: 523.25, bass: 196.0 }, // C5 / G3
        { d: 0.25, lead: 659.25, bass: 196.0 }, // E5 / G3
        { d: 0.25, lead: 587.33, bass: 174.61 }, // D5 / F3
        { d: 0.25, lead: 659.25, bass: 196.0 }, // E5 / G3

        { d: 0.25, lead: 698.46, bass: 220.0 }, // F5 / A3
        { d: 0.25, lead: 784.0,  bass: 220.0 }, // G5 / A3
        { d: 0.25, lead: 659.25, bass: 196.0 }, // E5 / G3
        { d: 0.35, lead: 587.33, bass: 174.61 }, // D5 / F3

        // Part B
        { d: 0.25, lead: 440.0,  bass: 196.0 }, // A4 / G3
        { d: 0.25, lead: 523.25, bass: 196.0 }, // C5 / G3
        { d: 0.25, lead: 587.33, bass: 174.61 }, // D5 / F3
        { d: 0.35, lead: 659.25, bass: 196.0 }, // E5 / G3

        { d: 0.25, lead: 587.33, bass: 174.61 }, // D5 / F3
        { d: 0.25, lead: 523.25, bass: 164.81 }, // C5 / E3
        { d: 0.50, lead: 392.0,  bass: 196.0 }, // G4 / G3

        // Tag
        { d: 0.25, lead: 523.25, bass: 196.0 },
        { d: 0.25, lead: 659.25, bass: 196.0 },
        { d: 0.5,  lead: 392.0,  bass: 196.0 }
      ];

      let t = musicCtx.currentTime;
      pattern.forEach(note => {
        if (note.lead > 0) {
          const osc1 = musicCtx.createOscillator();
          const gain1 = musicCtx.createGain();
          osc1.type = 'square';
          osc1.frequency.setValueAtTime(note.lead, t);
          gain1.gain.setValueAtTime(0.22, t);
          gain1.gain.linearRampToValueAtTime(0.001, t + note.d);
          osc1.connect(gain1);
          gain1.connect(masterGain);
          osc1.start(t);
          osc1.stop(t + note.d + 0.02);
        }
        if (note.bass > 0) {
          const osc2 = musicCtx.createOscillator();
          const gain2 = musicCtx.createGain();
          osc2.type = 'square';
          osc2.frequency.setValueAtTime(note.bass, t);
          gain2.gain.setValueAtTime(0.14, t);
          gain2.gain.linearRampToValueAtTime(0.001, t + note.d);
          osc2.connect(gain2);
          gain2.connect(masterGain);
          osc2.start(t);
          osc2.stop(t + note.d + 0.02);
        }
        t += note.d;
      });

      const totalDur = pattern.reduce((sum, n) => sum + n.d, 0);
      musicStopTimeout = setTimeout(() => {
        if (musicCtx) {
          try {
            musicCtx.close();
          } catch (_) {
            // ignore
          }
          musicCtx = null;
        }
        musicStopTimeout = null;
      }, (totalDur + 0.5) * 1000);
    } catch (e) {
      // ignore audio errors
    }
  }

  function ensureRickrollButton() {
    if (!overlay || videoButton) return;
    const wrapper = document.createElement('div');
    wrapper.style.marginTop = '1.2rem';
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';

    const label = document.createElement('div');
    label.textContent = 'Celebration video (opens in a new tab):';
    label.style.marginBottom = '0.5rem';
    label.style.fontSize = '0.9rem';
    wrapper.appendChild(label);

    const btn = document.createElement('button');
    btn.textContent = 'Play Celebration Video';
    btn.style.padding = '0.5rem 1.4rem';
    btn.style.borderRadius = '6px';
    btn.style.border = '1px solid #6fcf6f';
    btn.style.background = '#111';
    btn.style.color = '#6fcf6f';
    btn.style.cursor = 'pointer';
    btn.style.fontFamily = "Fira Mono, Consolas, 'Roboto Mono', monospace";
    btn.style.fontSize = '0.95rem';
    btn.addEventListener('click', function() {
      try {
        window.open(RICKROLL_URL, '_blank', 'noopener');
      } catch (_) {
        // ignore
      }
    });
    wrapper.appendChild(btn);

    overlay.appendChild(wrapper);
    videoButton = wrapper;
  }

  function update() {
    if (!gameRunning) return;
    let dx = 0;
    let dy = 0;
    if (keysDown['ArrowUp']) dy -= player.speed;
    if (keysDown['ArrowDown']) dy += player.speed;
    if (keysDown['ArrowLeft']) dx -= player.speed;
    if (keysDown['ArrowRight']) dx += player.speed;

    player.x += dx;
    player.y += dy;

    // Room transitions left/right
    if (player.x < 0) {
      if (currentRoom > 0) {
        currentRoom -= 1;
        player.x = width - player.w;
      } else {
        player.x = 0;
      }
    }
    if (player.x + player.w > width) {
      if (currentRoom < ROOM_COUNT - 1) {
        currentRoom += 1;
        player.x = 0;
      } else {
        player.x = width - player.w;
      }
    }
    if (player.y < 0) player.y = 0;
    if (player.y + player.h > height) player.y = height - player.h;

    if (
      !keyItem.taken &&
      keyItem.room === currentRoom &&
      rectsOverlap(
        { x: player.x, y: player.y, w: player.w, h: player.h },
        { x: keyItem.x, y: keyItem.y, w: keyItem.w, h: keyItem.h }
      )
    ) {
      keyItem.taken = true;
      hasKey = true;
      playPickupSound();
    }

    if (
      hasKey &&
      currentRoom === CASTLE_ROOM &&
      rectsOverlap(
        { x: player.x, y: player.y, w: player.w, h: player.h },
        { x: castle.x, y: castle.y, w: castle.w, h: castle.h }
      )
    ) {
      gameWon = true;
      gameRunning = false;
      startWinMusic();
      try {
        localStorage.setItem('easterEggFound', 'true');
      } catch (_) {
        // ignore
      }
    }
  }

  function render() {
    if (!ctx) return;
    drawBackground();
    drawCastle();
    drawKey();
    drawPlayer();
    drawUI();
    if (gameWon) {
      drawWinScreen();
    }
  }

  function loop() {
    if (!gameRunning && !gameWon) return;
    update();
    render();
    animationId = requestAnimationFrame(loop);
  }

  function onKeyDown(e) {
    keysDown[e.key] = true;
    if (gameWon && (e.key === 'v' || e.key === 'V')) {
      try {
        window.open(RICKROLL_URL, '_blank', 'noopener');
      } catch (_) {
        // ignore
      }
    }
  }

  function onKeyUp(e) {
    keysDown[e.key] = false;
  }

  function attachGameListeners() {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
  }

  function detachGameListeners() {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
  }

  function closeGame() {
    gameRunning = false;
    if (animationId != null) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (musicStopTimeout) {
      clearTimeout(musicStopTimeout);
      musicStopTimeout = null;
    }
    if (musicCtx) {
      try {
        musicCtx.close();
      } catch (_) {
        // ignore
      }
      musicCtx = null;
    }
    detachGameListeners();
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    overlay = null;
    videoButton = null;
    overlay = null;
    canvas = null;
    ctx = null;
    resumeMedia();
  }

  window.startEasterEggGame = function startEasterEggGame() {
    if (overlay) {
      // Already open
      return;
    }
    currentRoom = START_ROOM;
    gameRunning = true;
    gameWon = false;
    hasKey = false;
    keyItem.taken = false;
    player.x = 60;
    player.y = height - 120;
    positionKeyRandomly();

    createOverlay();
    attachGameListeners();
    render();
    animationId = requestAnimationFrame(loop);
  };

  window.closeEasterEggGame = function closeEasterEggGame() {
    closeGame();
  };
})();


