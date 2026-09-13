/**
 * Ist_Mix_Musik - Professional 4-Deck Traktor DJ Controller
 * Provides 4 full decks with multi-color waveforms, rotating vinyl jog wheels,
 * HotCues, loops, pitch faders, 3-band EQ + kills, DJ filter sweeps, solo/mute,
 * and 4-channel crossfader assignment.
 */

class DJDeck {
  constructor(deckId, channelNumber, accentColor, defaultXFaderSide = 'thru') {
    this.deckId = deckId;
    this.channelNumber = channelNumber;
    this.accentColor = accentColor;
    this.xfaderSide = defaultXFaderSide; // 'left', 'right', 'thru'

    this.audioBuffer = null;
    this.sourceNode = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseOffset = 0;
    this.playbackRate = 1.0;

    // HotCues (1-4)
    this.hotCues = [null, null, null, null];

    // Loop state
    this.isLooping = false;
    this.loopStart = 0;
    this.loopLengthSec = 2.0;

    // Solo & Mute
    this.isSolo = false;
    this.isMute = false;
    this.userFaderVolume = 1.0;

    // Vinyl Jog Wheel
    this.jogRotation = 0;
    this.isScratching = false;
    this.lastTouchX = 0;

    // Audio Graph Nodes
    this.eqLow = null;
    this.eqMid = null;
    this.eqHigh = null;
    this.djFilterLP = null;
    this.djFilterHP = null;
    this.channelFaderGain = null;
    this.xfaderGain = null;
    this.analyser = null;

    this._setupAudioGraph();
    this._cacheUI();
    this._attachEvents();
  }

