/**
 * Ist_Mix_Musik - DJ Decks & Crossfader Controller
 * Manages Deck A & Deck B, audio file decoding, waveform visualization, 3-band EQ, and crossfader.
 */

class DJDeck {
  constructor(deckId, busNode, accentColor) {
    this.deckId = deckId;
    this.busNode = busNode;
    this.accentColor = accentColor;

    this.audioBuffer = null;
    this.sourceNode = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseOffset = 0;

    // EQ Filter Nodes
    this.lowFilter = null;
    this.midFilter = null;
    this.highFilter = null;
    this.deckGain = null;

    // UI Elements
    this.canvas = document.getElementById(`${deckId}-waveform`);
    this.canvasCtx = this.canvas ? this.canvas.getContext('2d') : null;
    this.cursor = document.getElementById(`${deckId}-cursor`);
    this.btnPlay = document.getElementById(`${deckId}-play`);
    this.btnCue = document.getElementById(`${deckId}-cue`);
    this.trackNameEl = document.getElementById(`${deckId}-track-name`);

    this._setupAudioGraph();
    this._attachEvents();
  }

  _setupAudioGraph() {
    const ctx = window.audioEngine.ctx || new (window.AudioContext || window.webkitAudioContext)();
    
    // 3-Band EQ
    this.lowFilter = ctx.createBiquadFilter();
    this.lowFilter.type = 'lowshelf';
    this.lowFilter.frequency.value = 250;
    this.lowFilter.gain.value = 0;

    this.midFilter = ctx.createBiquadFilter();
    this.midFilter.type = 'peaking';
    this.midFilter.frequency.value = 1000;
    this.midFilter.Q.value = 1.0;
    this.midFilter.gain.value = 0;

    this.highFilter = ctx.createBiquadFilter();
    this.highFilter.type = 'highshelf';
    this.highFilter.frequency.value = 4000;
    this.highFilter.gain.value = 0;

    this.deckGain = ctx.createGain();
    this.deckGain.gain.value = 1.0;

    // Connect chain: source -> low -> mid -> high -> deckGain -> busNode
    this.lowFilter.connect(this.midFilter);
    this.midFilter.connect(this.highFilter);
    this.highFilter.connect(this.deckGain);
    this.deckGain.connect(this.busNode);
  }

