/**
 * Ist_Mix_Musik - Professional Vocal & Mic Studio
 * Dedicated microphone channel strip with Solo, Mute, 3-Band EQ, Echo, Reverb, and Fader.
 */

class VocalStudio {
  constructor() {
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;

    this.vocalTakes = [];
    this.sourceNodes = {};

    this.isSolo = false;
    this.isMute = false;
    this.faderVolume = 1.0;

    // Audio Graph Nodes
    this.micPreGain = null;
    this.eqLow = null;
    this.eqMid = null;
    this.eqHigh = null;
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayGain = null;
    this.channelFader = null;
    this.analyser = null;

    // UI elements
    this.btnRecord = document.getElementById('btn-mic-record');
    this.lblStatus = document.getElementById('mic-status-text');
    this.canvasVis = document.getElementById('mic-visualizer');
    this.canvasCtx = this.canvasVis ? this.canvasVis.getContext('2d') : null;
    this.takesContainer = document.getElementById('vocal-takes-list');

    this._setupVocalGraph();
    this._attachEvents();
  }

  _setupVocalGraph() {
    const ctx = window.audioEngine.ctx;
    if (!ctx) return;

    this.micPreGain = ctx.createGain();
    this.micPreGain.gain.value = 1.0;

    // 3-Band Vocal EQ
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 200;
    this.eqLow.gain.value = 0;

    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1800;
    this.eqMid.Q.value = 1.2;
    this.eqMid.gain.value = 0;

    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 5000;
    this.eqHigh.gain.value = 0;

    // Echo / Delay FX Loop
    this.delayNode = ctx.createDelay();
    this.delayNode.delayTime.value = 0.32;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.35;
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.0; // dry by default

    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayGain);

    // Channel Fader
    this.channelFader = ctx.createGain();
    this.channelFader.gain.value = 1.0;

    // Analyser for Mic VU
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 64;

