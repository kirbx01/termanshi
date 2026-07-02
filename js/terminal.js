/* ================================================================
   TERMINAL.JS
   Renders EVERY character of this fake OS onto a 2D <canvas> -
   there is no DOM text anywhere. Owns the scrollback buffer, the
   blinking block cursor, keyboard input (with history + tab
   completion), and a minimal full-screen nano editor mode.

   Text glow is produced with a fixed (non-animated) canvas shadow -
   ctx.shadowBlur is a constant value on every draw call, so the
   glow never pulses or breathes. Only the WebGL layer in effects.js
   animates (flicker/noise/glitch), which is a separate CRT effect,
   not the text glow itself.
================================================================ */

const Terminal = (() => {
  const canvas = document.getElementById("text-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  // ---- palette -----------------------------------------------------
  // Default scheme is an animated RGB cycle (gaming-style hue shift).
  // `color <name>` (see commands.js) can switch to a fixed theme instead.
  const BG = "#000000";
  const GLOW_BLUR = 7;            // STATIC glow amount - never animated

  const THEMES = {
    rgb:    { mode: "rgb" },
    pink:   { mode: "static", color: "#ffc1cc" },
    red:    { mode: "static", color: "#ff4d4d" },
    green:  { mode: "static", color: "#39ff6a" },
    blue:   { mode: "static", color: "#4da6ff" },
    amber:  { mode: "static", color: "#ffb347" },
    cyan:   { mode: "static", color: "#4dffef" },
    purple: { mode: "static", color: "#c17cff" },
    white:  { mode: "static", color: "#f2f2f2" },
  };
  const THEME_NAMES = Object.keys(THEMES);
  let currentTheme = "rgb";
  let rgbAnimTimer = null;

  // eight evenly-spread hues used to colourise the neofetch dots
  // individually, independent of whichever theme is active.
  const DOT_HUES = [0, 40, 80, 130, 175, 210, 260, 305];

  function hslColor(hueOffset = 0, sat = 100, light = 68) {
    const hue = ((Date.now() / 18) + hueOffset) % 360;
    return `hsl(${hue.toFixed(1)}, ${sat}%, ${light}%)`;
  }

  function baseColor() {
    const t = THEMES[currentTheme] || THEMES.pink;
    return t.mode === "rgb" ? hslColor(0) : t.color;
  }

  function ensureRgbAnim() {
    const needsAnim = (THEMES[currentTheme] || {}).mode === "rgb";
    if (needsAnim && !rgbAnimTimer) {
      rgbAnimTimer = setInterval(render, 60);
    } else if (!needsAnim && rgbAnimTimer) {
      clearInterval(rgbAnimTimer);
      rgbAnimTimer = null;
    }
  }

  function setTheme(name) {
    if (!THEMES[name]) return false;
    currentTheme = name;
    ensureRgbAnim();
    render();
    return true;
  }

  function getTheme() { return currentTheme; }

  // ---- type metrics --------------------------------------------------
  const FONT_FAMILIES = {
    jetbrains: '"JetBrains Mono"',
    plex: '"IBM Plex Mono"',
    space: '"Space Mono"',
  };
  const FONT_WEIGHT = 700;
  const DEFAULT_FONT_SIZE = 17;
  const MIN_FONT_SIZE = 12;
  const MAX_FONT_SIZE = 26;
  let currentFontKey = "jetbrains";
  let fontSize = DEFAULT_FONT_SIZE;
  let lineHeight = 23;
  let padLeft = 24;
  let padTop = 24;
  let charWidth = 0;
  let cols = 0, rows = 0;
  let dpr = 1;

  function fontStackFor(key) {
    const primary = FONT_FAMILIES[key] || FONT_FAMILIES.jetbrains;
    return `${primary}, "JetBrains Mono", "IBM Plex Mono", "Space Mono", monospace`;
  }

  // ---- state -----------------------------------------------------
  let lines = [];              // committed scrollback (shell mode)
  const MAX_SCROLLBACK = 3000;
  let mode = "shell";          // "shell" | "nano" | "game"
  let activeGame = null;       // { onKey(e) } while mode === "game"

  let liveLine = null;         // { prefix, typed, cursor, mask } while reading input
  let inputResolver = null;
  let inputReject = null;
  let currentHistory = null;
  let historyIndex = 0;
  let tabHandler = null;

  let cursorVisible = true;
  let blinkTimer = null;

  // nano mode state
  let nano = null; // { filename, buffer(string), cursor(index), statusMsg }

  // ---------------------------------------------------------------
  // font metrics / sizing
  // ---------------------------------------------------------------
  function applyFont() {
    ctx.font = `${FONT_WEIGHT} ${fontSize}px ${fontStackFor(currentFontKey)}`;
    ctx.textBaseline = "top";
  }

  function measure() {
    applyFont();
    const m = ctx.measureText("M");
    charWidth = Math.round(m.width);
  }

  // ---- setfont API ---------------------------------------------------
  function setFontSize(px) {
    const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(px)));
    const changed = clamped !== fontSize;
    fontSize = clamped;
    lineHeight = Math.round(fontSize * 1.35);
    resize();
    return changed;
  }

  function adjustFontSize(delta) { return setFontSize(fontSize + delta); }

  function setFontFamily(key) {
    if (!FONT_FAMILIES[key]) return false;
    currentFontKey = key;
    resize();
    return true;
  }

  function resetFont() {
    currentFontKey = "jetbrains";
    fontSize = DEFAULT_FONT_SIZE;
    lineHeight = 23;
    resize();
  }

  function getFontInfo() {
    return { family: currentFontKey, size: fontSize, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    measure();
    cols = Math.max(20, Math.floor((w - padLeft * 2) / charWidth));
    rows = Math.max(10, Math.floor((h - padTop * 2) / lineHeight));
    render();
  }

  // ---------------------------------------------------------------
  // low level drawing
  // ---------------------------------------------------------------
  // `content` is either a plain string (rendered in the current theme
  // color) or an array of rich segments: [{ text, color? , hue? }].
  // `hue` (a 0-360 offset) renders an animated/static HSL color, used
  // to colourise the neofetch dots individually. `color` is a fixed hex.
  function drawTextRow(content, rowIndex) {
    // pixel-snap y for crisp, non-blurry glyphs
    const y = Math.round(padTop + rowIndex * lineHeight);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (Array.isArray(content)) {
      let x = padLeft;
      for (const seg of content) {
        const c = seg.color || (seg.hue !== undefined ? hslColor(seg.hue) : baseColor());
        ctx.shadowColor = c;
        ctx.shadowBlur = GLOW_BLUR;   // constant every frame -> static glow
        ctx.fillStyle = c;
        ctx.fillText(seg.text, Math.round(x), y);
        x += ctx.measureText(seg.text).width;
      }
      return;
    }

    const c = baseColor();
    ctx.shadowColor = c;
    ctx.shadowBlur = GLOW_BLUR;   // constant every frame -> static glow
    ctx.fillStyle = c;
    ctx.fillText(content, Math.round(padLeft), y);
  }

  function drawCursorBlock(colIndex, rowIndex) {
    if (!cursorVisible) return;
    const x = Math.round(padLeft + colIndex * charWidth);
    const y = Math.round(padTop + rowIndex * lineHeight);
    const c = baseColor();
    ctx.shadowColor = c;
    ctx.shadowBlur = GLOW_BLUR;
    ctx.fillStyle = c;
    ctx.fillRect(x, y, charWidth, lineHeight - 3);
  }

  function render() {
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    applyFont();

    if (mode === "nano") {
      renderNano();
      return;
    }

    if (mode === "game") {
      // matrix/snake draw themselves directly via their own loops;
      // nothing to composite here.
      return;
    }

    // shell mode: scrollback + optional live input line
    const displayLines = lines.slice();
    if (liveLine) {
      const shown = liveLine.mask
        ? liveLine.prefix + liveLine.mask.repeat(liveLine.typed.length)
        : liveLine.prefix + liveLine.typed;
      displayLines.push(shown);
    }

    const visible = displayLines.slice(-rows);
    const startRow = 0;
    for (let i = 0; i < visible.length; i++) {
      drawTextRow(visible[i], startRow + i);
    }

    if (liveLine) {
      const lastRow = startRow + visible.length - 1;
      const col = liveLine.prefix.length + liveLine.cursor;
      drawCursorBlock(col, lastRow);
    }
  }

  function renderNano() {
    const bufLines = nano.buffer.split("\n");
    const header = ` GNU nano   ${nano.filename}`;
    drawTextRow(header, 0);

    const bodyRows = rows - 2;
    // find cursor line/col
    let idx = 0, curLine = 0, curCol = 0;
    for (let i = 0; i < bufLines.length; i++) {
      const len = bufLines[i].length;
      if (nano.cursor <= idx + len) {
        curLine = i;
        curCol = nano.cursor - idx;
        break;
      }
      idx += len + 1;
    }
    let scrollTop = Math.max(0, curLine - bodyRows + 1);
    const visible = bufLines.slice(scrollTop, scrollTop + bodyRows);
    for (let i = 0; i < visible.length; i++) {
      drawTextRow(visible[i], 1 + i);
    }
    drawCursorBlock(curCol, 1 + (curLine - scrollTop));

    const footer = " ^X Exit    ^O Save    (read-only preview editor)";
    drawTextRow(footer, rows - 1);
  }

  // ---------------------------------------------------------------
  // blinking cursor
  // ---------------------------------------------------------------
  function startBlink() {
    if (blinkTimer) return;
    blinkTimer = setInterval(() => {
      cursorVisible = !cursorVisible;
      render();
    }, 500);
  }

  // ---------------------------------------------------------------
  // scrollback output API
  // ---------------------------------------------------------------
  function print(text) {
    const parts = String(text).split("\n");
    for (const p of parts) lines.push(p);
    if (lines.length > MAX_SCROLLBACK) lines = lines.slice(-MAX_SCROLLBACK);
    render();
  }

  // pushes a rich (multi-color) line: array of { text, color?, hue? }
  function printRich(segments) {
    lines.push(segments);
    if (lines.length > MAX_SCROLLBACK) lines = lines.slice(-MAX_SCROLLBACK);
    render();
  }

  function printColumns(leftLines, rightLines, gap = 4) {
    const width = Math.max(0, ...leftLines.map(l => l.length));
    const total = Math.max(leftLines.length, rightLines.length);
    for (let i = 0; i < total; i++) {
      const l = (leftLines[i] || "").padEnd(width + gap, " ");
      const r = rightLines[i];
      if (Array.isArray(r)) {
        printRich([{ text: l }, ...r]);
      } else {
        print(l + (r || ""));
      }
    }
  }

  function clear() {
    lines = [];
    render();
  }

  function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
  }

  // typed line effect used during boot
  async function typeLine(text, speed = 24) {
    lines.push("");
    const rowLineIdx = lines.length - 1;
    for (let i = 0; i < text.length; i++) {
      lines[rowLineIdx] += text[i];
      render();
      await sleep(speed + Math.random() * speed * 0.6);
    }
  }

  async function typeLines(arr, speed = 24, gap = 90) {
    for (const t of arr) {
      await typeLine(t, speed);
      await sleep(gap);
    }
  }

  // ---------------------------------------------------------------
  // input handling
  // ---------------------------------------------------------------
  function readLine({ prefix = "", mask = null, history = null, onTab = null } = {}) {
    return new Promise((resolve, reject) => {
      liveLine = { prefix, typed: "", cursor: 0, mask };
      currentHistory = history;
      historyIndex = history ? history.length : 0;
      tabHandler = onTab;
      inputResolver = resolve;
      inputReject = reject;
      render();
    });
  }

  function finalizeLine() {
    const l = liveLine;
    const shown = l.mask ? l.prefix + l.mask.repeat(l.typed.length) : l.prefix + l.typed;
    lines.push(shown);
    liveLine = null;
    const typed = l.typed;
    tabHandler = null;
    currentHistory = null;
    const resolve = inputResolver;
    inputResolver = null;
    inputReject = null;
    render();
    if (resolve) resolve(typed);
  }

  function handleShellKey(e) {
    if (!liveLine) return;
    const l = liveLine;

    if (e.key === "Enter") {
      e.preventDefault();
      TermAudio.enter();
      finalizeLine();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      if (l.cursor > 0) {
        l.typed = l.typed.slice(0, l.cursor - 1) + l.typed.slice(l.cursor);
        l.cursor--;
        TermAudio.tick();
      }
      render();
      return;
    }
    if (e.key === "Delete") {
      e.preventDefault();
      l.typed = l.typed.slice(0, l.cursor) + l.typed.slice(l.cursor + 1);
      render();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      l.cursor = Math.max(0, l.cursor - 1);
      render();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      l.cursor = Math.min(l.typed.length, l.cursor + 1);
      render();
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      l.cursor = 0;
      render();
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      l.cursor = l.typed.length;
      render();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (currentHistory && currentHistory.length) {
        historyIndex = Math.max(0, historyIndex - 1);
        l.typed = currentHistory[historyIndex] || "";
        l.cursor = l.typed.length;
        render();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (currentHistory && currentHistory.length) {
        historyIndex = Math.min(currentHistory.length, historyIndex + 1);
        l.typed = currentHistory[historyIndex] || "";
        l.cursor = l.typed.length;
        render();
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (tabHandler) {
        const completed = tabHandler(l.typed);
        if (typeof completed === "string") {
          l.typed = completed;
          l.cursor = l.typed.length;
          render();
        }
      }
      return;
    }
    if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
      e.preventDefault();
      lines.push(l.prefix + l.typed + "^C");
      liveLine = null;
      const reject = inputReject;
      inputResolver = null;
      inputReject = null;
      render();
      if (reject) reject(new Error("SIGINT"));
      return;
    }
    if (e.ctrlKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      clear();
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      l.typed = l.typed.slice(0, l.cursor) + e.key + l.typed.slice(l.cursor);
      l.cursor++;
      TermAudio.key();
      render();
    }
  }

  // ---------------------------------------------------------------
  // nano mode
  // ---------------------------------------------------------------
  function nanoEdit(filename, content) {
    return new Promise((resolve) => {
      mode = "nano";
      nano = { filename, buffer: content || "", cursor: (content || "").length, resolve };
      render();
    });
  }

  function handleNanoKey(e) {
    if (e.ctrlKey && (e.key === "x" || e.key === "X")) {
      e.preventDefault();
      mode = "shell";
      const resolve = nano.resolve;
      const buf = nano.buffer;
      nano = null;
      render();
      resolve(buf);
      return;
    }
    if (e.ctrlKey && (e.key === "o" || e.key === "O")) {
      e.preventDefault();
      return; // save handled implicitly on exit for this simplified editor
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      if (nano.cursor > 0) {
        nano.buffer = nano.buffer.slice(0, nano.cursor - 1) + nano.buffer.slice(nano.cursor);
        nano.cursor--;
        TermAudio.tick();
      }
      render();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      nano.buffer = nano.buffer.slice(0, nano.cursor) + "\n" + nano.buffer.slice(nano.cursor);
      nano.cursor++;
      render();
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      nano.cursor = Math.max(0, nano.cursor - 1);
      render();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      nano.cursor = Math.min(nano.buffer.length, nano.cursor + 1);
      render();
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      nano.buffer = nano.buffer.slice(0, nano.cursor) + e.key + nano.buffer.slice(nano.cursor);
      nano.cursor++;
      TermAudio.key();
      render();
    }
  }

  // ---------------------------------------------------------------
  // fun commands: matrix rain + snake game
  // both take over the canvas directly (like nano mode) and hand
  // control back to the shell once the visitor exits.
  // ---------------------------------------------------------------
  function runMatrix() {
    return new Promise((resolve) => {
      mode = "game";
      const colsCount = cols;
      const rowsCount = rows;
      const glyphs = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const drops = new Array(colsCount).fill(0).map(() => Math.floor(Math.random() * rowsCount));
      let raf = null;
      let alive = true;

      function frame() {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(0,0,0,0.15)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        applyFont();

        for (let c = 0; c < colsCount; c++) {
          const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
          const x = Math.round(padLeft + c * charWidth);
          const y = Math.round(padTop + drops[c] * lineHeight);
          const bright = Math.random() < 0.06;
          ctx.shadowColor = "#39ff6a";
          ctx.shadowBlur = GLOW_BLUR;
          ctx.fillStyle = bright ? "#eaffea" : "#39ff6a";
          ctx.fillText(ch, x, y);

          if (drops[c] > rowsCount + 5 || Math.random() > 0.975) drops[c] = 0;
          else drops[c]++;
        }
        if (alive) raf = requestAnimationFrame(frame);
      }

      function cleanup() {
        alive = false;
        if (raf) cancelAnimationFrame(raf);
        activeGame = null;
        mode = "shell";
        render();
      }

      activeGame = {
        onKey(e) {
          e.preventDefault();
          cleanup();
          resolve();
        },
      };

      print("Entering the Matrix... press any key to exit.");
      raf = requestAnimationFrame(frame);
    });
  }

  function runSnake() {
    return new Promise((resolve) => {
      mode = "game";
      const boardW = Math.max(16, Math.min(34, cols - 6));
      const boardH = Math.max(10, Math.min(16, rows - 8));
      let snake = [{ x: Math.floor(boardW / 2), y: Math.floor(boardH / 2) }];
      let dir = { x: 1, y: 0 };
      let nextDir = dir;
      let score = 0;
      let over = false;
      let tickTimer = null;

      function spawnFood() {
        let f;
        do {
          f = { x: Math.floor(Math.random() * boardW), y: Math.floor(Math.random() * boardH) };
        } while (snake.some(s => s.x === f.x && s.y === f.y));
        return f;
      }
      let food = spawnFood();

      function renderFrame() {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        applyFont();

        drawTextRow(` SNAKE   score: ${score}   arrows / wasd to move, q to quit`, 0);
        const border = "+" + "-".repeat(boardW) + "+";
        drawTextRow(border, 1);
        for (let y = 0; y < boardH; y++) {
          let row = "|";
          for (let x = 0; x < boardW; x++) {
            const isHead = snake[0].x === x && snake[0].y === y;
            const isBody = !isHead && snake.some(s => s.x === x && s.y === y);
            const isFood = food.x === x && food.y === y;
            row += isHead ? "@" : isBody ? "o" : isFood ? "*" : " ";
          }
          row += "|";
          drawTextRow(row, 2 + y);
        }
        drawTextRow(border, 2 + boardH);
        if (over) {
          drawTextRow(`  GAME OVER - score: ${score} - press any key to exit`, 3 + boardH);
        }
      }

      function tick() {
        if (over) return;
        dir = nextDir;
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        const hitWall = head.x < 0 || head.x >= boardW || head.y < 0 || head.y >= boardH;
        const hitSelf = snake.some(s => s.x === head.x && s.y === head.y);
        if (hitWall || hitSelf) {
          over = true;
          clearInterval(tickTimer);
          renderFrame();
          return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score += 10;
          food = spawnFood();
        } else {
          snake.pop();
        }
        renderFrame();
      }

      function cleanup() {
        clearInterval(tickTimer);
        activeGame = null;
        mode = "shell";
        render();
      }

      activeGame = {
        onKey(e) {
          const k = e.key.toLowerCase();
          if (over) { e.preventDefault(); cleanup(); resolve(score); return; }
          if (k === "q") { e.preventDefault(); over = true; clearInterval(tickTimer); renderFrame(); return; }
          if ((k === "arrowup" || k === "w") && dir.y === 0) { e.preventDefault(); nextDir = { x: 0, y: -1 }; }
          else if ((k === "arrowdown" || k === "s") && dir.y === 0) { e.preventDefault(); nextDir = { x: 0, y: 1 }; }
          else if ((k === "arrowleft" || k === "a") && dir.x === 0) { e.preventDefault(); nextDir = { x: -1, y: 0 }; }
          else if ((k === "arrowright" || k === "d") && dir.x === 0) { e.preventDefault(); nextDir = { x: 1, y: 0 }; }
        },
      };

      renderFrame();
      tickTimer = setInterval(tick, 140);
    });
  }

  // ---------------------------------------------------------------
  // global key dispatch
  // ---------------------------------------------------------------
  window.addEventListener("keydown", (e) => {
    TermAudio.unlock();
    if (mode === "nano") {
      handleNanoKey(e);
    } else if (mode === "game") {
      if (activeGame && activeGame.onKey) activeGame.onKey(e);
    } else {
      handleShellKey(e);
    }
  });

  window.addEventListener("resize", resize);

  async function loadFonts() {
    // Force the exact family/weight/size combo we render with to load
    // before we ever measure a character - otherwise measure() runs
    // against the generic "monospace" fallback and locks in the wrong
    // charWidth, which is what causes the cursor to drift off the text.
    if (!document.fonts) return; // very old browser - nothing we can do, falls back gracefully
    try {
      await Promise.all([
        document.fonts.load(`${FONT_WEIGHT} ${fontSize}px "JetBrains Mono"`),
        document.fonts.load(`${FONT_WEIGHT} ${fontSize}px "IBM Plex Mono"`),
        document.fonts.load(`${FONT_WEIGHT} ${fontSize}px "Space Mono"`),
      ]);
      await document.fonts.ready;
    } catch (e) {
      // font loading failed for some reason - proceed with whatever is available
    }
  }

  async function init() {
    await loadFonts();
    resize();
    startBlink();
    ensureRgbAnim();
    CRT.init(canvas);
  }

  return {
    init, print, printRich, printColumns, clear, sleep,
    typeLine, typeLines, readLine, nanoEdit,
    setTheme, getTheme, THEME_NAMES, DOT_HUES,
    setFontSize, adjustFontSize, setFontFamily, resetFont, getFontInfo,
    FONT_FAMILIES,
    runMatrix, runSnake,
    get cols() { return cols; },
    get rows() { return rows; },
  };
})();
