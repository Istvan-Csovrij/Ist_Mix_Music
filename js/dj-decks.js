/**
 * Ist_Mix_Music - Professional 4-Deck Traktor DJ Controller
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

    // Waveform Scrubbing / Mouse Dragging
    this.isWaveformDragging = false;
    this.wasPlayingBeforeDrag = false;

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
    this.bpmDisplayEl = document.getElementById(`${id}-bpm-display`);

    // Mixer Channel Controls
    this.btnSolo = document.getElementById(`ch${this.channelNumber}-solo`);
    this.btnMute = document.getElementById(`ch${this.channelNumber}-mute`);
    this.faderInput = document.getElementById(`ch${this.channelNumber}-fader`);
    this.meterLeds = document.querySelectorAll(`#ch${this.channelNumber}-vu .vu-led`);
  }

  _attachEvents() {
    const id = this.deckId;
    const ch = this.channelNumber;

    // BPM Display Click to Sync Master Tempo
    if (this.bpmDisplayEl) {
      this.bpmDisplayEl.addEventListener('click', () => {
        if (this.trackBpm && window.audioEngine) {
          window.audioEngine.setBpm(this.trackBpm);
          const bpmSlider = document.getElementById('bpm-slider');
          const bpmDisplay = document.getElementById('bpm-display');
          if (bpmSlider) bpmSlider.value = this.trackBpm;
          if (bpmDisplay) bpmDisplay.textContent = `${this.trackBpm} BPM`;
          this.bpmDisplayEl.classList.add('synced');
          setTimeout(() => this.bpmDisplayEl.classList.remove('synced'), 400);
        }
      });
    }

    // Drag & Drop for songs directly onto Deck Card
    const cardEl = document.getElementById(`card-${id}`);
    if (cardEl) {
      ['dragenter', 'dragover'].forEach((eventName) => {
        cardEl.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          cardEl.classList.add('drag-over');
        });
      });
      ['dragleave', 'dragend'].forEach((eventName) => {
        cardEl.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          cardEl.classList.remove('drag-over');
        });
      });
      cardEl.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cardEl.classList.remove('drag-over');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          const file = e.dataTransfer.files[0];
          if (file) {
            this.loadAudioFile(file);
          }
        }
      });
    }

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

    // Waveform Scrubbing / Seeking & Mouse/Touch Dragging
    const waveformBox = this.canvas ? this.canvas.parentElement : null;
    const targetElement = waveformBox || this.canvas;

    if (targetElement) {
      const getRatio = (e) => {
        const rect = targetElement.getBoundingClientRect();
        const clientX = (e.touches && e.touches.length > 0) ? e.touches[0].clientX : e.clientX;
        return Math.max(0, Math.min(0.999, (clientX - rect.left) / rect.width));
      };

      const startDrag = (e) => {
        if (!this.audioBuffer) return;
        this.isWaveformDragging = true;
        this.wasPlayingBeforeDrag = this.isPlaying;

        // Stop playback cleanly while dragging so audio does not duplicate or glitch
        if (this.isPlaying) {
          this.stop();
        }

        const ratio = getRatio(e);
        this.pauseOffset = ratio * this.audioBuffer.duration;
        if (this.cursor) this.cursor.style.left = `${ratio * 100}%`;
        this.updateTimeDisplay();
      };

      const moveDrag = (e) => {
        if (!this.isWaveformDragging || !this.audioBuffer) return;
        const ratio = getRatio(e);
        this.pauseOffset = ratio * this.audioBuffer.duration;
        if (this.cursor) this.cursor.style.left = `${ratio * 100}%`;
        this.updateTimeDisplay();
      };

      const endDrag = () => {
        if (!this.isWaveformDragging || !this.audioBuffer) return;
        this.isWaveformDragging = false;

        // If it was playing before dragging began, resume playback immediately from new position
        if (this.wasPlayingBeforeDrag) {
          this.play();
        }
      };

      let lastTouchTime = 0;
      const handleMouseDown = (e) => {
        if (performance.now() - lastTouchTime < 600) return;
        startDrag(e);
      };
      const handleMouseMove = (e) => {
        if (performance.now() - lastTouchTime < 600) return;
        moveDrag(e);
      };
      const handleMouseUp = (e) => {
        if (performance.now() - lastTouchTime < 600) return;
        endDrag(e);
      };

      const handleTouchStart = (e) => {
        lastTouchTime = performance.now();
        startDrag(e);
      };
      const handleTouchMove = (e) => {
        lastTouchTime = performance.now();
        moveDrag(e);
      };
      const handleTouchEnd = (e) => {
        lastTouchTime = performance.now();
        endDrag(e);
      };

      // Mouse drag listeners
      targetElement.addEventListener('mousedown', handleMouseDown);
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      // Touch drag listeners (phones, tablets, touch laptops)
      targetElement.addEventListener('touchstart', handleTouchStart, { passive: true });
      window.addEventListener('touchmove', handleTouchMove, { passive: true });
      window.addEventListener('touchend', handleTouchEnd);
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

  setAudioBuffer(buffer, trackName = '') {
    this.audioBuffer = buffer;
    this.pauseOffset = 0;
    this.stop();

    if (trackName && this.trackNameEl) {
      this.trackNameEl.textContent = trackName;
    }

    // Automatic BPM Detection
    if (window.audioEngine && typeof window.audioEngine.detectBpm === 'function') {
      const detected = window.audioEngine.detectBpm(buffer);
      this.trackBpm = detected;
      if (this.bpmDisplayEl) {
        this.bpmDisplayEl.textContent = `${detected} BPM`;
        this.bpmDisplayEl.classList.add('detected');
      }
    }

    this._drawWaveform();
    this.updateTimeDisplay();
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
      const mins = Math.floor(decoded.duration / 60);
      const secs = Math.floor(decoded.duration % 60);
      const displayName = `${file.name} (${mins}:${secs < 10 ? '0' : ''}${secs})`;

      this.setAudioBuffer(decoded, displayName);

      if (window.trackLibrary && typeof window.trackLibrary.saveExternalFile === 'function') {
        window.trackLibrary.saveExternalFile(file, decoded);
      }
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
    const now = performance.now();
    if (this._lastToggleTime && (now - this._lastToggleTime < 150)) {
      return;
    }
    this._lastToggleTime = now;

    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (!this.audioBuffer) return;

    // Strict duplicate protection: if already playing with an active node, do not create another!
    if (this.isPlaying && this.sourceNode) {
      return;
    }

    const now = performance.now();
    if (this._lastPlayTime && (now - this._lastPlayTime < 120)) {
      return;
    }
    this._lastPlayTime = now;

    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    // Force-stop and disconnect any prior sourceNode before starting new playback
    this._cleanStopCurrentSource();

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

    const nodeRef = this.sourceNode;
    this.sourceNode.onended = () => {
      // Only handle onended if this is still the active node!
      if (this.sourceNode === nodeRef && this.isPlaying && !this.isLooping) {
        this.pauseOffset = 0;
        this.isPlaying = false;
        this.sourceNode = null;
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

  _cleanStopCurrentSource() {
    if (this.sourceNode) {
      const node = this.sourceNode;
      this.sourceNode = null;
      node.onended = null;
      try {
        node.stop(0);
      } catch (e) {}
      try {
        node.disconnect();
      } catch (e) {}
    }
  }

  stop() {
    this._cleanStopCurrentSource();
    this.isPlaying = false;
    if (this.btnPlay) {
      this.btnPlay.textContent = '▶ PLAY';
      this.btnPlay.classList.remove('playing');
    }
  }

  seek(ratio) {
    if (!this.audioBuffer) return;
    const clampedRatio = Math.max(0, Math.min(0.999, ratio));
    const targetOffset = clampedRatio * this.audioBuffer.duration;
    const wasPlaying = this.isPlaying;
    if (wasPlaying) this.stop();
    this.pauseOffset = targetOffset;
    if (this.cursor) this.cursor.style.left = `${clampedRatio * 100}%`;
    this.updateTimeDisplay();
    if (wasPlaying) {
      setTimeout(() => {
        if (!this.isPlaying) this.play();
      }, 30);
    }
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

      // Update Cursor & Time Display (only if not currently dragging)
      if (!this.isWaveformDragging) {
        const ratio = cur / this.audioBuffer.duration;
        if (this.cursor) {
          this.cursor.style.left = `${Math.min(100, ratio * 100)}%`;
        }
        this.updateTimeDisplay();
      }

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
  window.initDeckLayoutMode();

  // 1. Tap-Tempo & Master BPM control
  const tapBtn = document.getElementById('btn-tap-tempo');
  const bpmSlider = document.getElementById('bpm-slider');
  const bpmDisplay = document.getElementById('bpm-display');
  if (tapBtn) {
    tapBtn.addEventListener('click', () => {
      window.audioEngine.unlockAudio();
      const bpm = window.audioEngine.recordTap();
      if (bpmSlider) bpmSlider.value = bpm;
      if (bpmDisplay) bpmDisplay.textContent = `${bpm} BPM`;
      tapBtn.classList.add('tapped');
      setTimeout(() => tapBtn.classList.remove('tapped'), 150);
    });
  }

  // 2. Channel Echo Knobs (CH 1 to CH 4)
  const echoDeckMap = {
    'ch1-echo': 'deck-a',
    'ch2-echo': 'deck-b',
    'ch3-echo': 'deck-c',
    'ch4-echo': 'deck-d'
  };
  Object.entries(echoDeckMap).forEach(([elemId, deckId]) => {
    const el = document.getElementById(elemId);
    if (el) {
      el.addEventListener('input', (e) => {
        window.audioEngine.setDeckEcho(deckId, parseFloat(e.target.value));
      });
      el.addEventListener('dblclick', () => {
        el.value = 0;
        window.audioEngine.setDeckEcho(deckId, 0);
      });
    }
  });

  // 3. Master Stereo Dual VU-Meter (L / R)
  const vuLedsL = document.querySelectorAll('#master-vu-l .vu-led');
  const vuLedsR = document.querySelectorAll('#master-vu-r .vu-led');
  if (vuLedsL.length > 0 && vuLedsR.length > 0) {
    const updateMasterVU = () => {
      const levels = window.audioEngine.getMasterLevels();
      const numLeds = vuLedsL.length;
      const activeL = Math.round(levels.left * numLeds);
      const activeR = Math.round(levels.right * numLeds);

      vuLedsL.forEach((led, idx) => {
        const fromBottom = numLeds - 1 - idx;
        led.classList.toggle('lit', fromBottom < activeL);
      });
      vuLedsR.forEach((led, idx) => {
        const fromBottom = numLeds - 1 - idx;
        led.classList.toggle('lit', fromBottom < activeR);
      });

      requestAnimationFrame(updateMasterVU);
    };
    requestAnimationFrame(updateMasterVU);
  }
};

window.isDeckHidden = (deckId) => {
  if (deckId === 'deck-c') {
    return document.body.classList.contains('deck-c-hidden');
  }
  if (deckId === 'deck-d') {
    return document.body.classList.contains('deck-d-hidden');
  }
  return false;
};

window.setDeckVisibility = (deckId, isVisible) => {
  if (deckId !== 'deck-c' && deckId !== 'deck-d') return;
  const isC = (deckId === 'deck-c');
  const className = isC ? 'deck-c-hidden' : 'deck-d-hidden';
  const storageKey = isC ? 'ist_mix_deck_c_hidden' : 'ist_mix_deck_d_hidden';

  const shouldHide = !isVisible;
  document.body.classList.toggle(className, shouldHide);
  localStorage.setItem(storageKey, shouldHide ? '1' : '0');

  // If newly hidden while playing, stop the deck
  if (shouldHide && window.decks && window.decks[deckId]) {
    window.decks[deckId].stop();
  }

  // Update button texts and active states
  window._updateDeckToggleButtons();
  window.updateDeckLoadButtonsVisuals();

  // Redraw waveforms
  setTimeout(() => {
    if (window.decks) {
      if (window.decks['deck-a']) window.decks['deck-a']._drawWaveform();
      if (window.decks['deck-b']) window.decks['deck-b']._drawWaveform();
      if (isC && isVisible && window.decks['deck-c']) window.decks['deck-c']._drawWaveform();
      if (!isC && isVisible && window.decks['deck-d']) window.decks['deck-d']._drawWaveform();
    }
  }, 100);
};

window._updateDeckToggleButtons = () => {
  const isCHidden = document.body.classList.contains('deck-c-hidden');
  const isDHidden = document.body.classList.contains('deck-d-hidden');

  const btnHdrC = document.getElementById('btn-toggle-deck-c');
  const btnHdrD = document.getElementById('btn-toggle-deck-d');
  const btnMixerC = document.getElementById('btn-mixer-toggle-c');
  const btnMixerD = document.getElementById('btn-mixer-toggle-d');

  if (btnHdrC) {
    btnHdrC.classList.toggle('off', isCHidden);
    btnHdrC.classList.toggle('active', !isCHidden);
    btnHdrC.innerHTML = isCHidden ? '🎛️ DECK C: <span style="color:#ef4444;">AUS</span>' : '🎛️ DECK C: <span style="color:#ff6b35;">AN</span>';
  }
  if (btnHdrD) {
    btnHdrD.classList.toggle('off', isDHidden);
    btnHdrD.classList.toggle('active', !isDHidden);
    btnHdrD.innerHTML = isDHidden ? '🎛️ DECK D: <span style="color:#ef4444;">AUS</span>' : '🎛️ DECK D: <span style="color:#a855f7;">AN</span>';
  }

  if (btnMixerC) {
    btnMixerC.classList.toggle('off', isCHidden);
    btnMixerC.textContent = isCHidden ? '➕ C EINBLENDEN' : '➖ C AUSBLENDEN';
  }
  if (btnMixerD) {
    btnMixerD.classList.toggle('off', isDHidden);
    btnMixerD.textContent = isDHidden ? '➕ D EINBLENDEN' : '➖ D AUSBLENDEN';
  }

  // Update mixer title / subtitle
  const lblMixerSub = document.getElementById('lbl-mixer-sub');
  if (lblMixerSub) {
    if (isCHidden && isDHidden) {
      lblMixerSub.textContent = '(2 KANÄLE: A & B)';
    } else if (isCHidden) {
      lblMixerSub.textContent = '(3 KANÄLE: A, B, D)';
    } else if (isDHidden) {
      lblMixerSub.textContent = '(3 KANÄLE: A, B, C)';
    } else {
      lblMixerSub.textContent = '(4 KANÄLE: A/B/C/D)';
    }
  }

  // Update master waveform select options
  const selTop = document.getElementById('monitor-select-top');
  if (selTop) {
    const optC = selTop.querySelector('option[value="deck-c"]');
    if (optC) optC.textContent = isCHidden ? 'DECK C (Ausgeblendet)' : 'DECK C (Orange)';
    if (isCHidden && selTop.value === 'deck-c') {
      selTop.value = 'deck-a';
      if (window.traktorMonitor) window.traktorMonitor.activeTopDeck = 'deck-a';
    }
  }

  const selBottom = document.getElementById('monitor-select-bottom');
  if (selBottom) {
    const optD = selBottom.querySelector('option[value="deck-d"]');
    if (optD) optD.textContent = isDHidden ? 'DECK D (Ausgeblendet)' : 'DECK D (Lila)';
    if (isDHidden && selBottom.value === 'deck-d') {
      selBottom.value = 'deck-b';
      if (window.traktorMonitor) window.traktorMonitor.activeBottomDeck = 'deck-b';
    }
  }
};

window.updateDeckLoadButtonsVisuals = () => {
  const isCHidden = window.isDeckHidden('deck-c');
  const isDHidden = window.isDeckHidden('deck-d');

  // In Library Table
  document.querySelectorAll('.btn-load-deck.load-c').forEach(btn => {
    btn.classList.toggle('deck-hidden-btn', isCHidden);
    btn.title = isCHidden ? '⚠️ Deck C ist aktuell ausgeblendet! (Klicken zum Einblenden)' : 'In Deck C laden';
    btn.textContent = isCHidden ? 'LOAD C ✖' : 'LOAD C';
  });
  document.querySelectorAll('.btn-load-deck.load-d').forEach(btn => {
    btn.classList.toggle('deck-hidden-btn', isDHidden);
    btn.title = isDHidden ? '⚠️ Deck D ist aktuell ausgeblendet! (Klicken zum Einblenden)' : 'In Deck D laden';
    btn.textContent = isDHidden ? 'LOAD D ✖' : 'LOAD D';
  });

  // In Sample Vault
  document.querySelectorAll('.btn-load-sample.load-c').forEach(btn => {
    btn.classList.toggle('deck-hidden-btn', isCHidden);
    btn.title = isCHidden ? '⚠️ Deck C ist aktuell ausgeblendet! (Klicken zum Einblenden)' : 'In Deck C laden';
  });
  document.querySelectorAll('.btn-load-sample.load-d').forEach(btn => {
    btn.classList.toggle('deck-hidden-btn', isDHidden);
    btn.title = isDHidden ? '⚠️ Deck D ist aktuell ausgeblendet! (Klicken zum Einblenden)' : 'In Deck D laden';
  });
};

window.initDeckLayoutMode = () => {
  const isCHidden = localStorage.getItem('ist_mix_deck_c_hidden') === '1';
  const isDHidden = localStorage.getItem('ist_mix_deck_d_hidden') === '1';

  document.body.classList.toggle('deck-c-hidden', isCHidden);
  document.body.classList.toggle('deck-d-hidden', isDHidden);

  const btnHdrC = document.getElementById('btn-toggle-deck-c');
  const btnHdrD = document.getElementById('btn-toggle-deck-d');
  const btnMixerC = document.getElementById('btn-mixer-toggle-c');
  const btnMixerD = document.getElementById('btn-mixer-toggle-d');

  if (btnHdrC) {
    btnHdrC.addEventListener('click', () => {
      const nowHidden = document.body.classList.contains('deck-c-hidden');
      window.setDeckVisibility('deck-c', nowHidden);
    });
  }

  if (btnHdrD) {
    btnHdrD.addEventListener('click', () => {
      const nowHidden = document.body.classList.contains('deck-d-hidden');
      window.setDeckVisibility('deck-d', nowHidden);
    });
  }

  if (btnMixerC) {
    btnMixerC.addEventListener('click', () => {
      const nowHidden = document.body.classList.contains('deck-c-hidden');
      window.setDeckVisibility('deck-c', nowHidden);
    });
  }

  if (btnMixerD) {
    btnMixerD.addEventListener('click', () => {
      const nowHidden = document.body.classList.contains('deck-d-hidden');
      window.setDeckVisibility('deck-d', nowHidden);
    });
  }

  window._updateDeckToggleButtons();
  window.updateDeckLoadButtonsVisuals();
};