    // Routing: PreGain -> EQLow -> EQMid -> EQHigh -> Fader -> Analyser -> MicBus
    this.micPreGain.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);

    // Send to dry and wet delay
    this.eqHigh.connect(this.channelFader);
    this.eqHigh.connect(this.delayNode);
    this.delayGain.connect(this.channelFader);

    this.channelFader.connect(this.analyser);
    this.analyser.connect(window.audioEngine.micGain);
  }

  _attachEvents() {
    if (this.btnRecord) {
      this.btnRecord.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.toggleRecord();
      });
    }

    // Vocal Solo & Mute
    const btnSolo = document.getElementById('mic-solo');
    if (btnSolo) {
      btnSolo.addEventListener('click', () => {
        this.isSolo = !this.isSolo;
        btnSolo.classList.toggle('active', this.isSolo);
        this.updateGain();
      });
    }

    const btnMute = document.getElementById('mic-mute');
    if (btnMute) {
      btnMute.addEventListener('click', () => {
        this.isMute = !this.isMute;
        btnMute.classList.toggle('active', this.isMute);
        this.updateGain();
      });
    }

    // Vocal Fader
    const fader = document.getElementById('mic-fader');
    if (fader) {
      fader.addEventListener('input', (e) => {
        this.faderVolume = parseFloat(e.target.value);
        this.updateGain();
      });
    }

    // Vocal EQ Knobs
    ['low', 'mid', 'high'].forEach((band) => {
      const knob = document.getElementById(`mic-eq-${band}`);
      if (knob) {
        knob.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          const t = window.audioEngine.ctx.currentTime;
          if (band === 'low') this.eqLow.gain.setTargetAtTime(val, t, 0.02);
          if (band === 'mid') this.eqMid.gain.setTargetAtTime(val, t, 0.02);
          if (band === 'high') this.eqHigh.gain.setTargetAtTime(val, t, 0.02);
        });
      }
    });

    // Vocal Echo Slider
    const echoSlider = document.getElementById('mic-echo-slider');
    if (echoSlider) {
      echoSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.delayGain && window.audioEngine.ctx) {
          this.delayGain.gain.setTargetAtTime(val, window.audioEngine.ctx.currentTime, 0.02);
        }
      });
    }
  }

  updateGain() {
    const ctx = window.audioEngine.ctx;
    if (!ctx || !this.channelFader) return;

    let eff = this.faderVolume;
    if (this.isMute) {
      eff = 0.0;
    }
    this.channelFader.gain.setTargetAtTime(eff, ctx.currentTime, 0.02);
  }

  async initMicStream() {
    if (this.mediaStream) return true;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: true
        }
      });

      const ctx = window.audioEngine.ctx;
      const micSource = ctx.createMediaStreamSource(this.mediaStream);

      // Connect into vocal audio chain
      micSource.connect(this.micPreGain);

      this._startVisualizer();
      return true;
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Mikrofon-Zugriff fehlgeschlagen: Bitte erlaube Mikrofon-Berechtigungen im Browser!');
      return false;
    }
  }

  async toggleRecord() {
    if (this.isRecording) {
      this.stopRecord();
    } else {
      await this.startRecord();
    }
  }

  async startRecord() {
    const streamReady = await this.initMicStream();
    if (!streamReady) return;

    this.recordedChunks = [];
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType });

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = async () => {
      const blob = new Blob(this.recordedChunks, { type: mimeType });
      await this._addVocalTake(blob);
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;

    if (this.btnRecord) {
      this.btnRecord.classList.add('recording');
      this.btnRecord.textContent = '⏹';
    }
    if (this.lblStatus) {
      this.lblStatus.textContent = 'Aufnahme läuft... Sprich oder singe jetzt!';
      this.lblStatus.style.color = '#ff0055';
    }
  }

  stopRecord() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.isRecording = false;

    if (this.btnRecord) {
      this.btnRecord.classList.remove('recording');
      this.btnRecord.textContent = '🎤';
    }
    if (this.lblStatus) {
      this.lblStatus.textContent = 'Aufnahme beendet & zur Gesangs-Bibliothek hinzugefügt!';
      this.lblStatus.style.color = '#00ff88';
    }
  }

  async _addVocalTake(blob) {
    const ctx = window.audioEngine.ctx;
    const arrayBuffer = await blob.arrayBuffer();
    try {
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const takeId = 'take_' + Date.now();
      const takeNum = this.vocalTakes.length + 1;
      const take = {
        id: takeId,
        blob: blob,
        buffer: audioBuffer,
        name: `Vocal Take #${takeNum}`,
        duration: audioBuffer.duration,
        isPlaying: false
      };
      this.vocalTakes.push(take);
      this._renderTakesList();
    } catch (e) {
      console.error('Error decoding vocal take:', e);
    }
  }

  _renderTakesList() {
    if (!this.takesContainer) return;
    this.takesContainer.innerHTML = '';

    this.vocalTakes.forEach((take) => {
      const item = document.createElement('div');
      item.className = 'vocal-take-item';
      const durSec = Math.round(take.duration);

      item.innerHTML = `
        <span style="font-weight:bold; font-size:12px;">${take.name} (${durSec}s)</span>
        <div style="display:flex; gap:6px;">
          <button id="play-${take.id}" style="background:#10b981; color:#fff; border:none; padding:4px 10px; border-radius:4px; font-weight:bold; cursor:pointer;">
            ${take.isPlaying ? '⏹ STOP' : '▶ PLAY'}
          </button>
          <button id="del-${take.id}" style="background:#334155; color:#ef4444; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">
            🗑️
          </button>
        </div>
      `;

      this.takesContainer.appendChild(item);

      item.querySelector(`#play-${take.id}`).addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.togglePlayTake(take);
      });

      item.querySelector(`#del-${take.id}`).addEventListener('click', () => {
        this.deleteTake(take.id);
      });
    });
  }

  togglePlayTake(take) {
    if (take.isPlaying) {
      if (this.sourceNodes[take.id]) {
        try { this.sourceNodes[take.id].stop(); } catch (e) {}
        this.sourceNodes[take.id] = null;
      }
      take.isPlaying = false;
      this._renderTakesList();
    } else {
      const ctx = window.audioEngine.ctx;
      const source = ctx.createBufferSource();
      source.buffer = take.buffer;
      source.connect(this.micPreGain); // Plays through vocal channel strip with EQ & Echo!
      source.start();
      take.isPlaying = true;
      this.sourceNodes[take.id] = source;
      this._renderTakesList();

      source.onended = () => {
        take.isPlaying = false;
        this.sourceNodes[take.id] = null;
        this._renderTakesList();
      };
    }
  }

  deleteTake(takeId) {
    if (this.sourceNodes[takeId]) {
      try { this.sourceNodes[takeId].stop(); } catch (e) {}
    }
    this.vocalTakes = this.vocalTakes.filter(t => t.id !== takeId);
    this._renderTakesList();
  }

  _startVisualizer() {
    if (!this.canvasVis || !this.analyser) return;
    const c = this.canvasCtx;
    const width = this.canvasVis.width = this.canvasVis.offsetWidth || 300;
    const height = this.canvasVis.height = 36;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const draw = () => {
      requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      c.fillStyle = '#080a0f';
      c.fillRect(0, 0, width, height);

      const barWidth = (width / dataArray.length) * 2;
      let x = 0;

      for (let i = 0; i < dataArray.length; i++) {
        const barHeight = (dataArray[i] / 255) * height;
        c.fillStyle = this.isRecording ? '#ff0055' : '#00f0ff';
        c.fillRect(x, height - barHeight, barWidth - 1, barHeight);
        x += barWidth;
      }
    };
    draw();
  }
}

window.initVocalStudio = () => {
  window.vocalStudio = new VocalStudio();
};
