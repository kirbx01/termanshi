/* ================================================================
   EFFECTS.JS
   The WebGL CRT compositor. text-canvas (a plain 2D canvas full of
   crisp glowing text) is sampled as a texture and pushed through a
   fragment shader that applies:

     - convex barrel distortion (curved glass geometry)
     - vignette
     - RGB chromatic aberration
     - phosphor mask / aperture grille
     - scanlines
     - subtle animated noise
     - brightness flicker
     - horizontal VHS-style sync glitch every 10-20s
     - subtle vertical raster drift

   All effects are tuned to stay subtle and never hurt readability.
   Text glow itself is NOT generated here - it is static (constant
   shadowBlur) canvas glow baked into text-canvas by terminal.js.
================================================================ */

const CRT = (() => {
  const canvas = document.getElementById("crt-canvas");
  const gl = canvas.getContext("webgl", { antialias: true, alpha: false });

  if (!gl) {
    console.warn("WebGL unavailable - CRT effect disabled.");
    return { init() {}, resize() {} };
  }

  const VERT_SRC = `
    attribute vec2 aPos;
    varying vec2 vUv;
    void main() {
      vUv = aPos * 0.5 + 0.5;
      gl_Position = vec4(aPos, 0.0, 1.0);
    }
  `;

  const FRAG_SRC = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uTex;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uGlitch;      // 0..1 intensity of an active sync glitch
    uniform float uGlitchSeed;  // per-glitch random seed

    // cheap hash-based pseudo-random
    float rand(vec2 co) {
      return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;

      // ---- convex barrel distortion ----
      vec2 cc = uv * 2.0 - 1.0;
      float r2 = dot(cc, cc);
      float distortion = 0.10;
      cc *= (1.0 + distortion * r2);
      uv = cc * 0.5 + 0.5;

      // ---- subtle vertical raster drift ----
      uv.y += sin(uTime * 0.35) * 0.0009;

      // ---- horizontal VHS sync glitch (brief, occasional) ----
      float glitchBand = step(0.5, fract(sin((uv.y + uGlitchSeed) * 90.0) * 4000.0));
      float glitchShift = uGlitch * glitchBand * 0.02 * sin(uGlitchSeed * 50.0);
      uv.x += glitchShift;

      // outside the curved glass -> pure black bezel
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }

      // ---- RGB chromatic aberration ----
      float aberration = 0.0016 + uGlitch * 0.004;
      vec2 dir = normalize(cc + 0.0001);
      float r = texture2D(uTex, uv - dir * aberration).r;
      float g = texture2D(uTex, uv).g;
      float b = texture2D(uTex, uv + dir * aberration).b;
      vec3 color = vec3(r, g, b);

      // ---- scanlines ----
      float scan = 0.94 + 0.06 * sin(uv.y * uResolution.y * 3.14159 * 1.0);
      color *= scan;

      // ---- phosphor mask / aperture grille ----
      float col = mod(gl_FragCoord.x, 3.0);
      float mask = 0.92;
      if (col < 1.0) mask = 1.0;
      color *= mix(0.90, 1.0, mask);

      // ---- vignette ----
      float vig = smoothstep(1.15, 0.35, length(cc));
      color *= mix(0.55, 1.0, vig);

      // ---- subtle animated noise ----
      float n = (rand(uv * uResolution.xy + uTime * 60.0) - 0.5) * 0.035;
      color += n;

      // ---- brightness flicker ----
      float flicker = 1.0
        + 0.015 * sin(uTime * 8.0)
        + 0.01 * (rand(vec2(uTime * 0.5, 1.0)) - 0.5);
      color *= flicker;

      // brief brightening pulse during a sync glitch
      color += vec3(uGlitch * glitchBand * 0.06);

      gl_FragColor = vec4(color, 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT_SRC));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG_SRC));
  gl.linkProgram(program);
  gl.useProgram(program);

  // full-screen quad
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, "aPos");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTex = gl.getUniformLocation(program, "uTex");
  const uTime = gl.getUniformLocation(program, "uTime");
  const uResolution = gl.getUniformLocation(program, "uResolution");
  const uGlitch = gl.getUniformLocation(program, "uGlitch");
  const uGlitchSeed = gl.getUniformLocation(program, "uGlitchSeed");

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  let sourceCanvas = null;
  let startTime = performance.now();

  // glitch scheduling: fires roughly every 10-20 seconds, per spec
  let nextGlitchAt = performance.now() + (10000 + Math.random() * 10000);
  let glitchActiveUntil = 0;
  let glitchSeed = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    gl.viewport(0, 0, canvas.width, canvas.height);
  }

  function init(textCanvas) {
    sourceCanvas = textCanvas;
    resize();
    window.addEventListener("resize", resize);
    requestAnimationFrame(loop);
  }

  function loop(now) {
    const t = (now - startTime) / 1000;

    // schedule / run the periodic sync glitch
    if (now > nextGlitchAt && now > glitchActiveUntil) {
      glitchActiveUntil = now + 120 + Math.random() * 160; // brief, ~120-280ms
      glitchSeed = Math.random() * 100.0;
      nextGlitchAt = now + 10000 + Math.random() * 10000;
    }
    const glitchIntensity = now < glitchActiveUntil ? 1.0 : 0.0;

    gl.bindTexture(gl.TEXTURE_2D, texture);
    if (sourceCanvas) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sourceCanvas);
    }

    gl.useProgram(program);
    gl.uniform1i(uTex, 0);
    gl.uniform1f(uTime, t);
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uGlitch, glitchIntensity);
    gl.uniform1f(uGlitchSeed, glitchSeed);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    requestAnimationFrame(loop);
  }

  return { init, resize };
})();
