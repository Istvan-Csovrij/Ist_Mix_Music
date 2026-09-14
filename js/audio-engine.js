/**
 * Ist_Mix_Music - Core 4-Deck Web Audio Engine
 * Manages Master AudioContext, 4 Deck Busses (A, B, C, D), Mic Bus, Drums Bus, and Master Recording.
 */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.isUnlocked = false;
    this.bpm = 120;

    // Master Nodes
    this.masterGain = null;
    this.masterLimiter = null;
    this.recordDestination = null;

    // 4 Channel Busses
    this.deckBusses = {
      'deck-a': null,
      'deck-b': null,
      'deck-c': null,
      'deck-d': null
    };

    this.micGain = null;
    this.drumsGain = null;
    this.noiseBuffer = null;

    // Solo & Mute State Tracking
    this.soloDeckId = null; // null if no deck is soloed
    this.deckMutes = {
      'deck-a': false,
      'deck-b': false,
      'deck-c': false,
      'deck-d': false,
      'mic': false
    };

    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', () => {
        this.rebindAudioDevice();
      });
    }
  }

  init() {
    if (this.ctx) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

    this.ctx.onstatechange = () => {
      if (this.ctx && (this.ctx.state === 'suspended' || this.ctx.state === 'interrupted')) {
        this.ctx.resume();
      }
    };

    // Master Limiter to prevent clipping
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.0, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(0.0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(20.0, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.25, this.ctx.currentTime);

    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.9, this.ctx.currentTime);

    // Recording Bus
    this.recordDestination = this.ctx.createMediaStreamDestination();

    // Direct uncompressed routing to speakers + routing to limiter/recorder
    this.masterGain.connect(this.ctx.destination);
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.recordDestination);

    // 4 Deck Channels (A, B, C, D)
    ['deck-a', 'deck-b', 'deck-c', 'deck-d'].forEach((id) => {
      const gainNode = this.ctx.createGain();
      gainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
      gainNode.connect(this.masterGain);
      this.deckBusses[id] = gainNode;
    });

    // Mic Channel
    this.micGain = this.ctx.createGain();
    this.micGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.micGain.connect(this.masterGain);

    // Drums / Beatmaker Channel
    this.drumsGain = this.ctx.createGain();
    this.drumsGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
    this.drumsGain.connect(this.masterGain);

    this._createNoiseBuffer();
    this.isUnlocked = true;
  }

  unlockAudio() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setMasterVolume(val) {
    if (!this.masterGain || !this.ctx) return;
    const v = Math.max(0, Math.min(1.5, parseFloat(val)));
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  async rebindAudioDevice(deviceId = '') {
    if (!this.ctx) return;
    try {
      if (typeof this.ctx.setSinkId === 'function') {
        await this.ctx.setSinkId(deviceId);
        console.log('Audio Sink erfolgreich geändert zu:', deviceId || 'Standard');
      }
      if (this.ctx.state === 'running') {
        try { await this.ctx.suspend(); } catch (e) {}
      }
      await this.ctx.resume();
    } catch (e) {
      console.warn('rebindAudioDevice notice:', e);
    }
  }

  async setAudioOutputDevice(deviceId = '') {
    return this.rebindAudioDevice(deviceId);
  }

  toggleContinuousTestTone() {
    this.unlockAudio();
    const ctx = this.ctx;
    if (!ctx) return false;

    if (this.testOsc) {
      try {
        this.testOsc.stop();
        this.testOsc.disconnect();
      } catch (e) {}
      this.testOsc = null;
      if (this.testGain) {
        try { this.testGain.disconnect(); } catch (e) {}
        this.testGain = null;
      }
      return false; // Stopped
    }

    try {
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        ctx.resume();
      }
      this.testOsc = ctx.createOscillator();
      this.testGain = ctx.createGain();
      this.testOsc.type = 'sine';
      this.testOsc.frequency.setValueAtTime(440, ctx.currentTime);
      this.testGain.gain.setValueAtTime(0.4, ctx.currentTime);
      this.testOsc.connect(this.testGain);
      this.testGain.connect(ctx.destination);
      this.testOsc.start();
      return true; // Playing continuously
    } catch (e) {
      console.warn('Test tone error:', e);
      return false;
    }
  }

  async playTestTone() {
    return this.toggleContinuousTestTone();
  }

  playHtmlAudioBeep() {
    const sampleRate = 44100;
    const numSamples = Math.floor(sampleRate * 0.45);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(8, 'WAVEfmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, numSamples * 2, true);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const env = Math.max(0, 1.0 - i / numSamples);
      const s = Math.sin(2 * Math.PI * 440 * t) * env * 0.7;
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    const blob = new Blob([buffer], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.play().catch(() => {});
  }

  _createNoiseBuffer() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
  }

  setBpm(bpm) {
    this.bpm = Math.max(60, Math.min(200, bpm));
  }

  // Solo & Mute Manager
  setDeckSolo(deckId, active) {
    if (active) {
      this.soloDeckId = deckId;
    } else if (this.soloDeckId === deckId) {
      this.soloDeckId = null;
    }
    this.updateAllDeckGains();
  }

  setDeckMute(deckId, isMuted) {
    this.deckMutes[deckId] = isMuted;
    this.updateAllDeckGains();
  }

  updateAllDeckGains() {
    if (!window.decks) return;
    const ctx = this.ctx;
    if (!ctx) return;

    Object.keys(window.decks).forEach((deckId) => {
      const deck = window.decks[deckId];
      if (!deck || !deck.channelFaderGain) return;

      const isSoloed = (this.soloDeckId === deckId);
      const anySoloActive = (this.soloDeckId !== null);
      const isMuted = this.deckMutes[deckId];

      let effectiveGain = deck.userFaderVolume;

      if (isMuted) {
        effectiveGain = 0.0;
      } else if (anySoloActive && !isSoloed) {
        effectiveGain = 0.0; // Another deck is in Solo mode
      }

      deck.channelFaderGain.gain.setTargetAtTime(effectiveGain, ctx.currentTime, 0.02);
    });
  }

  // --- Realtime Synthesizers for Beatmaker / Drum Pads ---

  playKick(time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.35);

    gain.gain.setValueAtTime(1.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.drumsGain);

    osc.start(t);
    osc.stop(t + 0.45);
  }

  playSnare(time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    oscGain.gain.setValueAtTime(0.7, t);
    oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    osc.connect(oscGain);
    oscGain.connect(this.drumsGain);
    osc.start(t);
    osc.stop(t + 0.15);

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(1200, t);

      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.8, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.drumsGain);
      noise.start(t);
      noise.stop(t + 0.25);
    }
  }

  playHiHat(time = 0, open = false) {
    this.unlockAudio();
    if (!this.noiseBuffer) return;
    const t = time || this.ctx.currentTime;
    const dur = open ? 0.35 : 0.06;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(10000, t);
    filter.Q.setValueAtTime(3.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(open ? 0.6 : 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumsGain);

    noise.start(t);
    noise.stop(t + dur + 0.05);
  }

  playClap(time = 0) {
    this.unlockAudio();
    if (!this.noiseBuffer) return;
    const t = time || this.ctx.currentTime;

    [0, 0.012, 0.024, 0.036].forEach((offset) => {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1500, t + offset);

      const gain = this.ctx.createGain();
      const isLast = (offset === 0.036);
      gain.gain.setValueAtTime(0.6, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, t + offset + (isLast ? 0.25 : 0.02));

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.drumsGain);

      noise.start(t + offset);
      noise.stop(t + offset + (isLast ? 0.26 : 0.03));
    });
  }

  playBass(noteFreq = 55, time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(noteFreq, t);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, t);
    filter.frequency.exponentialRampToValueAtTime(90, t + 0.4);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumsGain);

    osc.start(t);
    osc.stop(t + 0.65);
  }

  playChord(chordFreqs = [261.63, 329.63, 392.00], time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;

    chordFreqs.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

      osc.connect(gain);
      gain.connect(this.drumsGain);

      osc.start(t);
      osc.stop(t + 0.75);
    });
  }

  playLead(freq = 523.25, time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.15);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1600, t);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumsGain);

    osc.start(t);
    osc.stop(t + 0.4);
  }

  playFx(time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.5);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

    osc.connect(gain);
    gain.connect(this.drumsGain);

    osc.start(t);
    osc.stop(t + 0.55);
  }

  // =========================================================================
  // ELECTRO HOUSE DJ EFFECTS & DROP TOOLS
  // =========================================================================

  playNoiseRiser(durationSec = 4.0) {
    this.unlockAudio();
    if (!this.noiseBuffer) return;
    const t = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    noise.loop = true;

    // Resonant Bandpass sweeping up
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.setValueAtTime(5.0, t);
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(11000, t + durationSec);

    // Volume crescendo
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.linearRampToValueAtTime(0.9, t + durationSec - 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + durationSec + 0.1);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + durationSec + 0.15);
  }

  playSubDrop() {
    this.unlockAudio();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Huge 808 sub impact: 180Hz down to 26Hz
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(26, t + 1.2);

    gain.gain.setValueAtTime(1.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 2.3);
  }

  playLaserSiren() {
    this.unlockAudio();
    const t = this.ctx.currentTime;

    // Siren tone modulated by LFO
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, t);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(6, t); // 6 Hz siren wobble
    lfoGain.gain.setValueAtTime(350, t);

    lfo.connect(osc.frequency);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

    osc.connect(gain);
    gain.connect(this.masterGain);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + 1.9);
    osc.stop(t + 1.9);
  }

  playAirHorn() {
    this.unlockAudio();
    const t = this.ctx.currentTime;
    // Classic 3-tone reggae / electro airhorn chords
    const freqs = [370, 466, 554];
    freqs.forEach((freq) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.setValueAtTime(freq * 1.03, t + 0.12); // pitch bend kick

      gain.gain.setValueAtTime(0.25, t);
      gain.gain.setValueAtTime(0.25, t + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + 0.6);
    });
  }

  toggleSidechainPump(active) {
    this.isPumping = active;
    if (!this.masterGain) return;
    const ctx = this.ctx;

    if (this.sidechainTimer) {
      clearInterval(this.sidechainTimer);
      this.sidechainTimer = null;
      this.masterGain.gain.setTargetAtTime(0.9, ctx.currentTime, 0.05);
    }

    if (active) {
      const bpm = this.bpm || 120;
      const quarterNoteMs = (60.0 / bpm) * 1000;
      const pump = () => {
        if (!this.isPumping) return;
        const now = ctx.currentTime;
        // Duck on beat, recover before next beat
        this.masterGain.gain.setValueAtTime(0.18, now);
        this.masterGain.gain.exponentialRampToValueAtTime(0.95, now + (quarterNoteMs / 1000) * 0.7);
      };
      pump();
      this.sidechainTimer = setInterval(pump, quarterNoteMs);
    }
  }

  toggleJetFlanger(active) {
    this.isFlanging = active;
    const ctx = this.ctx;
    if (!ctx) return;

    if (!this.flangerDelay) {
      this.flangerDelay = ctx.createDelay();
      this.flangerDelay.delayTime.value = 0.003;

      this.flangerFeedback = ctx.createGain();
      this.flangerFeedback.gain.value = 0.7;

      this.flangerLfo = ctx.createOscillator();
      this.flangerLfo.frequency.value = 0.3; // slow jet sweep
      this.flangerLfoGain = ctx.createGain();
      this.flangerLfoGain.gain.value = 0.0025;

      this.flangerLfo.connect(this.flangerLfoGain);
      this.flangerLfoGain.connect(this.flangerDelay.delayTime);

      this.flangerDelay.connect(this.flangerFeedback);
      this.flangerFeedback.connect(this.flangerDelay);

      this.flangerMix = ctx.createGain();
      this.flangerMix.gain.value = 0.0;

      this.masterGain.connect(this.flangerDelay);
      this.flangerDelay.connect(this.flangerMix);
      this.flangerMix.connect(this.masterLimiter);

      this.flangerLfo.start();
    }

    const t = ctx.currentTime;
    this.flangerMix.gain.setTargetAtTime(active ? 0.75 : 0.0, t, 0.05);
  }
}

// Global instance
window.audioEngine = new AudioEngine();
