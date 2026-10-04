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
    this.drumsRecordDest = null;
    this.samplerGain = null;
    this.synthGain = null;
    this.synthRecordDest = null;
    this.noiseBuffer = null;

    // Master Stereo Analysers for dual L/R VU-Meter
    this.masterSplitter = null;
    this.masterAnalyserL = null;
    this.masterAnalyserR = null;

    // Channel Echo & Beat-Delay FX
    this.deckEchoes = {
      'deck-a': null,
      'deck-b': null,
      'deck-c': null,
      'deck-d': null
    };

    // Tap-Tempo tracking
    this.tapTimes = [];

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

    // Master Limiter to prevent clipping and Windows WASAPI auto-ducking
    this.masterLimiter = this.ctx.createDynamicsCompressor();
    this.masterLimiter.threshold.setValueAtTime(-1.5, this.ctx.currentTime);
    this.masterLimiter.knee.setValueAtTime(6.0, this.ctx.currentTime);
    this.masterLimiter.ratio.setValueAtTime(16.0, this.ctx.currentTime);
    this.masterLimiter.attack.setValueAtTime(0.003, this.ctx.currentTime);
    this.masterLimiter.release.setValueAtTime(0.08, this.ctx.currentTime);

    // Master Gain (calibrated for multi-deck summing headroom)
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.85, this.ctx.currentTime);

    // Recording Bus
    this.recordDestination = this.ctx.createMediaStreamDestination();

    // Master Limiter chain: masterGain -> masterLimiter -> speakers + recording
    this.masterGain.connect(this.masterLimiter);
    this.masterLimiter.connect(this.ctx.destination);
    this.masterLimiter.connect(this.recordDestination);

    // Master Stereo Analysers for dual L/R VU-Meter (connected after limiter)
    this.masterSplitter = this.ctx.createChannelSplitter(2);
    this.masterAnalyserL = this.ctx.createAnalyser();
    this.masterAnalyserR = this.ctx.createAnalyser();
    this.masterAnalyserL.fftSize = 128;
    this.masterAnalyserR.fftSize = 128;
    this.masterAnalyserL.smoothingTimeConstant = 0.7;
    this.masterAnalyserR.smoothingTimeConstant = 0.7;

    this.masterLimiter.connect(this.masterSplitter);
    this.masterSplitter.connect(this.masterAnalyserL, 0);
    this.masterSplitter.connect(this.masterAnalyserR, 1);

    // 4 Deck Channels (A, B, C, D) with Beat-Synced Echo/Delay Circuit
    ['deck-a', 'deck-b', 'deck-c', 'deck-d'].forEach((id) => {
      const inGain = this.ctx.createGain();
      inGain.gain.setValueAtTime(1.0, this.ctx.currentTime);

      // Direct Dry Path to master with calibrated summing headroom
      const dryGain = this.ctx.createGain();
      dryGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      inGain.connect(dryGain);
      dryGain.connect(this.masterGain);

      // Wet Delay / Echo Path
      const delayNode = this.ctx.createDelay(2.5);
      const bpm = this.bpm || 120;
      const delayTime = (60 / bpm) * 0.75; // 3/4 beat club delay
      delayNode.delayTime.setValueAtTime(delayTime, this.ctx.currentTime);

      const feedbackGain = this.ctx.createGain();
      feedbackGain.gain.setValueAtTime(0.4, this.ctx.currentTime);

      const wetGain = this.ctx.createGain();
      wetGain.gain.setValueAtTime(0.0, this.ctx.currentTime); // initially 0% wet

      const echoFilter = this.ctx.createBiquadFilter();
      echoFilter.type = 'lowpass';
      echoFilter.frequency.setValueAtTime(3200, this.ctx.currentTime);

      inGain.connect(delayNode);
      delayNode.connect(echoFilter);
      echoFilter.connect(feedbackGain);
      feedbackGain.connect(delayNode);
      echoFilter.connect(wetGain);
      wetGain.connect(this.masterGain);

      this.deckBusses[id] = inGain;
      this.deckEchoes[id] = {
        delay: delayNode,
        feedback: feedbackGain,
        wetGain: wetGain,
        dryGain: dryGain
      };
    });

    // Mic Channel
    this.micGain = this.ctx.createGain();
    this.micGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.micGain.connect(this.masterGain);

    // Drums / Beatmaker Channel
    this.drumsGain = this.ctx.createGain();
    this.drumsGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
    this.drumsGain.connect(this.masterGain);

    // Dedicated Drums / Sequencer Recording Destination (Isolated pure beat stream)
    this.drumsRecordDest = this.ctx.createMediaStreamDestination();
    this.drumsGain.connect(this.drumsRecordDest);

    // Sampler / Sound-Schnipsel & Drop Bank Channel
    this.samplerGain = this.ctx.createGain();
    this.samplerGain.gain.setValueAtTime(1.0, this.ctx.currentTime);
    this.samplerGain.connect(this.masterGain);

    // Synthesizer & Virtual Instruments Channel
    this.synthGain = this.ctx.createGain();
    this.synthGain.gain.setValueAtTime(0.9, this.ctx.currentTime);
    this.synthGain.connect(this.masterGain);

    // Dedicated Synth Recording Destination (Isolated pure instrument stream)
    this.synthRecordDest = this.ctx.createMediaStreamDestination();
    this.synthGain.connect(this.synthRecordDest);

    this._createNoiseBuffer();
    this.isUnlocked = true;
  }

  unlockAudio() {
    if (!this.ctx) {
      this.init();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        if (window.fourDeckCrossfader) {
          window.fourDeckCrossfader.update();
        }
      });
    }
  }

  setMasterVolume(val) {
    if (!this.masterGain || !this.ctx) return;
    const v = Math.max(0, Math.min(1.5, parseFloat(val)));
    this.masterGain.gain.setTargetAtTime(v * 0.85, this.ctx.currentTime, 0.02);
  }

  setSamplerVolume(val) {
    if (!this.samplerGain || !this.ctx) return;
    const v = Math.max(0, Math.min(1.5, parseFloat(val)));
    this.samplerGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  setSynthVolume(val) {
    if (!this.synthGain || !this.ctx) return;
    const v = Math.max(0, Math.min(1.5, parseFloat(val)));
    this.synthGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }

  async rebindAudioDevice(deviceId = '') {
    this.currentSinkId = deviceId;
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

  async toggleContinuousTestTone() {
    this.unlockAudio();
    const ctx = this.ctx;

    // Toggle OFF if already active
    if (this.testIsActive) {
      this.testIsActive = false;
      if (this.testOsc) {
        try { this.testOsc.stop(); this.testOsc.disconnect(); } catch (e) {}
        this.testOsc = null;
      }
      if (this.testGain) {
        try { this.testGain.disconnect(); } catch (e) {}
        this.testGain = null;
      }
      if (this.testAudioEl) {
        try {
          this.testAudioEl.pause();
          this.testAudioEl.currentTime = 0;
        } catch (e) {}
        this.testAudioEl = null;
      }
      return false; // Stopped
    }

    this.testIsActive = true;

    // Direct High-Fidelity Audio Playback (Clean EDM Club Beat, no screechy sine tone!)
    try {
      if (!this.testAudioEl) {
        this.testAudioEl = new Audio('demo_tracks/Fisherman_Club_Mix_Sample.mp3');
        this.testAudioEl.loop = true;
        this.testAudioEl.volume = 0.85;
        if (this.currentSinkId && typeof this.testAudioEl.setSinkId === 'function') {
          try { await this.testAudioEl.setSinkId(this.currentSinkId); } catch(e){}
        }
      }
      await this.testAudioEl.play();
    } catch (err) {
      console.warn('Audio test playback notice:', err);
      // Fallback to Web Audio if audio element was blocked
      try {
        if (ctx) {
          if (ctx.state === 'suspended' || ctx.state === 'interrupted') await ctx.resume();
          this.testOsc = ctx.createOscillator();
          this.testGain = ctx.createGain();
          this.testOsc.type = 'triangle';
          this.testOsc.frequency.setValueAtTime(440, ctx.currentTime);
          this.testGain.gain.setValueAtTime(0.3, ctx.currentTime);
          this.testOsc.connect(this.testGain);
          this.testGain.connect(ctx.destination);
          this.testOsc.start();
        }
      } catch (e2) {}
    }

    return true; // Playing continuously
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

  playTom(pitch = 'mid', time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    let startFreq = 145;
    let endFreq = 65;
    let dur = 0.22;

    if (pitch === 'high' || pitch === 'hi') {
      startFreq = 210;
      endFreq = 95;
      dur = 0.17;
    } else if (pitch === 'low') {
      startFreq = 95;
      endFreq = 45;
      dur = 0.28;
    }

    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);

    gain.gain.setValueAtTime(1.0, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(gain);
    gain.connect(this.drumsGain);

    osc.start(t);
    osc.stop(t + dur + 0.05);

    // Initial click transient for stick attack
    if (this.noiseBuffer) {
      const click = this.ctx.createBufferSource();
      click.buffer = this.noiseBuffer;
      const cFilter = this.ctx.createBiquadFilter();
      cFilter.type = 'bandpass';
      cFilter.frequency.setValueAtTime(startFreq * 3, t);
      const cGain = this.ctx.createGain();
      cGain.gain.setValueAtTime(0.3, t);
      cGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
      click.connect(cFilter);
      cFilter.connect(cGain);
      cGain.connect(this.drumsGain);
      click.start(t);
      click.stop(t + 0.03);
    }
  }

  playCowbell(time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;
    // Classic 808 dual-frequency square wave through bandpass
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    osc1.type = 'square';
    osc2.type = 'square';
    osc1.frequency.setValueAtTime(540, t);
    osc2.frequency.setValueAtTime(800, t);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(840, t);
    filter.Q.setValueAtTime(12, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.85, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumsGain);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.26);
    osc2.stop(t + 0.26);
  }

  playRimshot(time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(gain);
    gain.connect(this.drumsGain);
    osc.start(t);
    osc.stop(t + 0.05);

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2500, t);
      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.5, t);
      nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(this.drumsGain);
      noise.start(t);
      noise.stop(t + 0.04);
    }
  }

  playShaker(time = 0) {
    this.unlockAudio();
    if (!this.noiseBuffer) return;
    const t = time || this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(6500, t);
    filter.Q.setValueAtTime(4.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumsGain);

    noise.start(t);
    noise.stop(t + 0.075);
  }

  playCrash(time = 0) {
    this.unlockAudio();
    if (!this.noiseBuffer) return;
    const t = time || this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(4000, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.drumsGain);

    noise.start(t);
    noise.stop(t + 1.25);
  }

  playSynthStab(type = 'tiesto', time = 0) {
    this.unlockAudio();
    const t = time || this.ctx.currentTime;

    switch (type) {
      case 'tiesto': {
        // Punchy Tiësto Club DZZZ Bass note
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        osc1.type = 'sawtooth';
        osc2.type = 'square';
        osc1.frequency.setValueAtTime(65.4, t);
        osc2.frequency.setValueAtTime(65.4, t);
        osc2.detune.setValueAtTime(5, t);

        // Pitch snap
        osc1.frequency.setValueAtTime(110, t);
        osc1.frequency.exponentialRampToValueAtTime(65.4, t + 0.035);
        osc2.frequency.setValueAtTime(110, t);
        osc2.frequency.exponentialRampToValueAtTime(65.4, t + 0.035);

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(4200, t);
        filter.frequency.exponentialRampToValueAtTime(180, t + 0.16);
        filter.Q.setValueAtTime(6.5, t);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.9, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.drumsGain);

        osc1.start(t);
        osc2.start(t);
        osc1.stop(t + 0.3);
        osc2.stop(t + 0.3);
        break;
      }

      case 'organ': {
        // 90s House Club Organ Chord (C-Minor: C, Eb, G)
        [261.63, 311.13, 392.00].forEach((freq) => {
          const osc = this.ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.connect(gain);
          gain.connect(this.drumsGain);
          osc.start(t);
          osc.stop(t + 0.26);
        });
        break;
      }

      case 'pluck': {
        // Crisp Marimba / Pluck stab (523.25 Hz)
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, t);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.7, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        osc.connect(gain);
        gain.connect(this.drumsGain);
        osc.start(t);
        osc.stop(t + 0.23);
        break;
      }

      case 'flute': {
        // Flute note (880 Hz / A5)
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, t);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.01, t);
        gain.gain.linearRampToValueAtTime(0.5, t + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        osc.connect(gain);
        gain.connect(this.drumsGain);
        osc.start(t);
        osc.stop(t + 0.36);
        break;
      }
    }
  }

  playSampleClip(sampleId, time = 0) {
    this.unlockAudio();
    if (!window.sampleVault || !window.sampleVault.samples) return;
    const sample = window.sampleVault.samples.find(s => s.id === sampleId);
    if (!sample) return;

    const t = time || this.ctx.currentTime;

    const playBuf = (buf) => {
      if (!buf) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1.0, t);
      src.connect(gain);
      gain.connect(this.drumsGain);
      src.start(t);
    };

    if (sample.buffer) {
      playBuf(sample.buffer);
    } else if (sample.blob) {
      sample.blob.arrayBuffer().then((ab) => {
        this.ctx.decodeAudioData(ab).then((decoded) => {
          sample.buffer = decoded;
          playBuf(decoded);
        }).catch(err => console.warn('Decode error in sequencer sample clip:', err));
      });
    }
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

  setBpm(val) {
    const bpm = Math.max(40, Math.min(240, parseFloat(val) || 120));
    this.bpm = bpm;
    // Update all beat-synced echo delays (dotted 8th / 3/4 beat delay)
    const delayTime = (60 / bpm) * 0.75;
    if (this.ctx && this.deckEchoes) {
      const t = this.ctx.currentTime;
      Object.values(this.deckEchoes).forEach((echo) => {
        if (echo && echo.delay) {
          echo.delay.delayTime.setTargetAtTime(delayTime, t, 0.05);
        }
      });
    }
    // Update sidechain timer if active
    if (this.isPumping && this.sidechainTimer) {
      this.toggleSidechainPump(true);
    }
    return this.bpm;
  }

  getMasterLevels() {
    if (!this.masterAnalyserL || !this.masterAnalyserR) {
      return { left: 0, right: 0 };
    }
    const bufL = new Uint8Array(this.masterAnalyserL.frequencyBinCount);
    const bufR = new Uint8Array(this.masterAnalyserR.frequencyBinCount);
    this.masterAnalyserL.getByteTimeDomainData(bufL);
    this.masterAnalyserR.getByteTimeDomainData(bufR);

    let peakL = 0;
    let peakR = 0;
    for (let i = 0; i < bufL.length; i++) {
      const valL = Math.abs(bufL[i] - 128) / 128;
      const valR = Math.abs(bufR[i] - 128) / 128;
      if (valL > peakL) peakL = valL;
      if (valR > peakR) peakR = valR;
    }
    return {
      left: Math.min(1.0, peakL * 1.5),
      right: Math.min(1.0, peakR * 1.5)
    };
  }

  setDeckEcho(deckId, amount) {
    if (!this.deckEchoes || !this.deckEchoes[deckId] || !this.ctx) return;
    const amt = Math.max(0, Math.min(1, parseFloat(amount) || 0));
    const echo = this.deckEchoes[deckId];
    const t = this.ctx.currentTime;
    // Wet gain scales up smoothly
    echo.wetGain.gain.setTargetAtTime(amt * 0.9, t, 0.02);
    // Feedback increases with knob: 0.2 up to 0.72 (club style tail)
    const fb = amt > 0.02 ? 0.25 + amt * 0.47 : 0.0;
    echo.feedback.gain.setTargetAtTime(fb, t, 0.02);
  }

  recordTap() {
    const now = Date.now();
    // If last tap was > 2.5s ago, reset tap queue
    if (this.tapTimes.length > 0 && now - this.tapTimes[this.tapTimes.length - 1] > 2500) {
      this.tapTimes = [];
    }
    this.tapTimes.push(now);
    if (this.tapTimes.length > 6) {
      this.tapTimes.shift();
    }
    if (this.tapTimes.length < 2) {
      return this.bpm || 120;
    }
    // Calculate average interval between consecutive taps
    let intervals = [];
    for (let i = 1; i < this.tapTimes.length; i++) {
      intervals.push(this.tapTimes[i] - this.tapTimes[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    let bpm = Math.round(60000 / avgInterval);
    if (bpm < 50) bpm = 50;
    if (bpm > 220) bpm = 220;
    this.setBpm(bpm);
    return bpm;
  }

  detectBpm(audioBuffer) {
    if (!audioBuffer || audioBuffer.length < 44100) return 128;
    try {
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;

      // Analyze up to 30 seconds, skipping the first 2 seconds intro
      const startSample = Math.floor(Math.min(2 * sampleRate, channelData.length * 0.1));
      const endSample = Math.min(startSample + 30 * sampleRate, channelData.length);
      const length = endSample - startSample;
      if (length < sampleRate * 5) return 128;

      // Downsample by factor of 20 (approx 2205 Hz)
      const step = 20;
      const downSampledLength = Math.floor(length / step);
      const envelope = new Float32Array(downSampledLength);

      for (let i = 0; i < downSampledLength; i++) {
        const rawIdx = startSample + i * step;
        let v = 0;
        for (let j = 0; j < step && (rawIdx + j) < endSample; j++) {
          const val = Math.abs(channelData[rawIdx + j]);
          if (val > v) v = val;
        }
        envelope[i] = v;
      }

      // Moving average threshold to detect onsets/transients
      const avgWindow = 120; // ~1 second
      let runningSum = 0;
      for (let i = 0; i < Math.min(avgWindow, envelope.length); i++) {
        runningSum += envelope[i];
      }

      const peaks = [];
      const effectiveSampleRate = sampleRate / step;
      const minPeakDist = effectiveSampleRate * 0.25; // min 0.25s between peaks (max 240 BPM)

      let lastPeak = -minPeakDist;
      for (let i = avgWindow; i < envelope.length - avgWindow; i++) {
        runningSum += envelope[i] - envelope[i - avgWindow];
        const localAvg = runningSum / avgWindow;
        if (envelope[i] > localAvg * 1.4 &&
            envelope[i] > envelope[i - 1] &&
            envelope[i] > envelope[i + 1] &&
            envelope[i] > envelope[i - 2] &&
            envelope[i] > envelope[i + 2] &&
            (i - lastPeak) >= minPeakDist) {
          peaks.push(i);
          lastPeak = i;
        }
      }

      if (peaks.length < 6) return 128;

      // Calculate intervals between successive peaks
      const bpmCounts = {};
      for (let i = 0; i < peaks.length - 1; i++) {
        for (let j = i + 1; j < Math.min(i + 4, peaks.length); j++) {
          const intervalSamples = (peaks[j] - peaks[i]) / (j - i);
          const intervalSec = intervalSamples / effectiveSampleRate;
          let candidateBpm = Math.round(60 / intervalSec);

          // Normalize to standard DJ range 75 - 160 BPM
          while (candidateBpm < 75 && candidateBpm > 0) candidateBpm *= 2;
          while (candidateBpm > 160) candidateBpm = Math.round(candidateBpm / 2);

          if (candidateBpm >= 75 && candidateBpm <= 160) {
            bpmCounts[candidateBpm] = (bpmCounts[candidateBpm] || 0) + 1;
            bpmCounts[candidateBpm - 1] = (bpmCounts[candidateBpm - 1] || 0) + 0.3;
            bpmCounts[candidateBpm + 1] = (bpmCounts[candidateBpm + 1] || 0) + 0.3;
          }
        }
      }

      let bestBpm = 128;
      let maxCount = -1;
      for (const [bpmStr, count] of Object.entries(bpmCounts)) {
        if (count > maxCount) {
          maxCount = count;
          bestBpm = parseInt(bpmStr, 10);
        }
      }
      return bestBpm;
    } catch (e) {
      console.warn('Auto BPM detection fallback:', e);
      return 128;
    }
  }
}

// Global instance
window.audioEngine = new AudioEngine();