  _attachEvents() {
    // Play button
    if (this.btnPlay) {
      this.btnPlay.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.togglePlay();
      });
    }

    // Cue button (return to start & pause)
    if (this.btnCue) {
      this.btnCue.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.cue();
      });
    }

    // Waveform click / touch seeking
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

    // EQ Sliders
    const lowSlider = document.getElementById(`${this.deckId}-eq-low`);
    if (lowSlider) {
      lowSlider.addEventListener('input', (e) => {
        this.lowFilter.gain.setTargetAtTime(parseFloat(e.target.value), window.audioEngine.ctx.currentTime, 0.02);
      });
    }

    const midSlider = document.getElementById(`${this.deckId}-eq-mid`);
    if (midSlider) {
      midSlider.addEventListener('input', (e) => {
        this.midFilter.gain.setTargetAtTime(parseFloat(e.target.value), window.audioEngine.ctx.currentTime, 0.02);
      });
    }

    const highSlider = document.getElementById(`${this.deckId}-eq-high`);
    if (highSlider) {
      highSlider.addEventListener('input', (e) => {
        this.highFilter.gain.setTargetAtTime(parseFloat(e.target.value), window.audioEngine.ctx.currentTime, 0.02);
      });
    }

    // File Input Uploader
    const fileInput = document.getElementById(`${this.deckId}-file-input`);
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          this.loadAudioFile(file);
        }
      });
    }
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
    } catch (err) {
      console.error('Error decoding audio file:', err);
      if (this.trackNameEl) {
        this.trackNameEl.textContent = 'Fehler beim Laden der Datei!';
      }
      alert(`Audio konnte nicht dekodiert werden: ${err.message}`);
    }
  }

  togglePlay() {
    if (!this.audioBuffer) {
      alert('Bitte lade zuerst eine Musikdatei in dieses Deck hoch!');
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
    this.sourceNode.connect(this.lowFilter);

    const offset = this.pauseOffset % this.audioBuffer.duration;
    this.startTime = ctx.currentTime - offset;

    this.sourceNode.start(0, offset);
    this.isPlaying = true;

    if (this.btnPlay) {
      this.btnPlay.textContent = '⏸ PAUSE';
      this.btnPlay.classList.add('playing');
    }

    this.sourceNode.onended = () => {
      if (this.isPlaying) {
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
    this.pauseOffset = ctx.currentTime - this.startTime;
    this.stop();
  }

  cue() {
    this.pauseOffset = 0;
    this.stop();
    if (this.cursor) this.cursor.style.left = '0%';
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
    if (wasPlaying) {
      this.stop();
    }
    this.pauseOffset = targetOffset;
    if (this.cursor) {
      this.cursor.style.left = `${ratio * 100}%`;
    }
    if (wasPlaying) {
      this.play();
    }
  }

  _startProgressLoop() {
    const update = () => {
      if (!this.isPlaying || !this.audioBuffer) return;
      const ctx = window.audioEngine.ctx;
      const currentPos = (ctx.currentTime - this.startTime) % this.audioBuffer.duration;
      const ratio = currentPos / this.audioBuffer.duration;
      if (this.cursor) {
        this.cursor.style.left = `${Math.min(100, ratio * 100)}%`;
      }
      requestAnimationFrame(update);
    };
    requestAnimationFrame(update);
  }

  _drawWaveform() {
    if (!this.canvas || !this.audioBuffer) return;
    const width = this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio || 600;
    const height = this.canvas.height = this.canvas.offsetHeight * window.devicePixelRatio || 120;
    const c = this.canvasCtx;
    const rawData = this.audioBuffer.getChannelData(0);
    const step = Math.ceil(rawData.length / width);
    const amp = height / 2;

    c.fillStyle = '#0a0c10';
    c.fillRect(0, 0, width, height);

    // Center guideline
    c.strokeStyle = '#1e2430';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, amp);
    c.lineTo(width, amp);
    c.stroke();

    // Waveform bars
    c.fillStyle = this.accentColor;
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = rawData[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      const y1 = (1 + min) * amp;
      const y2 = Math.max(y1 + 1, (1 + max) * amp);
      c.fillRect(i, y1, 1, y2 - y1);
    }
  }
}

/**
 * Manages the Crossfader between Deck A and Deck B
 */
class CrossfaderManager {
  constructor(deckA, deckB) {
    this.deckA = deckA;
    this.deckB = deckB;
    this.slider = document.getElementById('crossfader-slider');
    this.attach();
  }

  attach() {
    if (!this.slider) return;
    this.slider.addEventListener('input', (e) => {
      this.update(parseFloat(e.target.value));
    });
    this.update(0.5); // Default center
  }

  update(val) {
    // val is 0.0 (Deck A only) to 1.0 (Deck B only)
    // Constant power crossfade:
    // gainA = cos(val * 0.5 * PI)
    // gainB = sin(val * 0.5 * PI)
    const ctx = window.audioEngine.ctx;
    if (!ctx) return;

    const angle = val * 0.5 * Math.PI;
    const gainA = Math.cos(angle);
    const gainB = Math.sin(angle);

    window.audioEngine.deckAGain.gain.setTargetAtTime(gainA, ctx.currentTime, 0.02);
    window.audioEngine.deckBGain.gain.setTargetAtTime(gainB, ctx.currentTime, 0.02);
  }
}

window.initDecks = () => {
  window.audioEngine.init();
  const deckA = new DJDeck('deck-a', window.audioEngine.deckAGain, '#00f0ff');
  const deckB = new DJDeck('deck-b', window.audioEngine.deckBGain, '#ff007f');
  const xfader = new CrossfaderManager(deckA, deckB);

  window.deckA = deckA;
  window.deckB = deckB;
  window.crossfader = xfader;
};
