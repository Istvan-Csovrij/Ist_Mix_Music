/**
 * Ist_Mix_Music - Audio Cutter & Permanent Sample Bank (Drop Vault)
 * Allows users to slice drops, effects, and vocals from library tracks or decks,
 * name them, save them permanently in IndexedDB, and trigger them live into the mix.
 */

// ==========================================
// 1. WAV ENCODER UTILITY (Lossless PCM WAV)
// ==========================================
function audioBufferToWav(buffer, opt = {}) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = opt.float32 ? 3 : 1;
  const bitDepth = format === 3 ? 32 : 16;

  let result;
  if (numChannels === 2) {
    result = interleaveWav(buffer.getChannelData(0), buffer.getChannelData(1));
  } else {
    result = buffer.getChannelData(0);
  }

  return encodeWAV(result, format, sampleRate, numChannels, bitDepth);
}

function encodeWAV(samples, format, sampleRate, numChannels, bitDepth) {
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, samples.length * bytesPerSample, true);

  if (format === 1) { // 16-bit PCM
    floatTo16BitPCM(view, 44, samples);
  } else {
    writeFloat32(view, 44, samples);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

function interleaveWav(inputL, inputR) {
  const length = inputL.length + inputR.length;
  const result = new Float32Array(length);
  let index = 0;
  let inputIndex = 0;
  while (index < length) {
    result[index++] = inputL[inputIndex];
    result[index++] = inputR[inputIndex];
    inputIndex++;
  }
  return result;
}

function writeFloat32(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 4) {
    output.setFloat32(offset, input[i], true);
  }
}

function floatTo16BitPCM(output, offset, input) {
  for (let i = 0; i < input.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function sliceAudioBuffer(ctx, sourceBuffer, startSec, endSec) {
  const sampleRate = sourceBuffer.sampleRate;
  const channels = sourceBuffer.numberOfChannels;
  const startFrame = Math.max(0, Math.floor(startSec * sampleRate));
  const endFrame = Math.min(sourceBuffer.length, Math.floor(endSec * sampleRate));
  const frameCount = Math.max(1, endFrame - startFrame);

  const newBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const channelData = sourceBuffer.getChannelData(ch).subarray(startFrame, endFrame);
    newBuffer.copyToChannel(channelData, ch, 0);
  }
  return newBuffer;
}

// ==========================================
// 2. PERMANENT SAMPLE STORAGE (IndexedDB v2)
// ==========================================
class SampleStorage {
  constructor() {
    this.dbName = 'IstMixMusicDB';
    this.dbVersion = 2;
    this.storeName = 'samples';
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('tracks')) {
          db.createObjectStore('tracks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('samples')) {
          db.createObjectStore('samples', { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => {
        console.warn('SampleStorage IndexedDB open error:', e);
        reject(e);
      };
    });
  }

  async getAll() {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('SampleStorage getAll error:', e);
      return [];
    }
  }

  async save(sampleData) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(sampleData);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('SampleStorage save error:', e);
    }
  }

  async delete(sampleId) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.delete(sampleId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('SampleStorage delete error:', e);
    }
  }
}

// ==========================================
// 3. AUDIO SLICER / WAVEFORM CUTTER MODAL
// ==========================================
class AudioSlicer {
  constructor(vault) {
    this.vault = vault;
    this.storage = vault.storage;

    this.currentTrack = null;
    this.currentBuffer = null;
    this.startSec = 0;
    this.endSec = 4;
    this.isPlaying = false;
    this.isLooping = false;
    this.previewSource = null;
    this.previewStartTime = 0;
    this.animId = null;

    // UI Elements
    this.modal = document.getElementById('cutter-modal');
    this.canvas = document.getElementById('cutter-canvas');
    this.ctx2d = this.canvas ? this.canvas.getContext('2d') : null;
    this.titleEl = document.getElementById('cutter-track-title');
    this.nameInput = document.getElementById('cutter-name-input');
    this.timeInEl = document.getElementById('cutter-time-in');
    this.timeOutEl = document.getElementById('cutter-time-out');
    this.durationBadge = document.getElementById('cutter-duration-badge');

    this.btnPlay = document.getElementById('cutter-btn-play');
    this.btnLoop = document.getElementById('cutter-btn-loop');
    this.btnSave = document.getElementById('cutter-btn-save');
    this.btnClose = document.getElementById('cutter-btn-close');

    // Dragging state on waveform
    this.isDraggingMarker = null; // 'in' or 'out'

    this._attachEvents();
  }

