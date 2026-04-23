// Sound effects using Web Audio API (synthetic — no external files).
// Call SFX.unlock() on first user gesture to enable audio.
(function(){
  let ctx = null;
  let unlocked = false;
  let lobbyTimer = null;

  function getCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ctx = new AC();
    }
    return ctx;
  }

  function unlock() {
    const c = getCtx();
    if (!c) return;
    if (c.state === 'suspended') c.resume();
    unlocked = true;
  }

  // One tone, envelope shaped.
  function tone(freq, dur, { type='sine', gain=0.2, attack=0.01, release=0.1, startAt=0 } = {}) {
    const c = getCtx(); if (!c) return;
    const t0 = c.currentTime + startAt;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Frequency sweep (swoop).
  function sweep(fromFreq, toFreq, dur, { type='sawtooth', gain=0.15, startAt=0 } = {}) {
    const c = getCtx(); if (!c) return;
    const t0 = c.currentTime + startAt;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Short noise burst (for buzzer).
  function noise(dur, { gain=0.15, lowpass=800, startAt=0 } = {}) {
    const c = getCtx(); if (!c) return;
    const t0 = c.currentTime + startAt;
    const bufferSize = Math.floor(c.sampleRate * dur);
    const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
    const src = c.createBufferSource();
    src.buffer = buffer;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(filter).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // ---------- public sounds ----------
  function tick()      { tone(800, 0.06, { type:'square', gain:0.08 }); }
  function tickUrgent(){ tone(1200, 0.08, { type:'square', gain:0.14 }); }

  function correct() {
    // Two-note rising arpeggio
    tone(659, 0.12, { type:'triangle', gain:0.25, startAt:0    }); // E5
    tone(880, 0.22, { type:'triangle', gain:0.25, startAt:0.1 }); // A5
    tone(1319,0.3,  { type:'triangle', gain:0.2,  startAt:0.22 }); // E6
  }

  function wrong() {
    sweep(440, 120, 0.35, { type:'sawtooth', gain:0.2 });
    noise(0.2, { gain:0.12, lowpass:500, startAt:0.05 });
  }

  function reveal() {
    // Drum-roll-ish rise then sting
    noise(0.6, { gain:0.12, lowpass:2000 });
    tone(523, 0.15, { type:'square', gain:0.2, startAt:0.6 });
    tone(659, 0.15, { type:'square', gain:0.2, startAt:0.7 });
    tone(784, 0.3,  { type:'square', gain:0.25, startAt:0.8 });
  }

  function questionStart() {
    tone(523, 0.1, { type:'sine', gain:0.18, startAt:0 });
    tone(784, 0.1, { type:'sine', gain:0.18, startAt:0.1 });
    tone(1047,0.2, { type:'sine', gain:0.2,  startAt:0.2 });
  }

  function timeout() {
    sweep(600, 80, 0.6, { type:'sine', gain:0.22 });
  }

  function join() {
    tone(880, 0.08, { type:'triangle', gain:0.15, startAt:0 });
    tone(1174,0.12, { type:'triangle', gain:0.18, startAt:0.08 });
  }

  function fanfare() {
    // Simple celebratory fanfare: C-E-G-C-G-C
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => tone(f, 0.2, { type:'triangle', gain:0.22, startAt: i*0.15 }));
    tone(1319, 0.6, { type:'triangle', gain:0.25, startAt:0.6 });
    // sparkle
    for (let i=0; i<8; i++) {
      tone(2000 + Math.random()*1500, 0.05, { type:'sine', gain:0.08, startAt: 0.6 + i*0.08 });
    }
  }

  // Gentle looping "lobby" pad (two pleasant chord tones, slow pulse).
  function lobbyLoopStart() {
    if (lobbyTimer) return;
    const c = getCtx(); if (!c) return;
    let i = 0;
    const chord1 = [523, 659, 784];   // C major
    const chord2 = [440, 554, 659];   // A minor
    const chord3 = [494, 587, 740];   // B
    const chord4 = [392, 494, 587];   // G
    const chords = [chord1, chord2, chord4, chord3];
    const play = () => {
      const ch = chords[i % chords.length];
      i++;
      ch.forEach(f => tone(f, 1.5, { type:'sine', gain:0.04, attack:0.3, release:0.8 }));
    };
    play();
    lobbyTimer = setInterval(play, 1500);
  }
  function lobbyLoopStop() {
    if (lobbyTimer) { clearInterval(lobbyTimer); lobbyTimer = null; }
  }

  window.SFX = {
    unlock, tick, tickUrgent, correct, wrong, reveal,
    questionStart, timeout, join, fanfare,
    lobbyLoopStart, lobbyLoopStop
  };
})();
