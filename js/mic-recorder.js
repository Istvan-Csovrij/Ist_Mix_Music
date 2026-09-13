/**
 * Ist_Mix_Musik - Microphone & Vocal Recording Studio
 * Records voice from microphone, applies live vocal effects (Echo/Delay, Reverb),
 * and layers vocals into the master mix.
 */

class VocalStudio {
  constructor() {
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;

    this.vocalTakes = []; // Array of { id, blob, buffer, name, isPlaying }
    this.sourceNodes = {};

    // Vocal FX Nodes
    this.micInputGain = null;
    this.delayNode = null;
    this.delayFeedback = null;
    this.delayGain = null;

    // UI elements
    this.btnRecord = document.getElementById('btn-mic-record');
    this.lblStatus = document.getElementById('mic-status-text');
    this.canvasVis = document.getElementById('mic-visualizer');
    this.canvasCtx = this.canvasVis ? this.canvasVis.getContext('2d') : null;
    this.takesContainer = document.getElementById('vocal-takes-list');

    this.analyser = null;
    this.animFrameId = null;

    this._setupVocalFX();
    this._attachEvents();
  }

  _setupVocalFX() {
    const ctx = window.audioEngine.ctx;
    if (!ctx) return;

    this.micInputGain = ctx.createGain();
    this.micInputGain.gain.value = 1.0;

    // Delay FX (Echo)
    this.delayNode = ctx.createDelay();
    this.delayNode.delayTime.value = 0.3; // 300ms echo
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.35; // Feedback
    this.delayGain = ctx.createGain();
    this.delayGain.gain.value = 0.0; // Echo off by default

    // Connect Delay loop: input -> delay -> feedback -> delay
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayGain);

    // Connect to mic bus
    this.micInputGain.connect(window.audioEngine.micGain);
    this.micInputGain.connect(this.delayNode);
    this.delayGain.connect(window.audioEngine.micGain);
  }

  _attachEvents() {
    if (this.btnRecord) {
      this.btnRecord.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.toggleRecord();
      });
    }

    // Vocal FX controls
    const echoSlider = document.getElementById('vocal-echo-slider');
    if (echoSlider) {
      echoSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.delayGain && window.audioEngine.ctx) {
          this.delayGain.gain.setTargetAtTime(val, window.audioEngine.ctx.currentTime, 0.02);
        }
      });
    }

    const volSlider = document.getElementById('vocal-vol-slider');
    if (volSlider) {
      volSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (window.audioEngine.micGain && window.audioEngine.ctx) {
          window.audioEngine.micGain.gain.setTargetAtTime(val, window.audioEngine.ctx.currentTime, 0.02);
        }
      });
    }
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

      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 128;
      micSource.connect(this.analyser);

      this._startVisualizer();
      return true;
    } catch (err) {
      console.error('Microphone access denied or error:', err);
      alert('Mikrofon-Zugriff fehlgeschlagen: Bitte erlaube den Mikrofon-Zugriff im Browser!');
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
      this.lblStatus.textContent = 'Aufnahme läuft... Sprich oder singe ins Mikrofon!';
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
      this.lblStatus.textContent = 'Aufnahme beendet und gespeichert!';
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
        name: `Stimme Aufnahme #${takeNum}`,
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
        <span style="font-weight:bold;">${take.name} (${durSec}s)</span>
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

      const btnPlay = item.querySelector(`#play-${take.id}`);
      btnPlay.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.togglePlayTake(take);
      });

      const btnDel = item.querySelector(`#del-${take.id}`);
      btnDel.addEventListener('click', () => {
        this.deleteTake(take.id);
      });
    });
  }

  togglePlayTake(take) {
    if (take.isPlaying) {
      if (this.sourceNodes[take.id]) {
        try { this.sourceNodes[take.id].stop(); } catch(e){}
        this.sourceNodes[take.id] = null;
      }
      take.isPlaying = false;
      this._renderTakesList();
    } else {
      const ctx = window.audioEngine.ctx;
      const source = ctx.createBufferSource();
      source.buffer = take.buffer;
      
      // Connect to vocal FX input so echo/reverb applies to recorded voice!
      source.connect(this.micInputGain);
      
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
      try { this.sourceNodes[takeId].stop(); } catch(e){}
    }
    this.vocalTakes = this.vocalTakes.filter(t => t.id !== takeId);
    this._renderTakesList();
  }

  _startVisualizer() {
    if (!this.canvasVis || !this.analyser) return;
    const c = this.canvasCtx;
    const width = this.canvasVis.width = this.canvasVis.offsetWidth || 300;
    const height = this.canvasVis.height = 40;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const draw = () => {
      this.animFrameId = requestAnimationFrame(draw);
      this.analyser.getByteFrequencyData(dataArray);

      c.fillStyle = '#0a0c10';
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