  _attachEvents() {
    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.btnPlay) {
      this.btnPlay.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.togglePlay();
      });
    }

    if (this.btnLoop) {
      this.btnLoop.addEventListener('click', () => {
        this.isLooping = !this.isLooping;
        this.btnLoop.classList.toggle('active', this.isLooping);
        if (this.isPlaying && this.previewSource) {
          this.previewSource.loop = this.isLooping;
        }
      });
    }

    if (this.btnSave) {
      this.btnSave.addEventListener('click', () => this.saveSample());
    }

    // Canvas click & drag for IN/OUT markers
    if (this.canvas) {
      const handleDown = (e) => {
        if (!this.currentBuffer) return;
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = clientX - rect.left;
        const totalW = rect.width;
        const clickSec = (x / totalW) * this.currentBuffer.duration;

        const distIn = Math.abs(clickSec - this.startSec);
        const distOut = Math.abs(clickSec - this.endSec);

        // Click near IN marker (within 15px equivalent)
        const thresholdSec = (15 / totalW) * this.currentBuffer.duration;
        if (distIn < thresholdSec) {
          this.isDraggingMarker = 'in';
        } else if (distOut < thresholdSec) {
          this.isDraggingMarker = 'out';
        } else {
          // If clicked before IN, move IN; if after OUT, move OUT; if inside, jump preview
          if (clickSec < this.startSec) {
            this.setRange(clickSec, this.endSec);
            this.isDraggingMarker = 'in';
          } else if (clickSec > this.endSec) {
            this.setRange(this.startSec, clickSec);
            this.isDraggingMarker = 'out';
          } else {
            // Clicked inside selection: move nearest marker
            if (distIn < distOut) {
              this.setRange(clickSec, this.endSec);
              this.isDraggingMarker = 'in';
            } else {
              this.setRange(this.startSec, clickSec);
              this.isDraggingMarker = 'out';
            }
          }
        }
      };

      const handleMove = (e) => {
        if (!this.isDraggingMarker || !this.currentBuffer) return;
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
        const currentSec = (x / rect.width) * this.currentBuffer.duration;

        if (this.isDraggingMarker === 'in') {
          const newIn = Math.min(currentSec, this.endSec - 0.05);
          this.setRange(newIn, this.endSec);
        } else if (this.isDraggingMarker === 'out') {
          const newOut = Math.max(currentSec, this.startSec + 0.05);
          this.setRange(this.startSec, newOut);
        }
      };

      const handleUp = () => {
        this.isDraggingMarker = null;
      };

      this.canvas.addEventListener('mousedown', handleDown);
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);

      this.canvas.addEventListener('touchstart', handleDown, { passive: true });
      window.addEventListener('touchmove', handleMove, { passive: true });
      window.addEventListener('touchend', handleUp);
    }

    // Fine tuning +/- buttons
    const bindFineTune = (id, delta, isStart) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', () => {
          if (!this.currentBuffer) return;
          if (isStart) {
            const next = Math.max(0, Math.min(this.endSec - 0.05, this.startSec + delta));
            this.setRange(next, this.endSec);
          } else {
            const next = Math.max(this.startSec + 0.05, Math.min(this.currentBuffer.duration, this.endSec + delta));
            this.setRange(this.startSec, next);
          }
        });
      }
    };

    bindFineTune('cutter-btn-in-minus', -0.05, true);
    bindFineTune('cutter-btn-in-plus', 0.05, true);
    bindFineTune('cutter-btn-out-minus', -0.05, false);
    bindFineTune('cutter-btn-out-plus', 0.05, false);

    // Quick Bar / Duration Presets (1s, 2s, 4s, 8s, 1 Beat, 1 Bar)
    document.querySelectorAll('.btn-cutter-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!this.currentBuffer) return;
        const preset = btn.dataset.preset;
        let duration = 2.0;

        if (preset === '1s') duration = 1.0;
        else if (preset === '2s') duration = 2.0;
        else if (preset === '4s') duration = 4.0;
        else if (preset === '8s') duration = 8.0;
        else if (preset === '1beat') {
          const bpm = window.audioEngine.bpm || 120;
          duration = 60 / bpm;
        } else if (preset === '1bar') {
          const bpm = window.audioEngine.bpm || 120;
          duration = (60 / bpm) * 4;
        }

        const newOut = Math.min(this.currentBuffer.duration, this.startSec + duration);
        this.setRange(this.startSec, newOut);
      });
    });
  }

  async openForTrack(track) {
    if (!track) return;
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    // Decode buffer if not yet cached
    if (!track.buffer && (track.blob || track.file)) {
      try {
        const data = track.blob || track.file;
        const arrayBuffer = await data.arrayBuffer();
        track.buffer = await ctx.decodeAudioData(arrayBuffer);
      } catch (err) {
        alert('Konnte Track nicht für Cutter laden: ' + err.message);
        return;
      }
    }

    if (!track.buffer) {
      alert('Dieser Track hat keine Audiodaten!');
      return;
    }

    this.currentTrack = track;
    this.currentBuffer = track.buffer;

    const baseName = track.name.replace(/\.[^/.]+$/, '');
    const sampleNum = this.vault.samples.length + 1;
    if (this.nameInput) {
      this.nameInput.value = `${baseName}_Drop${sampleNum}`;
    }

    // Default range: 0.0s to min(4.0s, duration)
    const initialDuration = Math.min(this.currentBuffer.duration, 4.0);
    this.setRange(0, initialDuration);

    this.show();
  }

  openForDeck(deckId) {
    const deck = window.decks ? window.decks[deckId] : null;
    if (!deck || !deck.audioBuffer) {
      alert(`Auf ${deckId.toUpperCase()} ist momentan kein Track geladen! Lade zuerst einen Song in das Deck.`);
      return;
    }

    window.audioEngine.unlockAudio();
    this.currentTrack = {
      id: 'deck_' + deckId,
      name: (deck.trackNameEl ? deck.trackNameEl.textContent : deckId).split(' (')[0]
    };
    this.currentBuffer = deck.audioBuffer;

    const deckCurrentTime = Math.max(0, deck.getCurrentTime ? deck.getCurrentTime() : 0);
    const initialDuration = Math.min(this.currentBuffer.duration - deckCurrentTime, 4.0);
    const start = Math.min(deckCurrentTime, Math.max(0, this.currentBuffer.duration - 0.5));
    const end = Math.min(this.currentBuffer.duration, start + (initialDuration > 0 ? initialDuration : 2.0));

    const sampleNum = this.vault.samples.length + 1;
    if (this.nameInput) {
      this.nameInput.value = `Deck_${deckId.slice(-1).toUpperCase()}_Drop${sampleNum}`;
    }

    this.setRange(start, end);
    this.show();
  }

  show() {
    if (!this.modal) return;
    this.modal.classList.remove('hidden');
    if (this.titleEl && this.currentTrack) {
      this.titleEl.textContent = this.currentTrack.name;
    }
    this.resizeCanvas();
    this.drawWaveform();
  }

  close() {
    this.stopSelection();
    if (this.modal) {
      this.modal.classList.add('hidden');
    }
  }

  setRange(start, end) {
    if (!this.currentBuffer) return;
    this.startSec = Math.max(0, Math.min(start, this.currentBuffer.duration - 0.05));
    this.endSec = Math.max(this.startSec + 0.05, Math.min(end, this.currentBuffer.duration));

    this.updateTimeDisplay();
    this.drawWaveform();

    // If currently playing, restart loop from new bounds
    if (this.isPlaying) {
      this.playSelection();
    }
  }

  formatTime(sec) {
    const mins = Math.floor(sec / 60);
    const remSec = (sec % 60).toFixed(2);
    return `${mins < 10 ? '0' : ''}${mins}:${remSec < 10 ? '0' : ''}${remSec}`;
  }

  updateTimeDisplay() {
    const dur = Math.max(0, this.endSec - this.startSec);
    if (this.timeInEl) this.timeInEl.textContent = this.formatTime(this.startSec);
    if (this.timeOutEl) this.timeOutEl.textContent = this.formatTime(this.endSec);
    if (this.durationBadge) {
      this.durationBadge.textContent = `${dur.toFixed(2)}s`;
    }
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = 140 * (window.devicePixelRatio || 1);
  }

  drawWaveform() {
    if (!this.canvas || !this.ctx2d || !this.currentBuffer) return;
    const ctx = this.ctx2d;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const totalDuration = this.currentBuffer.duration;

    ctx.clearRect(0, 0, w, h);

    // Dark grid background
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, w, h);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    // Draw full track waveform peaks
    const channelData = this.currentBuffer.getChannelData(0);
    const step = Math.ceil(channelData.length / w);
    const amp = h / 2;

    // Dim waveform for non-selected regions
    ctx.fillStyle = '#1e293b';
    for (let x = 0; x < w; x++) {
      let min = 1.0;
      let max = -1.0;
      const startIdx = x * step;
      for (let j = 0; j < step; j += 4) {
        const val = channelData[startIdx + j] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }
      ctx.fillRect(x, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }

    // Highlighted selected region
    const inX = (this.startSec / totalDuration) * w;
    const outX = (this.endSec / totalDuration) * w;
    const selWidth = Math.max(2, outX - inX);

    // Selection background tint
    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
    ctx.fillRect(inX, 0, selWidth, h);

    // Bright colored waveform inside selection
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#00f0ff');
    grad.addColorStop(0.5, '#00e676');
    grad.addColorStop(1, '#ff007f');
    ctx.fillStyle = grad;

    for (let x = Math.floor(inX); x <= Math.ceil(outX); x++) {
      let min = 1.0;
      let max = -1.0;
      const startIdx = x * step;
      for (let j = 0; j < step; j += 4) {
        const val = channelData[startIdx + j] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }
      ctx.fillRect(x, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
    }

    // IN Boundary Marker (Neon Green)
    ctx.strokeStyle = '#00e676';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(inX, 0);
    ctx.lineTo(inX, h);
    ctx.stroke();

    // IN Marker Flag/Handle
    ctx.fillStyle = '#00e676';
    ctx.beginPath();
    ctx.moveTo(inX, 0);
    ctx.lineTo(inX + 16, 0);
    ctx.lineTo(inX, 16);
    ctx.closePath();
    ctx.fill();

    // OUT Boundary Marker (Neon Red / Pink)
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(outX, 0);
    ctx.lineTo(outX, h);
    ctx.stroke();

    // OUT Marker Flag/Handle
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.moveTo(outX, 0);
    ctx.lineTo(outX - 16, 0);
    ctx.lineTo(outX, 16);
    ctx.closePath();
    ctx.fill();

    // Playback needle if playing
    if (this.isPlaying && this.previewSource) {
      const now = window.audioEngine.ctx.currentTime;
      const elapsed = (now - this.previewStartTime);
      const selDur = (this.endSec - this.startSec);
      const currentPosSec = this.isLooping
        ? this.startSec + (elapsed % selDur)
        : Math.min(this.endSec, this.startSec + elapsed);

      const needleX = (currentPosSec / totalDuration) * w;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#00f0ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(needleX, 0);
      ctx.lineTo(needleX, h);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.stopSelection();
    } else {
      this.playSelection();
    }
  }

  playSelection() {
    this.stopSelection();
    if (!this.currentBuffer) return;

    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    this.previewSource = ctx.createBufferSource();
    this.previewSource.buffer = this.currentBuffer;

    const gain = ctx.createGain();
    gain.gain.value = 0.85;

    // Route to sampler gain so it respects sampler volume and master recording!
    this.previewSource.connect(gain);
    gain.connect(window.audioEngine.samplerGain || window.audioEngine.masterGain);

    const dur = Math.max(0.05, this.endSec - this.startSec);
    this.previewStartTime = ctx.currentTime;

    if (this.isLooping) {
      this.previewSource.loop = true;
      this.previewSource.loopStart = this.startSec;
      this.previewSource.loopEnd = this.endSec;
      this.previewSource.start(0, this.startSec);
    } else {
      this.previewSource.loop = false;
      this.previewSource.start(0, this.startSec, dur);
      this.previewSource.onended = () => {
        if (!this.isLooping) {
          this.stopSelection();
        }
      };
    }

    this.isPlaying = true;
    if (this.btnPlay) {
      this.btnPlay.textContent = '⏹ STOP';
      this.btnPlay.classList.add('playing');
    }

    const renderLoop = () => {
      if (!this.isPlaying) return;
      this.drawWaveform();
      this.animId = requestAnimationFrame(renderLoop);
    };
    this.animId = requestAnimationFrame(renderLoop);
  }

  stopSelection() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.previewSource) {
      try {
        this.previewSource.onended = null;
        this.previewSource.stop();
      } catch (e) {}
      this.previewSource = null;
    }
    this.isPlaying = false;
    if (this.btnPlay) {
      this.btnPlay.textContent = '▶ AUSWAHL TESTEN';
      this.btnPlay.classList.remove('playing');
    }
    this.drawWaveform();
  }

  async saveSample() {
    if (!this.currentBuffer) return;
    const dur = this.endSec - this.startSec;
    if (dur <= 0.02) {
      alert('Der gewählte Bereich ist zu kurz!');
      return;
    }

    const rawName = this.nameInput ? this.nameInput.value.trim() : '';
    const sampleName = rawName || `Sample_${Date.now().toString().slice(-4)}`;

    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    // Slicing buffer
    const slicedBuffer = sliceAudioBuffer(ctx, this.currentBuffer, this.startSec, this.endSec);

    // Convert to WAV Blob
    const wavBlob = audioBufferToWav(slicedBuffer);

    const mins = Math.floor(dur / 60);
    const secs = (dur % 60).toFixed(1);
    const durationStr = mins > 0 ? `${mins}:${secs < 10 ? '0' : ''}${secs}` : `${secs}s`;

    const sampleObj = {
      id: 'sample_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: sampleName,
      sourceTrackName: this.currentTrack ? this.currentTrack.name : 'Unbekannt',
      startSec: this.startSec,
      endSec: this.endSec,
      duration: dur,
      durationStr: durationStr,
      blob: wavBlob,
      createdAt: Date.now()
    };

    // Save in IndexedDB
    await this.storage.save(sampleObj);

    // Add into Vault memory and re-render
    sampleObj.buffer = slicedBuffer;
    this.vault.addSample(sampleObj);

    this.close();

    // Automatically expand and show Sample Bank
    this.vault.show();
  }
}