  _setupAudioGraph() {
    const ctx = window.audioEngine.ctx;
    const bus = window.audioEngine.deckBusses[this.deckId];

    // 3-Band EQ
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 250;
    this.eqLow.gain.value = 0;

    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1.0;
    this.eqMid.gain.value = 0;

    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 4000;
    this.eqHigh.gain.value = 0;

    // Traktor DJ Filter (LPF + HPF in series)
    this.djFilterLP = ctx.createBiquadFilter();
    this.djFilterLP.type = 'lowpass';
    this.djFilterLP.frequency.value = 20000; // Open by default

    this.djFilterHP = ctx.createBiquadFilter();
    this.djFilterHP.type = 'highpass';
    this.djFilterHP.frequency.value = 20; // Open by default

    // Channel Fader & Crossfader Gain Nodes
    this.channelFaderGain = ctx.createGain();
    this.channelFaderGain.gain.value = 1.0;

    this.xfaderGain = ctx.createGain();
    this.xfaderGain.gain.value = 1.0;

    // Analyser for LED VU Meter
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 64;

    // Chain: Source -> EQLow -> EQMid -> EQHigh -> DJFilterLP -> DJFilterHP -> ChannelFader -> XFader -> Analyser -> Bus
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.djFilterLP);
    this.djFilterLP.connect(this.djFilterHP);
    this.djFilterHP.connect(this.channelFaderGain);
    this.channelFaderGain.connect(this.xfaderGain);
    this.xfaderGain.connect(this.analyser);
    this.analyser.connect(bus);
  }

  _cacheUI() {
    const id = this.deckId;
    this.canvas = document.getElementById(`${id}-waveform`);
    this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
    this.cursor = document.getElementById(`${id}-cursor`);
    this.btnPlay = document.getElementById(`${id}-play`);
    this.btnCue = document.getElementById(`${id}-cue`);
    this.btnSync = document.getElementById(`${id}-sync`);
    this.trackNameEl = document.getElementById(`${id}-track-name`);
    this.timeDisplay = document.getElementById(`${id}-time-display`);
    this.jogWheel = document.getElementById(`${id}-jog-wheel`);
    this.pitchSlider = document.getElementById(`${id}-pitch-slider`);
    this.pitchDisplay = document.getElementById(`${id}-pitch-display`);

    // Mixer Channel Controls
    this.btnSolo = document.getElementById(`ch${this.channelNumber}-solo`);
    this.btnMute = document.getElementById(`ch${this.channelNumber}-mute`);
    this.faderInput = document.getElementById(`ch${this.channelNumber}-fader`);
    this.meterLeds = document.querySelectorAll(`#ch${this.channelNumber}-vu .vu-led`);
  }

  _attachEvents() {
    const id = this.deckId;
    const ch = this.channelNumber;

    // Play button
    if (this.btnPlay) {
      this.btnPlay.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.togglePlay();
      });
    }

    // Cue button
    if (this.btnCue) {
      this.btnCue.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.cue();
      });
    }

    // Sync button
    if (this.btnSync) {
      this.btnSync.addEventListener('click', () => {
        this.syncTempo();
      });
    }

    // Pitch Fader Slider
    if (this.pitchSlider) {
      this.pitchSlider.addEventListener('input', (e) => {
        const percent = parseFloat(e.target.value);
        this.setPitch(percent);
      });
      // Double click to reset pitch to 0.0%
      this.pitchSlider.addEventListener('dblclick', () => {
        this.pitchSlider.value = 0;
        this.setPitch(0);
      });
    }

    // File Uploader
    const fileInput = document.getElementById(`${id}-file-input`);
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.loadAudioFile(file);
      });
    }

    // Waveform Scrubbing / Seeking
    if (this.canvas) {
      const seekHandler = (e) => {
        if (!this.audioBuffer) return;
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        this.seek(ratio);
      };
      this.canvas.addEventListener('click', seekHandler);
      this.canvas.addEventListener('touchstart', seekHandler, { passive: true });
    }

    // Rotating Vinyl Jog Wheel Drag & Scratch
    if (this.jogWheel) {
      const startDrag = (e) => {
        this.isScratching = true;
        this.lastTouchX = e.touches ? e.touches[0].clientX : e.clientX;
      };
      const moveDrag = (e) => {
        if (!this.isScratching || !this.audioBuffer) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const deltaX = clientX - this.lastTouchX;
        this.lastTouchX = clientX;

        // Nudge / scratch scrub
        this.jogRotation += deltaX * 1.5;
        this.jogWheel.style.transform = `rotate(${this.jogRotation}deg)`;

        const timeDelta = (deltaX / 100.0) * 0.4;
        this.seekRelative(timeDelta);
      };
      const endDrag = () => {
        this.isScratching = false;
      };

      this.jogWheel.addEventListener('mousedown', startDrag);
      window.addEventListener('mousemove', moveDrag);
      window.addEventListener('mouseup', endDrag);

      this.jogWheel.addEventListener('touchstart', startDrag, { passive: true });
      this.jogWheel.addEventListener('touchmove', moveDrag, { passive: true });
      this.jogWheel.addEventListener('touchend', endDrag);
    }

    // HotCues (1 to 4)
    for (let c = 1; c <= 4; c++) {
      const pad = document.getElementById(`${id}-cue-${c}`);
      if (pad) {
        pad.addEventListener('click', (e) => {
          window.audioEngine.unlockAudio();
          this.handleHotCue(c - 1, e.shiftKey);
        });
      }
    }

    // Auto-Loop Buttons (1, 2, 4, 8 beats)
    [1, 2, 4, 8].forEach((beats) => {
      const btn = document.getElementById(`${id}-loop-${beats}`);
      if (btn) {
        btn.addEventListener('click', () => {
          window.audioEngine.unlockAudio();
          this.toggleLoop(beats);
        });
      }
    });

    // Mixer Channel: Solo Button
    if (this.btnSolo) {
      this.btnSolo.addEventListener('click', () => {
        this.isSolo = !this.isSolo;
        this.btnSolo.classList.toggle('active', this.isSolo);
        window.audioEngine.setDeckSolo(this.deckId, this.isSolo);
      });
    }

    // Mixer Channel: Mute Button
    if (this.btnMute) {
      this.btnMute.addEventListener('click', () => {
        this.isMute = !this.isMute;
        this.btnMute.classList.toggle('active', this.isMute);
        window.audioEngine.setDeckMute(this.deckId, this.isMute);
      });
    }

    // Mixer Channel: Volume Fader
    if (this.faderInput) {
      this.faderInput.addEventListener('input', (e) => {
        this.userFaderVolume = parseFloat(e.target.value);
        window.audioEngine.updateAllDeckGains();
      });
    }

    // Mixer Channel: 3-Band EQ & Kills
    ['low', 'mid', 'high'].forEach((band) => {
      const knob = document.getElementById(`ch${ch}-eq-${band}`);
      if (knob) {
        knob.addEventListener('input', (e) => {
          this.setEQ(band, parseFloat(e.target.value));
        });
      }
      const kill = document.getElementById(`ch${ch}-kill-${band}`);
      if (kill) {
        kill.addEventListener('click', () => {
          const isKilled = kill.classList.toggle('killed');
          if (isKilled) {
            this.setEQ(band, -40);
          } else {
            const val = knob ? parseFloat(knob.value) : 0;
            this.setEQ(band, val);
          }
        });
      }
    });

    // Mixer Channel: Traktor DJ Filter Sweep Knob
    const filterKnob = document.getElementById(`ch${ch}-filter`);
    if (filterKnob) {
      filterKnob.addEventListener('input', (e) => {
        this.setDJFilter(parseFloat(e.target.value));
      });
      filterKnob.addEventListener('dblclick', () => {
        filterKnob.value = 0;
        this.setDJFilter(0);
      });
    }

    // Crossfader Assignment Selector (Left / Thru / Right)
    const xfSelect = document.getElementById(`ch${ch}-xf-assign`);
    if (xfSelect) {
      xfSelect.addEventListener('change', (e) => {
        this.xfaderSide = e.target.value;
        if (window.fourDeckCrossfader) {
          window.fourDeckCrossfader.update();
        }
      });
    }

    this._startVUAnimation();
  }

  async loadAudioFile(file) {
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    if (this.trackNameEl) {
      this.trackNameEl.textContent = `Lade: ${file.name}...`;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      this.audioBuffer = decoded;

      this.pauseOffset = 0;
      this.stop();

      if (this.trackNameEl) {
        const mins = Math.floor(decoded.duration / 60);
        const secs = Math.floor(decoded.duration % 60);
        this.trackNameEl.textContent = `${file.name} (${mins}:${secs < 10 ? '0' : ''}${secs})`;
      }

      this._drawWaveform();
      this.updateTimeDisplay();
    } catch (err) {
      console.error('Error decoding audio file:', err);
      if (this.trackNameEl) {
        this.trackNameEl.textContent = 'Fehler beim Laden!';
      }
      alert(`Audiodatei konnte nicht dekodiert werden: ${err.message}`);
    }
  }

  togglePlay() {
    if (!this.audioBuffer) {
      alert(`Bitte lade zuerst eine Audiodatei in ${this.deckId.toUpperCase()}!`);
      return;
    }
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.isPlaying || !this.audioBuffer) return;
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    this.sourceNode = ctx.createBufferSource();
    this.sourceNode.buffer = this.audioBuffer;
    this.sourceNode.playbackRate.value = this.playbackRate;
    this.sourceNode.connect(this.eqLow);

    const offset = this.pauseOffset % this.audioBuffer.duration;
    this.startTime = ctx.currentTime - (offset / this.playbackRate);

    this.sourceNode.start(0, offset);
    this.isPlaying = true;

    if (this.btnPlay) {
      this.btnPlay.textContent = '⏸ PAUSE';
      this.btnPlay.classList.add('playing');
    }

    this.sourceNode.onended = () => {
      if (this.isPlaying && !this.isLooping) {
        this.pauseOffset = 0;
        this.isPlaying = false;
        if (this.btnPlay) {
          this.btnPlay.textContent = '▶ PLAY';
          this.btnPlay.classList.remove('playing');
        }
      }
    };

    this._startProgressLoop();
  }

  pause() {
    if (!this.isPlaying) return;
    const ctx = window.audioEngine.ctx;
    const elapsed = (ctx.currentTime - this.startTime) * this.playbackRate;
    this.pauseOffset = elapsed % this.audioBuffer.duration;
    this.stop();
  }

  cue() {
    this.pauseOffset = 0;
    this.stop();
    if (this.cursor) this.cursor.style.left = '0%';
    this.updateTimeDisplay();
  }

  stop() {
    if (this.sourceNode) {
      try {
        this.sourceNode.stop();
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }
    this.isPlaying = false;
    if (this.btnPlay) {
      this.btnPlay.textContent = '▶ PLAY';
      this.btnPlay.classList.remove('playing');
    }
  }

  seek(ratio) {
    if (!this.audioBuffer) return;
    const targetOffset = ratio * this.audioBuffer.duration;
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stop();
    this.pauseOffset = targetOffset;
    if (this.cursor) this.cursor.style.left = `${ratio * 100}%`;
    this.updateTimeDisplay();
    if (wasPlaying) this.play();
  }

  seekRelative(seconds) {
    if (!this.audioBuffer) return;
    const curr = this.getCurrentTime();
    const next = Math.max(0, Math.min(this.audioBuffer.duration, curr + seconds));
    this.seek(next / this.audioBuffer.duration);
  }

  getCurrentTime() {
    if (!this.audioBuffer) return 0;
    if (this.isPlaying) {
      const ctx = window.audioEngine.ctx;
      const elapsed = (ctx.currentTime - this.startTime) * this.playbackRate;
      return elapsed % this.audioBuffer.duration;
    }
    return this.pauseOffset % this.audioBuffer.duration;
  }

  updateTimeDisplay() {
    if (!this.timeDisplay) return;
    const cur = this.getCurrentTime();
    const mins = Math.floor(cur / 60);
    const secs = Math.floor(cur % 60);
    const ms = Math.floor((cur % 1) * 100);
    this.timeDisplay.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}.${ms < 10 ? '0' : ''}${ms}`;
  }

  setPitch(percent) {
    // percent is -8.0 to +8.0
    this.playbackRate = 1.0 + (percent / 100.0);
    if (this.sourceNode) {
      this.sourceNode.playbackRate.setTargetAtTime(this.playbackRate, window.audioEngine.ctx.currentTime, 0.02);
    }
    if (this.pitchDisplay) {
      const sign = percent >= 0 ? '+' : '';
      this.pitchDisplay.textContent = `${sign}${percent.toFixed(1)}%`;
    }
  }

  syncTempo() {
    // Match current master BPM
    const targetBpm = window.audioEngine.bpm || 120;
    // Assume base track is ~120 BPM, sync pitch to match
    const diff = (targetBpm - 120) / 120 * 100;
    const clamped = Math.max(-8, Math.min(8, diff));
    if (this.pitchSlider) this.pitchSlider.value = clamped;
    this.setPitch(clamped);
    if (this.btnSync) {
      this.btnSync.classList.add('synced');
      setTimeout(() => this.btnSync.classList.remove('synced'), 800);
    }
  }

  // HotCues Handling
  handleHotCue(index, isDelete) {
    if (!this.audioBuffer) return;
    const pad = document.getElementById(`${this.deckId}-cue-${index + 1}`);

    if (isDelete) {
      this.hotCues[index] = null;
      if (pad) {
        pad.classList.remove('set');
        pad.style.borderColor = '';
      }
      return;
    }

    if (this.hotCues[index] === null) {
      // Set HotCue at current position
      this.hotCues[index] = this.getCurrentTime();
      if (pad) {
        pad.classList.add('set');
        pad.style.borderColor = this.accentColor;
      }
    } else {
      // Jump to HotCue
      const targetSec = this.hotCues[index];
      this.seek(targetSec / this.audioBuffer.duration);
    }
  }

  // Loop Handling
  toggleLoop(beats) {
    if (!this.audioBuffer) return;
    const bpm = window.audioEngine.bpm || 120;
    const beatSec = 60.0 / bpm;
    const loopDuration = beats * beatSec;

    const btn = document.getElementById(`${this.deckId}-loop-${beats}`);
    if (this.isLooping && this.loopLengthSec === loopDuration) {
      // Turn off loop
      this.isLooping = false;
      document.querySelectorAll(`.${this.deckId}-loop-btn`).forEach(b => b.classList.remove('active'));
    } else {
      // Set new loop
      this.isLooping = true;
      this.loopStart = this.getCurrentTime();
      this.loopLengthSec = loopDuration;

      document.querySelectorAll(`.${this.deckId}-loop-btn`).forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
    }
  }

  setEQ(band, gainValue) {
    const ctx = window.audioEngine.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (band === 'low' && this.eqLow) {
      this.eqLow.gain.setTargetAtTime(gainValue, t, 0.02);
    } else if (band === 'mid' && this.eqMid) {
      this.eqMid.gain.setTargetAtTime(gainValue, t, 0.02);
    } else if (band === 'high' && this.eqHigh) {
      this.eqHigh.gain.setTargetAtTime(gainValue, t, 0.02);
    }
  }

  setDJFilter(val) {
    // val is -1.0 (Full Lowpass) to 0.0 (Neutral) to +1.0 (Full Highpass)
    const ctx = window.audioEngine.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;

    if (val < 0) {
      // Lowpass sweep: 20000 Hz down to 250 Hz
      const lpFreq = Math.max(250, 20000 * Math.pow(10, val * 1.9));
      this.djFilterLP.frequency.setTargetAtTime(lpFreq, t, 0.02);
      this.djFilterHP.frequency.setTargetAtTime(20, t, 0.02); // Neutral HP
    } else if (val > 0) {
      // Highpass sweep: 20 Hz up to 6000 Hz
      const hpFreq = Math.min(6000, 20 + 5980 * Math.pow(val, 2));
      this.djFilterHP.frequency.setTargetAtTime(hpFreq, t, 0.02);
      this.djFilterLP.frequency.setTargetAtTime(20000, t, 0.02); // Neutral LP
    } else {
      // Neutral center
      this.djFilterLP.frequency.setTargetAtTime(20000, t, 0.02);
      this.djFilterHP.frequency.setTargetAtTime(20, t, 0.02);
    }
  }

  _startProgressLoop() {
    const update = () => {
      if (!this.isPlaying || !this.audioBuffer) return;
      const cur = this.getCurrentTime();

      // Loop boundary check
      if (this.isLooping && cur >= this.loopStart + this.loopLengthSec) {
        this.seek(this.loopStart / this.audioBuffer.duration);
      }

      // Update Cursor
      const ratio = cur / this.audioBuffer.duration;
      if (this.cursor) {
        this.cursor.style.left = `${Math.min(100, ratio * 100)}%`;
      }
      this.updateTimeDisplay();

      // Spin Jog Wheel while playing
      if (!this.isScratching && this.jogWheel) {
        this.jogRotation = (this.jogRotation + 2.5 * this.playbackRate) % 360;
        this.jogWheel.style.transform = `rotate(${this.jogRotation}deg)`;
      }

      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  _drawWaveform() {
    if (!this.canvas || !this.audioBuffer) return;
    const width = this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio || 600;
    const height = this.canvas.height = this.canvas.offsetHeight * window.devicePixelRatio || 90;
    const c = this.canvasCtx;
    const rawData = this.audioBuffer.getChannelData(0);
    const step = Math.ceil(rawData.length / width);
    const amp = height / 2;

    c.fillStyle = '#080a0f';
    c.fillRect(0, 0, width, height);

    // Grid center line
    c.strokeStyle = '#1b202c';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, amp);
    c.lineTo(width, amp);
    c.stroke();

    // Multi-color Traktor spectral waveform
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = rawData[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }

      const barHeight = (max - min) * amp;
      // Color based on amplitude (spectral frequency simulation)
      if (barHeight > amp * 1.1) {
        c.fillStyle = '#ffffff'; // Transients / peaks
      } else if (barHeight > amp * 0.7) {
        c.fillStyle = this.accentColor; // Midrange
      } else {
        c.fillStyle = '#ff6b35'; // Lows / bass warmth
      }

      const y1 = (1 + min) * amp;
      c.fillRect(i, y1, 1, Math.max(2, barHeight));
    }
  }

  _startVUAnimation() {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    const loop = () => {
      requestAnimationFrame(loop);
      if (!this.meterLeds || this.meterLeds.length === 0) return;

      this.analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length; // 0 to 255
      const level = Math.min(1.0, avg / 110.0);

      const activeCount = Math.round(level * this.meterLeds.length);
      this.meterLeds.forEach((led, idx) => {
        led.classList.toggle('lit', idx < activeCount);
      });
    };
    loop();
  }
}

/**
 * 4-Deck Assignable Crossfader
 */
class FourDeckCrossfader {
  constructor(decks) {
    this.decks = decks;
    this.slider = document.getElementById('crossfader-slider');
    this.attach();
  }

  attach() {
    if (!this.slider) return;
    this.slider.addEventListener('input', () => this.update());
    this.update();
  }

  update() {
    if (!this.slider) return;
    const val = parseFloat(this.slider.value); // 0.0 (Left) to 1.0 (Right)
    const ctx = window.audioEngine.ctx;
    if (!ctx) return;

    // Constant power curves:
    const gainLeft = Math.cos(val * 0.5 * Math.PI);
    const gainRight = Math.sin(val * 0.5 * Math.PI);

    Object.values(this.decks).forEach((deck) => {
      let g = 1.0;
      if (deck.xfaderSide === 'left') {
        g = gainLeft;
      } else if (deck.xfaderSide === 'right') {
        g = gainRight;
      } else {
        g = 1.0; // Thru
      }
      deck.xfaderGain.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
    });
  }
}

window.initDecks = () => {
  window.audioEngine.init();

  const deckA = new DJDeck('deck-a', 1, '#00f0ff', 'left');  // Cyan, Ch 1, Left
  const deckB = new DJDeck('deck-b', 2, '#ff007f', 'right'); // Neon Pink, Ch 2, Right
  const deckC = new DJDeck('deck-c', 3, '#ff6b35', 'left');  // Electric Orange, Ch 3, Left
  const deckD = new DJDeck('deck-d', 4, '#9d4edd', 'right'); // Neon Purple, Ch 4, Right

  window.decks = {
    'deck-a': deckA,
    'deck-b': deckB,
    'deck-c': deckC,
    'deck-d': deckD
  };

  window.fourDeckCrossfader = new FourDeckCrossfader(window.decks);
};
