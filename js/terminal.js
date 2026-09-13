
const Terminal = (() => {
  const canvas = document.getElementById("text-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });

  const BG = "#000000";
  const IS_FIREFOX = /Firefox\//.test(navigator.userAgent || "");
  const GLOW_BLUR = IS_FIREFOX ? 20 : 36;        

  const THEMES = {
    rgb:    { mode: "rgb" },
    pink:   { mode: "static", color: "#ffc1cc" },
    red:    { mode: "static", color: "#ff4d4d" },
    green:  { mode: "static", color: "#39ff6a" },
    amber:  { mode: "static", color: "#ffaa00" },
    cyan:   { mode: "static", color: "#4dffef" },
    purple: { mode: "static", color: "#c17cff" },
    white:  { mode: "static", color: "#f2f2f2" },
  };
  const THEME_NAMES = Object.keys(THEMES);
  let currentTheme = "amber";
  let rgbAnimTimer = null;

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
      rgbAnimTimer = setInterval(render, IS_FIREFOX ? 80 : 60);
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

  const FONT_FAMILIES = {
    xanh: '"Xanh Mono"',
  };
  const FONT_WEIGHT = 700;
  const DEFAULT_FONT_SIZE = 22;
  const MIN_FONT_SIZE = 14;
  const MAX_FONT_SIZE = 34;
  let currentFontKey = "xanh";
  let fontSize = DEFAULT_FONT_SIZE;
  let lineHeight = 32;
  let padLeft = 24;
  let padTop = 24;
  let charWidth = 0;
  let cols = 0, rows = 0;
  let dpr = 1;
  let fontMetrics = { ascent: 12, descent: 3, height: 15 };

  function fontStackFor(key) {
    const primary = FONT_FAMILIES[key] || FONT_FAMILIES.xanh;
    return `${primary}, "Xanh Mono", monospace`;
  }

  let lines = [];              
  const MAX_SCROLLBACK = 3000;
  let mode = "shell";          
  let activeGame = null;      

  let liveLine = null;         
  let inputReject = null;
  let currentHistory = null;
  let historyIndex = 0;
  let tabHandler = null;
  let suggestionsProvider = null;
  let suggestions = null;     // { items:[], spans:[{x0,x1,y0,y1}], extra:"" } drawn above the live line
  const terminalPane = document.getElementById("terminal-pane");

  let cursorVisible = true;
  let blinkTimer = null;

  let nano = null; 

  const CAT_CURSOR_FRAMES = ["js/assets/cat06_f0.png", "js/assets/cat06_f1.png"].map((src) => {
    const img = new Image();
    img.src = src;
    return img;
  });
  let catCursorFrameIndex = 0;

  function applyFont() {
    ctx.font = `${FONT_WEIGHT} ${fontSize}px ${fontStackFor(currentFontKey)}`;
    ctx.textBaseline = "alphabetic";
    ctx.textRendering = "geometricPrecision";
    ctx.fontKerning = "none";
  }

  function measure() {
    applyFont();
    const m = ctx.measureText("M");
    charWidth = Math.max(8, Math.round(m.width));
    const ascent = m.actualBoundingBoxAscent || fontSize * 0.8;
    const descent = m.actualBoundingBoxDescent || fontSize * 0.2;
    fontMetrics = {
      ascent: Math.max(8, Math.round(ascent)),
      descent: Math.max(2, Math.round(descent)),
      height: Math.max(10, Math.round(ascent + descent)),
    };
  }

  
  function setFontSize(px) {
    const clamped = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, Math.round(px)));
    const changed = clamped !== fontSize;
    fontSize = clamped;
    lineHeight = Math.round(fontSize * 1.45);
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
    currentFontKey = "xanh";
    setFontSize(DEFAULT_FONT_SIZE);
  }

  function getFontInfo() {
    return { family: currentFontKey, size: fontSize, min: MIN_FONT_SIZE, max: MAX_FONT_SIZE };
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, IS_FIREFOX ? 1.25 : 2);
    const w = (terminalPane && terminalPane.clientWidth) || window.innerWidth;
    const h = (terminalPane && terminalPane.clientHeight) || window.innerHeight;
    const padding = Math.max(12, Math.round(Math.min(w, h) * 0.03));
    padLeft = Math.min(32, padding);
    padTop = Math.min(28, Math.round(padding * 1.1));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    measure();
    cols = Math.max(24, Math.floor((w - padLeft * 2) / Math.max(8, charWidth)));
    rows = Math.max(8, Math.floor((h - padTop * 2) / Math.max(12, lineHeight)));
    render();
  }

  function wrapText(content, limit) {
    const text = String(content || "");
    if (!limit || limit <= 0) return [""];
    const lines = [];
    for (const rawLine of text.split("\n")) {
      if (!rawLine) {
        lines.push("");
        continue;
      }
      const words = rawLine.split(/(\s+)/).filter(Boolean);
      let current = "";
      for (const token of words) {
        if (/^\s+$/.test(token)) {
          if (current && current.length + token.length <= limit) {
            current += token;
          } else if (current) {
            lines.push(current);
            current = "";
          }
          continue;
        }
        if (!current) {
          if (token.length <= limit) {
            current = token;
          } else {
            let chunk = token;
            while (chunk.length > limit) {
              lines.push(chunk.slice(0, limit));
              chunk = chunk.slice(limit);
            }
            current = chunk;
          }
          continue;
        }
        if (current.length + 1 + token.length <= limit) {
          current += ` ${token}`;
        } else {
          lines.push(current);
          current = token.length <= limit ? token : token.slice(0, limit);
        }
      }
      if (current) lines.push(current);
    }
    return lines;
  }

  function drawTextRow(content, rowIndex) {
    const baseY = Math.round(padTop + rowIndex * lineHeight + fontMetrics.ascent + 2);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    if (Array.isArray(content)) {
      let x = padLeft;
      for (const seg of content) {
        const c = seg.color || (seg.hue !== undefined ? hslColor(seg.hue) : baseColor());
        ctx.shadowColor = c;
        ctx.shadowBlur = GLOW_BLUR;
        ctx.fillStyle = c;
        ctx.fillText(seg.text, Math.round(x), baseY);
        const w = ctx.measureText(seg.text).width;
        if (seg.click) {
          ctx.strokeStyle = c;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(x), Math.round(baseY + 2));
          ctx.lineTo(Math.round(x + w), Math.round(baseY + 2));
          ctx.stroke();
          const rowY0 = padTop + rowIndex * lineHeight;
          const rowY1 = padTop + (rowIndex + 1) * lineHeight;
          const wx0 = padLeft - lineHeight * 0.5;
          const wx1 = padLeft + (Math.max(cols, 1)) * charWidth + lineHeight * 0.5;
          const p0 = warpPoint(wx0, rowY0);
          const p1 = warpPoint(wx1, rowY0);
          const p2 = warpPoint(wx0, rowY1);
          const p3 = warpPoint(wx1, rowY1);
          clickRegions.push({
            box: {
              x0: Math.min(p0.x, p1.x, p2.x, p3.x),
              x1: Math.max(p0.x, p1.x, p2.x, p3.x),
              y0: Math.min(p0.y, p1.y, p2.y, p3.y),
              y1: Math.max(p0.y, p1.y, p2.y, p3.y),
            },
            cmd: seg.cmd || "",
          });
        }
        x += w;
      }
      return;
    }

    const c = baseColor();
    ctx.shadowColor = c;
    ctx.shadowBlur = GLOW_BLUR;
    ctx.fillStyle = c;
    ctx.fillText(String(content), Math.round(padLeft), baseY);
  }

  function getCursorX(text, colIndex) {
    const safeText = String(text || "");
    const safeCol = Math.max(0, Math.min(safeText.length, colIndex || 0));
    return Math.round(padLeft + ctx.measureText(safeText.slice(0, safeCol)).width);
  }

  function drawCursorBlock(text, colIndex, rowIndex) {
    if (!cursorVisible) return;
    const x = getCursorX(text, colIndex);
    const frame = CAT_CURSOR_FRAMES[catCursorFrameIndex];
    const hasCat = frame && frame.complete && frame.naturalWidth > 0;
    const c = baseColor();

    if (hasCat) {
      const size = lineHeight;
      const catY = Math.round(padTop + rowIndex * lineHeight + (lineHeight - size) / 2);
      ctx.save();
      ctx.shadowColor = c;
      ctx.shadowBlur = GLOW_BLUR;
      ctx.drawImage(frame, x, catY, size, size);
      ctx.restore();
    } else {
      const cursorHeight = Math.max(2, Math.round(lineHeight - 4));
      const y = Math.round(padTop + rowIndex * lineHeight + (lineHeight - cursorHeight) / 2);
      ctx.shadowColor = c;
      ctx.shadowBlur = GLOW_BLUR;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, Math.max(2, Math.round(charWidth * 0.7)), cursorHeight);
    }
  }

  function userInputActive() {
    const login = document.getElementById("login-screen");
    return !login || login.classList.contains("done");
  }

  // Inverse of the CRT barrel warp (effects.js): where a source-pane point
  // lands on the visible screen, so taps/renders stay aligned under the glow.
  function warpPoint(x, y) {
    const w = (terminalPane && terminalPane.clientWidth) || window.innerWidth;
    const h = (terminalPane && terminalPane.clientHeight) || window.innerHeight;
    let cx = (x / Math.max(w, 1)) * 2 - 1;
    let cy = (y / Math.max(h, 1)) * 2 - 1;
    const aspect = w / Math.max(h, 1);
    const portrait = aspect <= 1 ? 1 : 0;
    const verticalBias = portrait ? 0.12 : 0.07;
    const horizontalBias = portrait ? 0.03 : 0.06;
    const r2 = cx * cx + cy * cy;
    const curve = 1 + verticalBias * r2 + horizontalBias * (cx * cx - cy * cy) * 0.4;
    cx /= curve;
    cy /= curve;
    return { x: (cx * 0.5 + 0.5) * w, y: (cy * 0.5 + 0.5) * h };
  }

  function buildSuggestions(typed) {
    const list = suggestionsProvider ? suggestionsProvider(typed) : [];
    if (!list || !list.length) return null;
    const avail = Math.max(12, cols - 1);
    const items = [];
    const parts = [];
    let width = 0;
    let truncated = false;
    for (const item of list) {
      const gap = parts.length ? 3 : 0;
      if (width + gap + item.length > avail) {
        truncated = true;
        break;
      }
      parts.push(item);
      items.push(item);
      width += gap + item.length;
    }
    if (!items.length) return null;
    return { items, extra: truncated ? "…" : null };
  }

  function drawSuggestionsRow(suggestion, rowIndex) {
    const c = baseColor();
    ctx.shadowColor = c;
    ctx.shadowBlur = GLOW_BLUR;
    ctx.fillStyle = c;
    const baseY = Math.round(padTop + rowIndex * lineHeight + fontMetrics.ascent + 2);
    const rowY0 = padTop + rowIndex * lineHeight;
    const rowY1 = padTop + (rowIndex + 1) * lineHeight;
    const gap = ctx.measureText(" ").width * 3;
    const spans = [];
    let x = padLeft;
    for (let i = 0; i < suggestion.items.length; i++) {
      const seg = suggestion.items[i];
      const w = ctx.measureText(seg).width;
      ctx.fillText(seg, Math.round(x), baseY);
      ctx.strokeStyle = c;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x), Math.round(baseY + 2));
      ctx.lineTo(Math.round(x + w), Math.round(baseY + 2));
      ctx.stroke();
      const p0 = warpPoint(x, rowY0);
      const p1 = warpPoint(x + w, rowY0);
      const p2 = warpPoint(x, rowY1);
      const p3 = warpPoint(x + w, rowY1);
      spans.push({
        dsp: {
          x0: Math.min(p0.x, p1.x, p2.x, p3.x),
          x1: Math.max(p0.x, p1.x, p2.x, p3.x),
          y0: Math.min(p0.y, p1.y, p2.y, p3.y),
          y1: Math.max(p0.y, p1.y, p2.y, p3.y),
        },
        text: seg,
      });
      x += w + gap;
    }
    if (suggestion.extra) {
      ctx.globalAlpha = 0.8;
      ctx.fillText(suggestion.extra, Math.round(x), baseY);
      ctx.globalAlpha = 1;
    }
    suggestion.spans = spans;
  }

  function tryRunSuggestion(event) {
    if (!suggestions || !liveLine || !suggestions.spans || mode !== "shell") return false;
    if (!terminalPane) return false;
    const rect = terminalPane.getBoundingClientRect();
    const dx = event.clientX - rect.left;
    const dy = event.clientY - rect.top;
    for (const span of suggestions.spans) {
      if (!span.dsp) continue;
      const rx0 = span.dsp.x0 - 5;
      const rx1 = span.dsp.x1 + 5;
      const ry0 = span.dsp.y0 - 4;
      const ry1 = span.dsp.y1 + 4;
      if (dx >= rx0 && dx <= rx1 && dy >= ry0 && dy <= ry1) {
        const parts = liveLine.typed.split(" ");
        parts[parts.length - 1] = span.text;
        liveLine.typed = parts.join(" ");
        liveLine.cursor = liveLine.typed.length;
        suggestions = null;
        finalizeLine();
        return true;
      }
    }
    return false;
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
      return;
    }

    const displayLines = lines.slice();
    let sugIndex = -1;
    if (liveLine && mode === "shell" && suggestionsProvider) {
      const built = buildSuggestions(liveLine.typed);
      if (built && built.items.length) {
        sugIndex = displayLines.length;
        displayLines.push("");
        suggestions = built;
      } else {
        suggestions = null;
      }
    }
    if (liveLine) {
      const shown = liveLine.mask
        ? liveLine.prefix + liveLine.mask.repeat(liveLine.typed.length)
        : liveLine.prefix + liveLine.typed;
      displayLines.push(shown);
    }

    const visible = displayLines.slice(-rows);
    const startRow = 0;
    let sugRowIndex = -1;
    resetClickRegions();
    if (sugIndex !== -1) sugRowIndex = sugIndex - (displayLines.length - visible.length);
    for (let i = 0; i < visible.length; i++) {
      if (suggestions && i === sugRowIndex) {
        drawSuggestionsRow(suggestions, i);
      } else {
        drawTextRow(visible[i], startRow + i);
      }
    }

    if (liveLine) {
      const lastRow = startRow + visible.length - 1;
      const col = liveLine.prefix.length + liveLine.cursor;
      drawCursorBlock(visible[lastRow], col, lastRow);
    }
  }

  function renderNano() {
    const bufLines = nano.buffer.split("\n");
    const header = ` GNU nano   ${nano.filename}`;
    drawTextRow(header, 0);

    const bodyRows = rows - 2;
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
    drawCursorBlock(visible[curLine - scrollTop] || "", curCol, 1 + (curLine - scrollTop));

    const footer = " ^X Exit    ^O Save    (read-only preview editor)";
    drawTextRow(footer, rows - 1);
  }

  function startBlink() {
    if (blinkTimer) return;
    blinkTimer = setInterval(() => {
      cursorVisible = !cursorVisible;
      catCursorFrameIndex = (catCursorFrameIndex + 1) % CAT_CURSOR_FRAMES.length;
      render();
    }, 500);
  }

  function print(text) {
    const parts = String(text).split("\n");
    for (const p of parts) {
      const wrapped = wrapText(p, cols || 80);
      for (const line of wrapped) lines.push(line);
    }
    if (lines.length > MAX_SCROLLBACK) lines = lines.slice(-MAX_SCROLLBACK);
    render();
  }

  function printRich(segments) {
    lines.push(segments);
    if (lines.length > MAX_SCROLLBACK) lines = lines.slice(-MAX_SCROLLBACK);
    render();
  }

  // Clickable-entry tracking. Rich segments flagged with `click: true` become
  // tappable: while they're visible on screen, a tap on their bounds runs the
  // stored shell command through the normal prompt loop (so it echoes as typed).
  const clickRegions = [];

  function printClickable({ label, cmd, hint }) {
    const entry = [];
    if (hint) entry.push({ text: String(hint) + " " });
    entry.push({ text: label, click: true, cmd: cmd || "" });
    printRich(entry);
  }

  function resetClickRegions() {
    clickRegions.length = 0;
  }

  function runClickAction(clientX, clientY) {
    if (!terminalPane) return false;
    const rect = terminalPane.getBoundingClientRect();
    const dx = clientX - rect.left;
    const dy = clientY - rect.top;
    for (let i = clickRegions.length - 1; i >= 0; i--) {
      const reg = clickRegions[i];
      const pad = 4;
      if (dx >= reg.box.x0 - pad && dx <= reg.box.x1 + pad &&
          dy >= reg.box.y0 - pad && dy <= reg.box.y1 + pad) {
        if (reg.cmd) runCommand(reg.cmd);
        return true;
      }
    }
    return false;
  }

  // Feed a command through the running shell loop as if it had been typed.
  // If a prompt is waiting, it resolves with the command so boot re-executes
  // it and re-prints the prompt afterwards.
  function runCommand(cmd) {
    cmd = String(cmd || "").trim();
    if (cmd === "") return;
    if (liveLine) {
      lines.push(liveLine.prefix + cmd);
      liveLine = null;
      tabHandler = null;
      suggestionsProvider = null;
      suggestions = null;
      currentHistory = null;
      const resolve = inputResolver;
      inputResolver = null;
      inputReject = null;
      const hidden = document.getElementById("hidden-input");
      if (hidden) hidden.value = "";
      render();
      if (resolve) resolve(cmd);
      return;
    }
    if (window.Shell && Shell.execute) Shell.execute(cmd);
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

  function readLine({ prefix = "", mask = null, history = null, onTab = null, onSuggest = null } = {}) {
    return new Promise((resolve, reject) => {
      liveLine = { prefix, typed: "", cursor: 0, mask };
      currentHistory = history;
      historyIndex = history ? history.length : 0;
      tabHandler = onTab;
      suggestionsProvider = onSuggest;
      suggestions = null;
      inputResolver = resolve;
      inputReject = reject;
      render();
      const hiddenInput = document.getElementById("hidden-input");
      if (hiddenInput) {
        hiddenInput.value = "";
        hiddenInput.focus({ preventScroll: true });
      }
    });
  }

  function finalizeLine() {
    const l = liveLine;
    const shown = l.mask ? l.prefix + l.mask.repeat(l.typed.length) : l.prefix + l.typed;
    lines.push(shown);
    liveLine = null;
    const typed = l.typed;
    tabHandler = null;
    suggestionsProvider = null;
    suggestions = null;
    currentHistory = null;
    const resolve = inputResolver;
    inputResolver = null;
    inputReject = null;
    render();
    const hiddenInput = document.getElementById("hidden-input");
    if (hiddenInput) hiddenInput.value = "";
    if (resolve) resolve(typed);
  }

  function insertText(text) {
    if (!liveLine) return;
    const l = liveLine;
    l.typed = l.typed.slice(0, l.cursor) + text + l.typed.slice(l.cursor);
    l.cursor += text.length;
    TermAudio.key();
    render();
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
      insertText(e.key);
    }
  }

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
      return; 
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

  function runTicTacToe() {
    return new Promise((resolve) => {
      activeGame = null;
      mode = "game";
      const board = Array(9).fill(null);
      let currentPlayer = "X";
      let winner = null;
      let over = false;
      let settled = false;
      let raf = null;
      let alive = true;

      function checkWinner(cells) {
        const wins = [
          [0, 1, 2], [3, 4, 5], [6, 7, 8],
          [0, 3, 6], [1, 4, 7], [2, 5, 8],
          [0, 4, 8], [2, 4, 6],
        ];
        return wins.find(combo => combo.every(i => cells[i] && cells[i] === cells[combo[0]]))?.map(i => cells[i])[0] || null;
      }

      function renderFrame() {
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();
        applyFont();

        drawTextRow(" TIC TAC TOE   1-9 to play, q to quit", 0);
        drawTextRow("+---+---+---+", 2);
        for (let row = 0; row < 3; row++) {
          const cells = board.slice(row * 3, row * 3 + 3);
          const line = `| ${cells.map(cell => cell || " ").join(" | ")} |`;
          drawTextRow(line, 3 + row * 2);
          if (row < 2) drawTextRow("+---+---+---+", 4 + row * 2);
        }
        drawTextRow("+---+---+---+", 8);

        let status = over
          ? winner
            ? `Winner: ${winner} — press any key to exit`
            : "Tie! — press any key to exit"
          : `Turn: ${currentPlayer} — pick a square`;
        drawTextRow(status, 10);
      }

      function cleanup(exitMessage) {
        if (settled) return;
        settled = true;
        alive = false;
        if (raf) cancelAnimationFrame(raf);
        activeGame = null;
        mode = "shell";
        render();
        resolve(exitMessage);
      }

      function frame() {
        if (!alive) return;
        renderFrame();
        raf = requestAnimationFrame(frame);
      }

      activeGame = {
        onKey(e) {
          const k = e.key.toLowerCase();
          if (settled) return;
          if (over) { e.preventDefault(); e.stopPropagation(); cleanup("Thanks for playing tic-tac-toe."); return; }
          if (k === "q") { e.preventDefault(); e.stopPropagation(); cleanup("You quit tic-tac-toe."); return; }

          const index = Number.parseInt(k, 10) - 1;
          if (!Number.isInteger(index) || index < 0 || index > 8) return;

          if (board[index] !== null) return;
          e.preventDefault();
          e.stopPropagation();
          board[index] = currentPlayer;
          winner = checkWinner(board);
          if (winner) {
            over = true;
            renderFrame();
            return;
          }
          if (board.every(Boolean)) {
            over = true;
            renderFrame();
            return;
          }
          currentPlayer = currentPlayer === "X" ? "O" : "X";
          renderFrame();
        },
      };

      frame();
    });
  }

  const hiddenInput = document.getElementById("hidden-input");
  const screenElement = document.getElementById("screen");

  function focusHiddenInput() {
    if (hiddenInput) {
      hiddenInput.focus({ preventScroll: true });
    }
  }

  hiddenInput?.addEventListener("input", () => {
    if (!hiddenInput) return;
    const value = hiddenInput.value;
    if (!value) return;
    hiddenInput.value = "";
    if (!liveLine) return;
    insertText(value.replace(/\r?\n/g, ""));
  });

  hiddenInput?.addEventListener("keydown", (e) => {
    if (!liveLine) return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopImmediatePropagation();
      TermAudio.enter();
      finalizeLine();
      return;
    }
    if (e.key === "Backspace") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (liveLine.cursor > 0) {
        liveLine.typed = liveLine.typed.slice(0, liveLine.cursor - 1) + liveLine.typed.slice(liveLine.cursor);
        liveLine.cursor--;
        TermAudio.tick();
        render();
      }
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (tabHandler) {
        const completed = tabHandler(liveLine.typed);
        if (typeof completed === "string") {
          liveLine.typed = completed;
          liveLine.cursor = liveLine.typed.length;
          render();
        }
      }
      return;
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      e.stopImmediatePropagation();
      liveLine.cursor = Math.max(0, liveLine.cursor - 1);
      render();
      return;
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      e.stopImmediatePropagation();
      liveLine.cursor = Math.min(liveLine.typed.length, liveLine.cursor + 1);
      render();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (currentHistory && currentHistory.length) {
        historyIndex = Math.max(0, historyIndex - 1);
        liveLine.typed = currentHistory[historyIndex] || "";
        liveLine.cursor = liveLine.typed.length;
        render();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (currentHistory && currentHistory.length) {
        historyIndex = Math.min(currentHistory.length, historyIndex + 1);
        liveLine.typed = currentHistory[historyIndex] || "";
        liveLine.cursor = liveLine.typed.length;
        render();
      }
      return;
    }
  });

  window.addEventListener("keydown", (e) => {
    if (e.target === hiddenInput && mode === "shell") return;
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
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resize);
    window.visualViewport.addEventListener("scroll", resize);
  }
  let suppressFocus = false;
  document.addEventListener("pointerdown", (event) => {
    if (!userInputActive()) return;
    if (runClickAction(event.clientX, event.clientY)) {
      suppressFocus = true;
      return;
    }
    if (event.target instanceof HTMLElement && event.target.closest("button, input")) return;
    focusHiddenInput();
  });
  window.addEventListener("pointerdown", (event) => {
    if (!userInputActive()) return;
    if (suppressFocus) {
      suppressFocus = false;
      return;
    }
    if (tryRunSuggestion(event)) return;
    focusHiddenInput();
  }, { passive: true });

  async function loadFonts() {
    if (!document.fonts) return; 
    try {
      await Promise.all([
        document.fonts.load(`${FONT_WEIGHT} ${fontSize}px "Xanh Mono"`),
        document.fonts.load(`400 ${fontSize}px "Jacquard 12"`),
      ]);
      await document.fonts.ready;
    } catch (e) {       
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
    printClickable, runCommand,
    focusInput: focusHiddenInput,
    setTheme, getTheme, THEME_NAMES, DOT_HUES,
    setFontSize, adjustFontSize, setFontFamily, resetFont, getFontInfo,
    FONT_FAMILIES,
    runMatrix, runTicTacToe,
    get cols() { return cols; },
    get rows() { return rows; },
    getSuggestionSpans: () => (suggestions && suggestions.spans
      ? suggestions.spans.map((s) => ({ text: s.text, dsp: s.dsp ? { ...s.dsp } : null }))
      : []),
  };
})();
