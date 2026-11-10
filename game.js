/* =========================================================
   DOT DUEL — a 2-player competitive maze chase
   Player 1 (Lime):  W A S D
   Player 2 (Berry): Arrow keys
   ========================================================= */
(() => {
  'use strict';

  // ---------- MAZE ----------
  // #  wall          .  dot           o  power orb
  // -  ghost door    1/2 player start G  ghost house
  // (space) empty floor — row 9 wraps around as a tunnel
  const MAP = [
    '#####################',
    '#.........#.........#',
    '#o##.####.#.####.##o#',
    '#...................#',
    '#.##.#.#######.#.##.#',
    '#......#.....#......#',
    '#####.###.#.###.#####',
    '#####.#.......#.#####',
    '#####.#.##-##.#.#####',
    '     . .#GGG#. .     ',
    '#####.#.#####.#.#####',
    '#####.#.......#.#####',
    '#####.#.#####.#.#####',
    '#.........#.........#',
    '#.##.###.###.###.##.#',
    '#o.#1...........2#.o#',
    '##.#.#.#######.#.#.##',
    '#....#....#....#....#',
    '#.#######.#.#######.#',
    '#...................#',
    '#####################',
  ];

  const T = 28;
  const ROWS = MAP.length;
  const COLS = MAP[0].length;
  const TAU = Math.PI * 2;

  // ---------- TUNING ----------
  const START_LIVES = 3;
  const PLAYER_SPEED = 6.4;   // tiles per second
  const POWER_SPEED = 7.4;
  const POWER_TIME = 7;       // seconds
  const STEAL_POINTS = 100;
  const STUN_TIME = 2;

  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = COLS * T;
  canvas.height = ROWS * T;
  const W = canvas.width;
  const H = canvas.height;

  const overlay = document.getElementById('overlay');
  const dotsEl = document.getElementById('dotsLeft');
  const restartBtn = document.getElementById('restartBtn');
  const muteBtn = document.getElementById('muteBtn');
  const HUD = [1, 2].map(n => ({
    card: document.getElementById(`p${n}card`),
    score: document.getElementById(`p${n}score`),
    lives: document.getElementById(`p${n}lives`),
    status: document.getElementById(`p${n}status`),
  }));

  // ---------- DIRECTIONS ----------
  const UP = { x: 0, y: -1 };
  const DOWN = { x: 0, y: 1 };
  const LEFT = { x: -1, y: 0 };
  const RIGHT = { x: 1, y: 0 };
  const NONE = { x: 0, y: 0 };
  const DIRS = [UP, LEFT, DOWN, RIGHT];
  const opposite = d => (d === UP ? DOWN : d === DOWN ? UP : d === LEFT ? RIGHT : d === RIGHT ? LEFT : NONE);
  const wrapX = x => (x + COLS) % COLS;

  // ---------- SPECIAL TILES ----------
  const EXIT = { x: 10, y: 7 };       // just above the ghost door
  const HOME = { x: 10, y: 9 };       // centre of the ghost house
  const BONUS_SPOT = { x: 10, y: 11 };

  const starts = { ghosts: [] };
  MAP.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '1') starts.p1 = { x, y };
    else if (c === '2') starts.p2 = { x, y };
    else if (c === 'G') starts.ghosts.push({ x, y });
  }));

  const PLAYER_DEFS = [
    { id: 1, name: 'LIME', color: '#7dff3a', light: '#efffcc', dark: '#2a9400', start: starts.p1, face: RIGHT },
    { id: 2, name: 'BERRY', color: '#ff4fd8', light: '#ffe0f7', dark: '#9c0086', start: starts.p2, face: LEFT },
  ];

  // Sulk hunts Player 1, Fizz hunts Player 2, the others go for whoever is closest.
  const GHOST_DEFS = [
    { name: 'Grumble', color: '#ff3b5c', hunts: 'nearest', rand: 0.08, release: 0, start: EXIT },
    { name: 'Sulk', color: '#ff9f1c', hunts: 'p1', rand: 0.15, release: 2.5, start: starts.ghosts[0] },
    { name: 'Fizz', color: '#22e3d0', hunts: 'p2', rand: 0.15, release: 2.5, start: starts.ghosts[2] },
    { name: 'Mope', color: '#b15cff', hunts: 'nearest', rand: 0.5, release: 7, start: starts.ghosts[1] },
  ];

  // ---------- GAME STATE ----------
  let grid, totalDots, dotsLeft, dotsEaten, bonusTriggers;
  let players = [];
  let ghosts = [];
  let particles = [];
  let popups = [];
  let bonus = { active: false, t: 0 };
  let state = 'title';   // title | countdown | play | paused | over
  let countdown = 0;
  let lastCount = 0;
  let goFlash = 0;
  let elapsed = 0;
  let time = 0;
  let shake = 0;

  // pretty rainbow confetti colours for the dots
  const dotColor = MAP.map((row, y) => [...row].map((_, x) => `hsl(${(x * 23 + y * 13) % 360}, 100%, 78%)`));

  // ---------- SOUND (tiny Web Audio bleeps) ----------
  let actx = null;
  let muted = false;
  function audio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
    }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f1, f2, dur, type = 'square', vol = 0.04, delay = 0) {
    if (muted) return;
    const a = audio();
    if (!a) return;
    const t0 = a.currentTime + delay;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f1, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(a.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
  const sfx = {
    dot: id => (id === 1 ? tone(620, 820, 0.05, 'square', 0.02) : tone(420, 560, 0.05, 'square', 0.02)),
    power: () => tone(180, 1000, 0.4, 'sawtooth', 0.035),
    ghost: () => tone(300, 1600, 0.28, 'triangle', 0.07),
    die: () => tone(720, 60, 0.7, 'sawtooth', 0.05),
    steal: () => { tone(1400, 200, 0.25, 'square', 0.04); tone(200, 900, 0.2, 'triangle', 0.05, 0.12); },
    bonus: () => [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0, 0.09, 'triangle', 0.06, i * 0.07)),
    beep: hi => tone(hi ? 880 : 440, 0, 0.15, 'square', 0.04),
    win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0, 0.16, 'triangle', 0.07, i * 0.13)),
  };

  // ---------- GRID HELPERS ----------
  function resetGrid() {
    grid = MAP.map(row => [...row].map(c => ('12G'.includes(c) ? ' ' : c)));
    totalDots = 0;
    grid.forEach(row => row.forEach(c => { if (c === '.' || c === 'o') totalDots++; }));
    dotsLeft = totalDots;
    dotsEaten = 0;
    bonusTriggers = [Math.floor(totalDots * 0.3), Math.floor(totalDots * 0.65)];
  }

  function cell(x, y) {
    if (y < 0 || y >= ROWS) return '#';
    return grid[y][wrapX(x)];
  }

  const playerCanEnter = (x, y) => {
    const c = cell(x, y);
    return c !== '#' && c !== '-';
  };

  function ghostCanEnter(g, x, y) {
    const c = cell(x, y);
    if (c === '#') return false;
    if (c === '-') return g.mode === 'eaten' || g.mode === 'leaving';
    return true;
  }

  // Breadth-first distance map from a target tile (used for ghost pathfinding)
  function distMap(tx, ty, allowDoor) {
    const d = Array.from({ length: ROWS }, () => new Array(COLS).fill(Infinity));
    const q = [[tx, ty]];
    d[ty][tx] = 0;
    for (let h = 0; h < q.length; h++) {
      const [x, y] = q[h];
      for (const dir of DIRS) {
        const nx = wrapX(x + dir.x);
        const ny = y + dir.y;
        if (ny < 0 || ny >= ROWS) continue;
        const c = grid[ny][nx];
        if (c === '#' || (c === '-' && !allowDoor)) continue;
        if (d[ny][nx] !== Infinity) continue;
        d[ny][nx] = d[y][x] + 1;
        q.push([nx, ny]);
      }
    }
    return d;
  }

  // ---------- MOVEMENT ----------
  // A mover sits on tile (tx, ty) and is `prog` (0..1) of the way to the next tile in `dir`.
  const makeMover = (x, y) => ({ tx: x, ty: y, dir: NONE, prog: 0, speed: 0 });
  const posOf = m => ({ x: m.tx + m.dir.x * m.prog, y: m.ty + m.dir.y * m.prog });

  function reverseMover(m) {
    if (m.dir === NONE) return;
    if (m.prog > 0) {
      m.tx = wrapX(m.tx + m.dir.x);
      m.ty += m.dir.y;
      m.prog = 1 - m.prog;
    }
    m.dir = opposite(m.dir);
  }

  function moveMover(m, dt, decide, arrive) {
    let dist = m.speed * dt;
    let guard = 0;
    while (dist > 1e-6 && guard++ < 8) {
      if (m.prog === 0) {
        decide(m);
        if (m.dir === NONE) return;
      }
      const remain = 1 - m.prog;
      if (dist >= remain) {
        dist -= remain;
        m.tx = wrapX(m.tx + m.dir.x);
        m.ty += m.dir.y;
        m.prog = 0;
        if (arrive) arrive(m);
      } else {
        m.prog += dist;
        dist = 0;
      }
    }
  }

  // ---------- ENTITIES ----------
  function makePlayer(def) {
    return {
      ...def,
      m: makeMover(def.start.x, def.start.y),
      want: NONE,
      facing: def.face,
      score: 0,
      lives: START_LIVES,
      out: false,
      power: 0,
      invuln: 0,
      stun: 0,
      combo: 0,
      anim: 0,
    };
  }

  function makeGhost(def, i) {
    return {
      ...def,
      idx: i,
      m: makeMover(def.start.x, def.start.y),
      mode: i === 0 ? 'chase' : 'house',  // house | leaving | chase | eaten
      fright: 0,
    };
  }

  function resetGame() {
    resetGrid();
    players = PLAYER_DEFS.map(makePlayer);
    ghosts = GHOST_DEFS.map(makeGhost);
    particles = [];
    popups = [];
    bonus = { active: false, t: 0 };
    elapsed = 0;
    shake = 0;
    goFlash = 0;
  }

  // ---------- PLAYERS ----------
  function playerDecide(p) {
    const m = p.m;
    if (p.want !== NONE && playerCanEnter(m.tx + p.want.x, m.ty + p.want.y)) {
      m.dir = p.want;
    } else if (m.dir !== NONE && !playerCanEnter(m.tx + m.dir.x, m.ty + m.dir.y)) {
      m.dir = NONE;
    }
  }

  function updatePlayer(p, dt) {
    if (p.out) return;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.power > 0) p.power = Math.max(0, p.power - dt);
    if (p.stun > 0) { p.stun = Math.max(0, p.stun - dt); return; }

    const m = p.m;
    // instant U-turns feel great, so allow them mid-tile
    if (m.prog > 0 && p.want !== NONE && p.want === opposite(m.dir)) reverseMover(m);

    m.speed = p.power > 0 ? POWER_SPEED : PLAYER_SPEED;
    moveMover(m, dt, () => playerDecide(p), () => eatAt(p));
    if (m.dir !== NONE) {
      p.facing = m.dir;
      p.anim += dt * 8;
    }
  }

  function eatAt(p) {
    const { tx, ty } = p.m;
    const c = grid[ty][tx];
    const px = (tx + 0.5) * T;
    const py = (ty + 0.5) * T;
    if (c === '.') {
      grid[ty][tx] = ' ';
      p.score += 10;
      dotsLeft--;
      dotsEaten++;
      sfx.dot(p.id);
      if (bonusTriggers.includes(dotsEaten)) {
        bonus = { active: true, t: 10 };
        popups.push({ x: (BONUS_SPOT.x + 0.5) * T, y: (BONUS_SPOT.y + 0.5) * T - 14, text: 'BONUS!', color: '#ffe14d', life: 1.4 });
      }
    } else if (c === 'o') {
      grid[ty][tx] = ' ';
      p.score += 50;
      dotsLeft--;
      dotsEaten++;
      activatePower(p);
      burst(px, py, p.color, 22, 160);
    }
  }

  function activatePower(p) {
    p.power = POWER_TIME;
    p.combo = 0;
    popups.push({ x: (p.m.tx + 0.5) * T, y: (p.m.ty + 0.5) * T - 10, text: 'POWER!', color: p.color, life: 1.2 });
    for (const g of ghosts) {
      if (g.mode === 'eaten') continue;
      if (g.fright <= 0 && g.mode === 'chase') reverseMover(g.m);
      g.fright = POWER_TIME;
    }
    sfx.power();
  }

  function killPlayer(p) {
    const pos = posOf(p.m);
    burst((pos.x + 0.5) * T, (pos.y + 0.5) * T, p.color, 34, 220);
    burst((pos.x + 0.5) * T, (pos.y + 0.5) * T, '#ffffff', 12, 140);
    shake = 0.35;
    sfx.die();
    p.lives--;
    p.power = 0;
    if (p.lives <= 0) {
      p.out = true;
      popups.push({ x: (pos.x + 0.5) * T, y: (pos.y + 0.5) * T, text: `${p.name} OUT!`, color: p.color, life: 1.8 });
      return;
    }
    p.m = makeMover(p.start.x, p.start.y);
    p.want = NONE;
    p.facing = p.face;
    p.stun = 1.2;     // short freeze at spawn...
    p.invuln = 3.2;   // ...with a few seconds of safety
  }

  function steal(attacker, victim) {
    const amount = Math.min(STEAL_POINTS, victim.score);
    victim.score -= amount;
    attacker.score += amount;
    victim.stun = STUN_TIME;
    victim.invuln = STUN_TIME + 2.5;
    victim.power = 0;
    const pos = posOf(victim.m);
    const px = (pos.x + 0.5) * T;
    const py = (pos.y + 0.5) * T;
    burst(px, py, attacker.color, 26, 200);
    burst(px, py, '#ffe14d', 14, 150);
    popups.push({ x: px, y: py - 12, text: amount ? `-${amount}` : 'BONK!', color: victim.color, life: 1.2 });
    const apos = posOf(attacker.m);
    popups.push({ x: (apos.x + 0.5) * T, y: (apos.y + 0.5) * T - 18, text: amount ? `+${amount}` : '', color: attacker.color, life: 1.2 });
    shake = 0.25;
    sfx.steal();
  }

  // ---------- GHOSTS ("Gloomies") ----------
  function pickTargetPlayer(g) {
    const active = players.filter(p => !p.out);
    if (!active.length) return null;
    if (g.hunts === 'p1') return players[0].out ? active[0] : players[0];
    if (g.hunts === 'p2') return players[1].out ? active[0] : players[1];
    let best = null;
    let bd = Infinity;
    for (const p of active) {
      const d = Math.abs(p.m.tx - g.m.tx) + Math.abs(p.m.ty - g.m.ty);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function ghostDecide(g) {
    const m = g.m;
    const travelling = g.mode === 'eaten' || g.mode === 'leaving';
    const opts = DIRS.filter(d => ghostCanEnter(g, m.tx + d.x, m.ty + d.y));
    if (!opts.length) { m.dir = NONE; return; }

    let target = null;
    let rnd = 0;
    if (g.mode === 'eaten') target = HOME;
    else if (g.mode === 'leaving') target = EXIT;
    else if (g.fright > 0) rnd = 1;
    else {
      const p = pickTargetPlayer(g);
      if (p) target = { x: p.m.tx, y: p.m.ty };
      rnd = g.rand;
    }

    // ghosts don't U-turn unless they have to (or are heading home)
    let choices = travelling ? opts : opts.filter(d => d !== opposite(m.dir));
    if (!choices.length) choices = opts;

    if (!target || Math.random() < rnd) {
      m.dir = choices[Math.floor(Math.random() * choices.length)];
      return;
    }
    const dm = distMap(target.x, target.y, travelling);
    let best = choices[0];
    let bd = Infinity;
    for (const d of choices) {
      const v = dm[m.ty + d.y][wrapX(m.tx + d.x)];
      if (v < bd) { bd = v; best = d; }
    }
    m.dir = best;
  }

  function ghostArrive(g) {
    if (g.mode === 'eaten' && g.m.tx === HOME.x && g.m.ty === HOME.y) {
      g.mode = 'leaving';
    } else if (g.mode === 'leaving' && g.m.tx === EXIT.x && g.m.ty === EXIT.y) {
      g.mode = 'chase';
    }
  }

  function updateGhost(g, dt) {
    if (g.fright > 0) g.fright = Math.max(0, g.fright - dt);
    if (g.mode === 'house') {
      if (elapsed >= g.release) g.mode = 'leaving';
      else return;
    }
    const progress = 1 - dotsLeft / totalDots;   // they speed up as the board empties
    g.m.speed = g.mode === 'eaten' ? 12
      : g.mode === 'leaving' ? 4
      : g.fright > 0 ? 3.4
      : 5.0 + 1.6 * progress;
    moveMover(g.m, dt, () => ghostDecide(g), () => ghostArrive(g));
  }

  // ---------- COLLISIONS ----------
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function handleCollisions() {
    for (const p of players) {
      if (p.out) continue;
      const pp = posOf(p.m);

      for (const g of ghosts) {
        if (g.mode === 'eaten' || g.mode === 'house') continue;
        if (dist(pp, posOf(g.m)) > 0.65) continue;
        if (g.fright > 0) {
          const pts = 200 * 2 ** p.combo;
          p.combo = Math.min(p.combo + 1, 3);
          p.score += pts;
          g.mode = 'eaten';
          g.fright = 0;
          const gp = posOf(g.m);
          burst((gp.x + 0.5) * T, (gp.y + 0.5) * T, '#6f8bff', 18, 160);
          popups.push({ x: (gp.x + 0.5) * T, y: (gp.y + 0.5) * T, text: `+${pts}`, color: p.color, life: 1.1 });
          sfx.ghost();
        } else if (p.invuln <= 0) {
          killPlayer(p);
          break;
        }
      }

      if (bonus.active && !p.out && dist(posOf(p.m), BONUS_SPOT) < 0.7) {
        bonus.active = false;
        p.score += 500;
        const bx = (BONUS_SPOT.x + 0.5) * T;
        const by = (BONUS_SPOT.y + 0.5) * T;
        burst(bx, by, '#ffe14d', 30, 200);
        popups.push({ x: bx, y: by - 10, text: '+500', color: p.color, life: 1.3 });
        sfx.bonus();
      }
    }

    // Player vs player: a powered-up player can bash their rival
    const [a, b] = players;
    if (!a.out && !b.out && dist(posOf(a.m), posOf(b.m)) < 0.75) {
      if (a.power > 0 && b.power <= 0 && b.invuln <= 0) steal(a, b);
      else if (b.power > 0 && a.power <= 0 && a.invuln <= 0) steal(b, a);
    }
  }

  // ---------- EFFECTS ----------
  function burst(x, y, color, n = 14, speed = 120) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const s = speed * (0.35 + Math.random() * 0.8);
      const life = 0.5 + Math.random() * 0.5;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: 2 + Math.random() * 3 });
    }
  }

  function updateFx(dt) {
    for (const pt of particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.93;
      pt.vy = pt.vy * 0.93 + 40 * dt;
      pt.life -= dt;
    }
    particles = particles.filter(pt => pt.life > 0);
    for (const pu of popups) { pu.y -= 26 * dt; pu.life -= dt; }
    popups = popups.filter(pu => pu.life > 0);
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (goFlash > 0) goFlash = Math.max(0, goFlash - dt);
  }

  // ---------- GAME FLOW ----------
  function startGame() {
    audio();
    resetGame();
    state = 'countdown';
    countdown = 3;
    lastCount = 4;
    hideOverlay();
  }

  function endGame() {
    state = 'over';
    const [a, b] = players;
    const reason = dotsLeft <= 0 ? 'Every dot has been gobbled!' : 'Both players are out of lives!';
    let headline;
    let color;
    if (a.score === b.score) { headline = "IT'S A TIE!"; color = '#ffe14d'; }
    else {
      const w = a.score > b.score ? a : b;
      headline = `${w.name} WINS!`;
      color = w.color;
    }
    for (let i = 0; i < 6; i++) {
      burst(Math.random() * W, Math.random() * H * 0.7, `hsl(${Math.random() * 360},100%,65%)`, 20, 220);
    }
    sfx.win();
    setTimeout(() => {
      showOverlay(`
        <div class="ov-card">
          <h2>GAME OVER</h2>
          <div class="reason">${reason}</div>
          <div class="winner" style="color:${color}">🏆 ${headline}</div>
          <div class="final">
            <div class="p1">LIME<br>${a.score}</div>
            <div class="p2">BERRY<br>${b.score}</div>
          </div>
          <button class="big-btn" data-action="start">↻ PLAY AGAIN</button>
          <div class="hint">or press SPACE</div>
        </div>`);
    }, 1100);
  }

  function update(dt) {
    updateFx(dt);

    if (state === 'countdown') {
      countdown -= dt;
      const n = Math.ceil(countdown);
      if (n !== lastCount && n > 0) { lastCount = n; sfx.beep(false); }
      if (countdown <= 0) {
        state = 'play';
        goFlash = 0.8;
        sfx.beep(true);
      }
      return;
    }
    if (state !== 'play') return;

    elapsed += dt;
    players.forEach(p => updatePlayer(p, dt));
    ghosts.forEach(g => updateGhost(g, dt));
    handleCollisions();

    if (bonus.active) {
      bonus.t -= dt;
      if (bonus.t <= 0) bonus.active = false;
    }

    if (dotsLeft <= 0 || players.every(p => p.out)) endGame();
  }

  // ---------- DRAWING ----------
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y + h, r);
    c.closePath();
  }

  function starPath(c, cx, cy, spikes, outer, inner, rot = 0) {
    c.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 ? inner : outer;
      const a = rot + (i * Math.PI) / spikes - Math.PI / 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i) c.lineTo(x, y); else c.moveTo(x, y);
    }
    c.closePath();
  }

  // The maze never changes, so draw it once onto an offscreen canvas.
  const mazeCanvas = document.createElement('canvas');
  mazeCanvas.width = W;
  mazeCanvas.height = H;
  (function buildMaze() {
    const mc = mazeCanvas.getContext('2d');
    const bg = mc.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#190b3c');
    bg.addColorStop(1, '#071b3f');
    mc.fillStyle = bg;
    mc.fillRect(0, 0, W, H);

    const isWall = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS && MAP[y][x] === '#';

    function pass(w, colorFn) {
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (!isWall(x, y)) continue;
          const cx = x * T + T / 2;
          const cy = y * T + T / 2;
          mc.fillStyle = colorFn(x, y);
          roundRect(mc, cx - w, cy - w, 2 * w, 2 * w, w * 0.6);
          mc.fill();
          if (isWall(x + 1, y)) mc.fillRect(cx, cy - w, T, 2 * w);
          if (isWall(x, y + 1)) mc.fillRect(cx - w, cy, 2 * w, T);
          if (isWall(x + 1, y) && isWall(x, y + 1) && isWall(x + 1, y + 1)) mc.fillRect(cx, cy, T, T);
        }
      }
    }

    // glowing rainbow tubes...
    mc.shadowColor = 'rgba(160, 120, 255, 0.9)';
    mc.shadowBlur = 14;
    pass(T * 0.44, (x, y) => `hsl(${(190 + (x + y) * 8) % 360}, 95%, 62%)`);
    mc.shadowBlur = 0;
    // ...hollowed out with a dark core
    pass(T * 0.27, () => '#150c36');

    // ghost door
    mc.fillStyle = '#ff9be4';
    roundRect(mc, 10 * T + 2, 8 * T + T / 2 - 3, T - 4, 6, 3);
    mc.fill();
  })();

  function drawDots() {
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = grid[y][x];
        const cx = x * T + T / 2;
        const cy = y * T + T / 2;
        if (c === '.') {
          ctx.fillStyle = dotColor[y][x];
          ctx.beginPath();
          ctx.arc(cx, cy, 3.2, 0, TAU);
          ctx.fill();
        } else if (c === 'o') {
          const r = 7.5 + Math.sin(time * 6 + x) * 2;
          const g = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, r);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.4, `hsl(${(time * 200 + x * 40) % 360}, 100%, 70%)`);
          g.addColorStop(1, `hsl(${(time * 200 + x * 40 + 80) % 360}, 100%, 50%)`);
          ctx.save();
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 16;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  function drawBonus() {
    if (!bonus.active) return;
    if (bonus.t < 3 && Math.floor(time * 8) % 2 === 0) return;  // blink before vanishing
    const cx = (BONUS_SPOT.x + 0.5) * T;
    const cy = (BONUS_SPOT.y + 0.5) * T + Math.sin(time * 4) * 2;
    ctx.save();
    ctx.shadowColor = '#ffe14d';
    ctx.shadowBlur = 20;
    starPath(ctx, cx, cy, 5, T * 0.46, T * 0.2, time * 2);
    const g = ctx.createLinearGradient(cx - 12, cy - 12, cx + 12, cy + 12);
    g.addColorStop(0, '#fff7a8');
    g.addColorStop(0.5, '#ffb800');
    g.addColorStop(1, '#ff5fa2');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer(p) {
    if (p.out) return;
    const pos = posOf(p.m);
    const cx = (pos.x + 0.5) * T;
    const cy = (pos.y + 0.5) * T;
    const r = T * 0.42;
    const moving = p.m.dir !== NONE && p.stun <= 0;

    ctx.save();
    if (p.invuln > 0 && p.stun <= 0 && Math.floor(time * 12) % 2 === 0) ctx.globalAlpha = 0.35;
    ctx.translate(cx, cy);

    // power aura
    if (p.power > 0) {
      const flicker = p.power < 2 && Math.floor(time * 10) % 2 === 0;
      if (!flicker) {
        ctx.save();
        ctx.lineWidth = 3;
        ctx.strokeStyle = `hsl(${(time * 400) % 360}, 100%, 65%)`;
        ctx.shadowColor = ctx.strokeStyle;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(0, 0, r + 5 + Math.sin(time * 12) * 1.5, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    }

    const squash = moving ? Math.sin(p.anim * 2) * 0.07 : Math.sin(time * 3) * 0.03;
    ctx.scale(1 + squash, 1 - squash);

    // accessory: Lime has a leaf, Berry has antennae
    if (p.id === 1) {
      ctx.save();
      ctx.translate(0, -r * 0.9);
      ctx.rotate(-0.5 + Math.sin(time * 4) * 0.18);
      ctx.fillStyle = '#21c43a';
      ctx.beginPath();
      ctx.ellipse(r * 0.28, -r * 0.05, r * 0.36, r * 0.15, -0.3, 0, TAU);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.strokeStyle = p.dark;
      ctx.lineWidth = 2;
      for (const s of [-1, 1]) {
        const tipX = s * r * 0.6 + Math.sin(time * 5 + s) * 2;
        const tipY = -r * 1.25;
        ctx.beginPath();
        ctx.moveTo(s * r * 0.3, -r * 0.75);
        ctx.quadraticCurveTo(s * r * 0.35, -r * 1.1, tipX, tipY);
        ctx.stroke();
        ctx.fillStyle = '#ffe14d';
        ctx.beginPath();
        ctx.arc(tipX, tipY, r * 0.15, 0, TAU);
        ctx.fill();
      }
    }

    // body
    const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    body.addColorStop(0, p.light);
    body.addColorStop(0.55, p.color);
    body.addColorStop(1, p.dark);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    // face
    const f = p.facing;
    const fx = f.x * r * 0.18;
    const fy = f.y * r * 0.15;
    if (p.stun > 0) {
      ctx.strokeStyle = '#2a0b3d';
      ctx.lineWidth = 2.2;
      for (const s of [-1, 1]) {
        const ex = s * r * 0.33;
        const ey = -r * 0.15;
        ctx.beginPath();
        ctx.moveTo(ex - 4, ey - 4); ctx.lineTo(ex + 4, ey + 4);
        ctx.moveTo(ex + 4, ey - 4); ctx.lineTo(ex - 4, ey + 4);
        ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        const ex = s * r * 0.33 + fx;
        const ey = -r * 0.18 + fy;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(ex, ey, r * 0.2, r * 0.25, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#1b0b3d';
        ctx.beginPath();
        ctx.arc(ex + f.x * r * 0.08, ey + f.y * r * 0.08, r * 0.11, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex + f.x * r * 0.08 - 1.5, ey + f.y * r * 0.08 - 1.5, 1.4, 0, TAU);
        ctx.fill();
      }
    }

    // munching mouth
    const open = moving ? 0.3 + 0.7 * Math.abs(Math.sin(p.anim * 3)) : 0.25;
    ctx.fillStyle = '#5a0a1e';
    ctx.beginPath();
    ctx.ellipse(fx * 0.8, r * 0.4 + fy * 0.5, r * 0.27, r * 0.03 + r * 0.2 * open, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ff7aa2';
    ctx.beginPath();
    ctx.ellipse(fx * 0.8, r * 0.47 + fy * 0.5 + r * 0.08 * open, r * 0.13, r * 0.05 + r * 0.05 * open, 0, 0, TAU);
    ctx.fill();

    // cheeks
    ctx.fillStyle = 'rgba(255, 80, 140, 0.45)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * r * 0.6, r * 0.18, r * 0.12, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // dizzy stars
    if (p.stun > 0) {
      for (let i = 0; i < 3; i++) {
        const a = time * 5 + (i * TAU) / 3;
        starPath(ctx, cx + Math.cos(a) * r * 1.1, cy - r * 1.05 + Math.sin(a) * r * 0.3, 5, 4.5, 2, a);
        ctx.fillStyle = '#ffe14d';
        ctx.fill();
      }
    }
  }

  function drawGhostEyes(dir, r, angry) {
    for (const s of [-1, 1]) {
      const ex = s * r * 0.28;
      const ey = -r * 0.08;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.22, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#14082e';
      ctx.beginPath();
      ctx.arc(ex + dir.x * r * 0.1, ey + dir.y * r * 0.1, r * 0.11, 0, TAU);
      ctx.fill();
    }
    if (angry) {
      ctx.strokeStyle = '#14082e';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-r * 0.52, -r * 0.42); ctx.lineTo(-r * 0.12, -r * 0.27);
      ctx.moveTo(r * 0.52, -r * 0.42); ctx.lineTo(r * 0.12, -r * 0.27);
      ctx.stroke();
    }
  }

  function drawGhost(g) {
    const pos = posOf(g.m);
    const cx = (pos.x + 0.5) * T;
    let cy = (pos.y + 0.5) * T;
    if (g.mode === 'house') cy += Math.sin(time * 5 + g.idx) * T * 0.12;
    const r = T * 0.46;
    const dir = g.m.dir === NONE ? DOWN : g.m.dir;

    ctx.save();
    ctx.translate(cx, cy);

    if (g.mode === 'eaten') {   // just the eyes zooming home
      drawGhostEyes(dir, r, false);
      ctx.restore();
      return;
    }

    const scared = g.fright > 0;
    const flashing = scared && g.fright < 2 && Math.floor(time * 8) % 2 === 0;
    const base = scared ? (flashing ? '#ffffff' : '#3b5bff') : g.color;

    starPath(ctx, 0, 0, 9, r, r * 0.78, time * 1.2 + g.idx);
    const grad = ctx.createRadialGradient(-r * 0.3, -r * 0.35, 1, 0, 0, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.35, base);
    grad.addColorStop(1, base);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();

    if (scared) {
      const fc = flashing ? '#ff3b5c' : '#ffffff';
      ctx.fillStyle = fc;
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * r * 0.25, -r * 0.12, r * 0.09, 0, TAU);
        ctx.fill();
      }
      ctx.strokeStyle = fc;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const x = -r * 0.38 + (i * r * 0.76) / 6;
        const y = r * 0.25 + (i % 2 ? -3 : 3);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
    } else {
      drawGhostEyes(dir, r, true);
    }
    ctx.restore();
  }

  function drawFx() {
    for (const pt of particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px "Press Start 2P", monospace';
    for (const pu of popups) {
      if (!pu.text) continue;
      ctx.globalAlpha = Math.min(1, pu.life * 1.5);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#14082e';
      ctx.strokeText(pu.text, pu.x, pu.y);
      ctx.fillStyle = pu.color;
      ctx.fillText(pu.text, pu.x, pu.y);
    }
    ctx.globalAlpha = 1;
  }

  function bigText(text, sub) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const y = 11.5 * T;
    ctx.font = '44px "Press Start 2P", monospace';
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#14082e';
    ctx.strokeText(text, W / 2, y);
    const g = ctx.createLinearGradient(W / 2 - 120, 0, W / 2 + 120, 0);
    g.addColorStop(0, '#7dff3a');
    g.addColorStop(0.5, '#ffe14d');
    g.addColorStop(1, '#ff4fd8');
    ctx.fillStyle = g;
    ctx.fillText(text, W / 2, y);
    if (sub) {
      ctx.font = '12px "Press Start 2P", monospace';
      ctx.lineWidth = 6;
      ctx.strokeText(sub, W / 2, y + 42);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(sub, W / 2, y + 42);
    }
    ctx.restore();
  }

  function draw() {
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake);
    ctx.drawImage(mazeCanvas, 0, 0);
    drawDots();
    drawBonus();
    ghosts.forEach(drawGhost);
    players.forEach(drawPlayer);
    drawFx();
    ctx.restore();

    if (state === 'countdown') bigText(String(Math.max(1, Math.ceil(countdown))), 'GET READY!');
    else if (goFlash > 0) bigText('GO!');
    else if (state === 'paused') bigText('PAUSED', 'press P to resume');
  }

  // ---------- HUD ----------
  const hudCache = {};
  function setIf(el, key, val, asHtml) {
    if (hudCache[key] === val) return false;
    hudCache[key] = val;
    if (asHtml) el.innerHTML = val; else el.textContent = val;
    return true;
  }

  function updateHUD() {
    players.forEach((p, i) => {
      const h = HUD[i];
      if (setIf(h.score, `s${i}`, String(p.score))) {
        h.score.classList.remove('bump');
        void h.score.offsetWidth;   // restart the CSS animation
        h.score.classList.add('bump');
      }
      const lives = p.out
        ? '<span class="out">KNOCKED OUT</span>'
        : '<span class="heart">♥</span>'.repeat(p.lives) + '<span class="heart lost">♥</span>'.repeat(Math.max(0, START_LIVES - p.lives));
      setIf(h.lives, `l${i}`, lives, true);
      const status = p.out ? '' : p.stun > 0 ? '💫 dizzy!' : p.power > 0 ? `⚡ POWER ${Math.ceil(p.power)}` : '';
      setIf(h.status, `st${i}`, status);
    });
    const [a, b] = players;
    HUD[0].card.classList.toggle('leading', a.score > b.score);
    HUD[1].card.classList.toggle('leading', b.score > a.score);
    setIf(dotsEl, 'dots', String(dotsLeft));
  }

  // ---------- OVERLAY ----------
  function showOverlay(html) {
    overlay.innerHTML = html;
    overlay.classList.remove('hidden');
  }
  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  const TITLE_HTML = `
    <div class="ov-card">
      <h2>Ready to duel?</h2>
      <div class="rules">
        <div class="rule"><span class="chip p1">P1</span> Lime moves with <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div>
        <div class="rule"><span class="chip p2">P2</span> Berry moves with <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div>
        <ul>
          <li>Race to gobble dots (10 pts). Most points wins!</li>
          <li>Rainbow orbs (50) power you up and turn the Gloomies blue — munch them for 200 → 1600.</li>
          <li>While powered, crash into your rival to <b>steal 100 points</b> and leave them dizzy!</li>
          <li>Touch a Gloomy and you lose a life. 3 lives each.</li>
          <li>Grab the bonus star for 500.</li>
        </ul>
      </div>
      <button class="big-btn" data-action="start">▶ START</button>
      <div class="hint">or press SPACE · P to pause</div>
    </div>`;

  overlay.addEventListener('click', e => {
    if (e.target.closest('[data-action="start"]')) startGame();
  });

  restartBtn.addEventListener('click', e => {
    e.currentTarget.blur();
    startGame();
  });

  muteBtn.addEventListener('click', e => {
    muted = !muted;
    muteBtn.textContent = muted ? '🔇' : '🔊';
    e.currentTarget.blur();
  });

  // ---------- INPUT ----------
  const KEYS = {
    KeyW: [0, UP], KeyA: [0, LEFT], KeyS: [0, DOWN], KeyD: [0, RIGHT],
    ArrowUp: [1, UP], ArrowLeft: [1, LEFT], ArrowDown: [1, DOWN], ArrowRight: [1, RIGHT],
  };

  window.addEventListener('keydown', e => {
    const k = KEYS[e.code];
    if (k) {
      e.preventDefault();
      const p = players[k[0]];
      if (p) p.want = k[1];
      return;
    }
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (state === 'title' || state === 'over') startGame();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      if (state === 'play') state = 'paused';
      else if (state === 'paused') state = 'play';
    }
  });

  window.addEventListener('blur', () => {
    if (state === 'play') state = 'paused';
  });

  // ---------- LOOP ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;
    update(dt);
    draw();
    updateHUD();
    requestAnimationFrame(frame);
  }

  resetGame();
  showOverlay(TITLE_HTML);
  requestAnimationFrame(frame);
})();
