/**
 * Ist_Mix_Musik - Core 4-Deck Web Audio Engine
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
  }

  init() {
    if (this.ctx) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();

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

    // Routing: MasterGain -> Limiter -> Destination & Recorder
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.ctx.destination);
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
}

// Global instance
window.audioEngine = new AudioEngine();