// ==========================================
// 4. SAMPLE VAULT / DROP BANK CONTROLLER
// ==========================================
class SampleVault {
  constructor() {
    this.storage = new SampleStorage();
    this.samples = []; // Array of { id, name, sourceTrackName, duration, durationStr, blob, buffer }
    this.slicer = new AudioSlicer(this);

    // UI Elements
    this.section = document.getElementById('sample-vault-section');
    this.btnToggle = document.getElementById('btn-toggle-samples');
    this.btnClose = document.getElementById('btn-close-samples');
    this.grid = document.getElementById('samples-grid');
    this.badgeCount = document.getElementById('samples-count');
    this.volSlider = document.getElementById('sampler-vol-slider');
    this.volDisplay = document.getElementById('sampler-vol-display');
    this.searchInput = document.getElementById('samples-search-input');

    this._attachEvents();
    this.initStorage();
  }

  _attachEvents() {
    if (this.btnToggle && this.section) {
      this.btnToggle.addEventListener('click', () => {
        const isHidden = this.section.classList.toggle('hidden');
        this.btnToggle.classList.toggle('active', !isHidden);
        if (!isHidden) {
          this.section.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    if (this.btnClose && this.section) {
      this.btnClose.addEventListener('click', () => {
        this.section.classList.add('hidden');
        if (this.btnToggle) this.btnToggle.classList.remove('active');
      });
    }

    if (this.volSlider) {
      this.volSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.volDisplay) this.volDisplay.textContent = `${Math.round(val * 100)}%`;
        if (window.audioEngine) {
          window.audioEngine.setSamplerVolume(val);
        }
      });
    }

    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.filter(e.target.value);
      });
    }

    // Cut from Deck Quick Selector
    const btnCutDeck = document.getElementById('btn-cut-from-deck');
    const selectDeck = document.getElementById('select-cut-deck');
    if (btnCutDeck && selectDeck) {
      btnCutDeck.addEventListener('click', () => {
        const deckId = selectDeck.value;
        this.slicer.openForDeck(deckId);
      });
    }
  }

  show() {
    if (this.section) {
      this.section.classList.remove('hidden');
      if (this.btnToggle) this.btnToggle.classList.add('active');
      this.section.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async initStorage() {
    const saved = await this.storage.getAll();
    if (saved && saved.length > 0) {
      this.samples = saved;
      this.updateUI();
      console.log(`Restored ${saved.length} samples from permanent storage.`);
    } else {
      this.updateUI();
    }
  }

  addSample(sampleObj) {
    this.samples.unshift(sampleObj);
    this.updateUI();
  }

  async removeSample(sampleId) {
    this.samples = this.samples.filter(s => s.id !== sampleId);
    await this.storage.delete(sampleId);
    this.updateUI();
  }

  updateUI() {
    if (this.badgeCount) {
      this.badgeCount.textContent = this.samples.length;
    }
    this.render();
  }

  render(filteredList = null) {
    if (!this.grid) return;
    const list = filteredList || this.samples;

    if (list.length === 0) {
      this.grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:32px 16px; color:var(--text-dim); background:rgba(0,0,0,0.25); border-radius:8px; border:1px dashed var(--border-color);">
          <div style="font-size:32px; margin-bottom:8px;">✂️</div>
          <div style="font-size:14px; font-weight:700; color:#fff; margin-bottom:4px;">Noch keine Samples oder Drops gespeichert!</div>
          <div style="font-size:11px;">
            Öffne deine <strong>MEINE MUSIKLISTE</strong> und klicke bei einem Track auf <strong>"✂️ CUT"</strong>,<br>
            oder schneide direkt eine Stelle aus einem laufenden Deck (A, B, C, D) heraus.
          </div>
        </div>
      `;
      return;
    }

    this.grid.innerHTML = '';
    list.forEach((sample) => {
      const card = document.createElement('div');
      card.className = 'sample-card';
      card.id = `card-${sample.id}`;

      card.innerHTML = `
        <div class="sample-pad" id="pad-${sample.id}" title="Klicken, um Sample live in den Mix abzufeuern">
          <div class="pad-icon">🔊</div>
          <div class="pad-title">${sample.name}</div>
          <div class="pad-dur">${sample.durationStr}</div>
          <div class="pad-action-hint">FIRE DROP</div>
        </div>

        <div class="sample-info-strip">
          <span class="sample-source-title" title="${sample.sourceTrackName}">${sample.sourceTrackName}</span>
        </div>

        <div class="sample-deck-loads">
          <span style="font-size:9px; color:var(--text-dim); margin-right:2px;">DECK:</span>
          <button class="btn-load-sample load-a" data-id="${sample.id}" data-deck="deck-a" title="In Deck A laden">A</button>
          <button class="btn-load-sample load-b" data-id="${sample.id}" data-deck="deck-b" title="In Deck B laden">B</button>
          <button class="btn-load-sample load-c" data-id="${sample.id}" data-deck="deck-c" title="In Deck C laden">C</button>
          <button class="btn-load-sample load-d" data-id="${sample.id}" data-deck="deck-d" title="In Deck D laden">D</button>
          
          <button class="btn-sample-download" data-id="${sample.id}" title="Als WAV herunterladen">💾</button>
          <button class="btn-sample-del" data-id="${sample.id}" title="Löschen">🗑️</button>
        </div>
      `;

      // Big Live Trigger Pad Event
      const pad = card.querySelector(`#pad-${sample.id}`);
      pad.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.triggerSample(sample, pad);
      });

      // Deck loading buttons
      card.querySelectorAll('.btn-load-sample').forEach((btn) => {
        btn.addEventListener('click', () => {
          this.loadSampleToDeck(sample, btn.dataset.deck);
        });
      });

      // WAV Download
      card.querySelector('.btn-sample-download').addEventListener('click', () => {
        this.downloadSample(sample);
      });

      // Delete
      card.querySelector('.btn-sample-del').addEventListener('click', () => {
        this.removeSample(sample.id);
      });

      this.grid.appendChild(card);
    });
  }

  async triggerSample(sample, padEl) {
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    // Decode on demand if buffer is not in memory
    if (!sample.buffer && sample.blob) {
      try {
        const ab = await sample.blob.arrayBuffer();
        sample.buffer = await ctx.decodeAudioData(ab);
      } catch (e) {
        console.error('Error decoding sample:', e);
        return;
      }
    }

    if (!sample.buffer) return;

    // Create polyphonic one-shot node
    const src = ctx.createBufferSource();
    src.buffer = sample.buffer;

    const gain = ctx.createGain();
    gain.gain.value = 1.0;

    src.connect(gain);
    gain.connect(window.audioEngine.samplerGain || window.audioEngine.masterGain);

    src.start(0);

    // Visual trigger pulse animation on the pad
    if (padEl) {
      padEl.classList.remove('fired');
      void padEl.offsetWidth; // trigger reflow
      padEl.classList.add('fired');
      setTimeout(() => {
        padEl.classList.remove('fired');
      }, Math.min(sample.duration * 1000, 400));
    }
  }

  async loadSampleToDeck(sample, deckId) {
    if (!window.decks || !window.decks[deckId]) return;
    const deck = window.decks[deckId];

    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    // Decode if needed
    if (!sample.buffer && sample.blob) {
      try {
        const ab = await sample.blob.arrayBuffer();
        sample.buffer = await ctx.decodeAudioData(ab);
      } catch (e) {
        alert('Konnte Sample nicht laden: ' + e.message);
        return;
      }
    }

    if (!sample.buffer) return;

    deck.audioBuffer = sample.buffer;
    deck.pauseOffset = 0;
    deck.stop();

    if (deck.trackNameEl) {
      deck.trackNameEl.textContent = `[SAMPLE] ${sample.name} (${sample.durationStr})`;
    }

    deck._drawWaveform();
    deck.updateTimeDisplay();

    // Visual feedback
    const badge = document.querySelector(`.deck-${deckId.split('-')[1]} .deck-badge`);
    if (badge) {
      badge.style.transform = 'scale(1.25)';
      setTimeout(() => badge.style.transform = '', 300);
    }
  }

  downloadSample(sample) {
    if (!sample.blob) return;
    const url = URL.createObjectURL(sample.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sample.name}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  filter(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.render();
      return;
    }
    const filtered = this.samples.filter(s =>
      s.name.toLowerCase().includes(q) || s.sourceTrackName.toLowerCase().includes(q)
    );
    this.render(filtered);
  }
}

// Global initialization
window.initSampleCutter = () => {
  window.sampleVault = new SampleVault();
  window.sampleCutter = window.sampleVault.slicer;
};
