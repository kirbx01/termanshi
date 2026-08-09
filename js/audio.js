const TermAudio = (() => {
  let ctx = null;
  let humOsc = null;
  let humGain = null;
  let unlocked = false;
  let volumeMultiplier = 1;
  
  
  function setVolume(level) {
    if (level < 0) level = 0;
    if (level > 1) level = 1; //max volume is 1.0
    volumeMultiplier = level;
    if (humGain) { 
      humGain.gain.value = 0.035 * volumeMultiplier;
    }
  }

  function ensureContext() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx.state === "suspended") {
      ctx.resume();
    }
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    ensureContext();
    startHum();
  }

  function startHum() {
    humOsc = ctx.createOscillator();
    humGain = ctx.createGain();
    humOsc.type = "sine";
    humOsc.frequency.value = 60; // mains-hum-esque low frequency
    humGain.gain.value = 0.035 * volumeMultiplier;
    humOsc.connect(humGain);
    humGain.connect(ctx.destination);
    humOsc.start();
  }

  function key() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1200 + Math.random() * 300, t);
    gain.gain.setValueAtTime(0.12 * volumeMultiplier, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.035);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  function enter() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(500, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.07);
    gain.gain.setValueAtTime(0.16 * volumeMultiplier, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  function tick() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(220, t);
    gain.gain.setValueAtTime(0.1 * volumeMultiplier, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  function getVolume() {
    return volumeMultiplier;
  }

  return { unlock, key, enter, tick, setVolume, getVolume };
})();

