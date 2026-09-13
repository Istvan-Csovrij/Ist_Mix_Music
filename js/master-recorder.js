/**
 * Ist_Mix_Musik - Master Session Recorder & Exporter
 * Captures all live audio (DJ Decks, Mic Vocals, Beatmaker) into a single downloadable mix.
 */

class MasterRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.isRecording = false;
    this.recordStartTime = 0;
    this.timerIntervalId = null;

    this.btnRecord = document.getElementById('btn-rec-master');
    this.btnDownload = document.getElementById('btn-download-mix');
    this.lblTimer = document.getElementById('rec-timer');

    this.latestMixBlob = null;
    this.latestMixUrl = null;

    this._attachEvents();
  }

  _attachEvents() {
    if (this.btnRecord) {
      this.btnRecord.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.toggleRecording();
      });
    }

    if (this.btnDownload) {
      this.btnDownload.addEventListener('click', () => {
        this.downloadMix();
      });
    }
  }

  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  startRecording() {
    const stream = window.audioEngine.recordDestination.stream;
    if (!stream) {
      alert('Audio-System noch nicht bereit. Bitte klicke zuerst auf einen Beat oder Play.');
      return;
    }

    this.recordedChunks = [];
    let mimeType = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeType = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeType = 'audio/mp4';
    }

    try {
      this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    } catch (e) {
      this.mediaRecorder = new MediaRecorder(stream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const mime = this.mediaRecorder.mimeType || 'audio/webm';
      this.latestMixBlob = new Blob(this.recordedChunks, { type: mime });
      if (this.latestMixUrl) {
        URL.revokeObjectURL(this.latestMixUrl);
      }
      this.latestMixUrl = URL.createObjectURL(this.latestMixBlob);

      if (this.btnDownload) {
        this.btnDownload.style.display = 'inline-flex';
        this.btnDownload.textContent = '💾 Mix Herunterladen';
      }
    };

    this.mediaRecorder.start(100);
    this.isRecording = true;
    this.recordStartTime = Date.now();

    if (this.btnRecord) {
      this.btnRecord.classList.add('recording');
      this.btnRecord.innerHTML = '⏹ <span id="rec-timer">00:00</span> STOP';
      this.lblTimer = document.getElementById('rec-timer');
    }

    this.timerIntervalId = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - this.recordStartTime) / 1000);
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      const str = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
      if (this.lblTimer) {
        this.lblTimer.textContent = str;
      }
    }, 1000);
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.isRecording = false;

    if (this.timerIntervalId) {
      clearInterval(this.timerIntervalId);
      this.timerIntervalId = null;
    }

    if (this.btnRecord) {
      this.btnRecord.classList.remove('recording');
      this.btnRecord.innerHTML = '⏺ Mix Aufnehmen';
    }
  }

  downloadMix() {
    if (!this.latestMixBlob) {
      alert('Es wurde noch kein Mix aufgenommen.');
      return;
    }

    const dateStr = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const filename = `Ist_Mix_Musik_${dateStr}.webm`;

    const a = document.createElement('a');
    a.href = this.latestMixUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

window.initMasterRecorder = () => {
  window.masterRecorder = new MasterRecorder();
};
