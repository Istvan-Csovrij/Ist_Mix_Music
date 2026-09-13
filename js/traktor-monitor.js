/**
 * Ist_Mix_Music - Traktor Scrolling Master Waveform Monitor
 * Renders real-time scrolling multi-frequency waveforms with center red playhead,
 * beat-grid lines, and track info, matching Native Instruments Traktor DJ.
 */

class TraktorMasterMonitor {
  constructor() {
    this.canvas = document.getElementById('traktor-scrolling-canvas');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    // Track info elements
    this.topDeckA = document.getElementById('monitor-deck-top');
    this.topDeckB = document.getElementById('monitor-deck-bottom');

    this.activeTopDeck = 'deck-a';
    this.activeBottomDeck = 'deck-b';

    this.isRunning = false;
    this._attachEvents();
    this.startLoop();
  }

  _attachEvents() {
    // Deck switch selector for monitor
    const selTop = document.getElementById('monitor-select-top');
    if (selTop) {
      selTop.addEventListener('change', (e) => {
        this.activeTopDeck = e.target.value;
      });
    }
    const selBottom = document.getElementById('monitor-select-bottom');
    if (selBottom) {
      selBottom.addEventListener('change', (e) => {
        this.activeBottomDeck = e.target.value;
      });
    }

    // Touch / Click seeking on the scrolling waveform
    if (this.canvas) {
      const seek = (e) => {
        const rect = this.canvas.getBoundingClientRect();
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const isTop = (clientY - rect.top) < (rect.height / 2);
        const deckId = isTop ? this.activeTopDeck : this.activeBottomDeck;

        const deck = window.decks ? window.decks[deckId] : null;
        if (!deck || !deck.audioBuffer) return;

        // Shift relative to center: offset = (clientX - centerX) / pixelsPerSec
        const centerX = rect.width / 2;
        const deltaX = clientX - centerX;
        const timeDelta = deltaX / 60; // 60px = 1 second
        deck.seekRelative(timeDelta);
      };
      this.canvas.addEventListener('click', seek);
      this.canvas.addEventListener('touchstart', seek, { passive: true });
    }
  }

  startLoop() {
    if (this.isRunning) return;
    this.isRunning = true;

    const render = () => {
      this.draw();
      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  draw() {
    if (!this.canvas || !this.ctx) return;
    const c = this.ctx;
    const width = this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio || 800;
    const height = this.canvas.height = this.canvas.offsetHeight * window.devicePixelRatio || 140;

    const centerX = width / 2;
    const halfH = height / 2;

    // Dark sleek backdrop
    c.fillStyle = '#06070a';
    c.fillRect(0, 0, width, height);

    // Render Top Track (Deck A / C)
    const deck1 = window.decks ? window.decks[this.activeTopDeck] : null;
    this.drawDeckLane(c, deck1, 0, halfH, centerX, '#9d4edd', '#00f0ff');

    // Divider Line
    c.strokeStyle = '#181e2b';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, halfH);
    c.lineTo(width, halfH);
    c.stroke();

    // Render Bottom Track (Deck B / D)
    const deck2 = window.decks ? window.decks[this.activeBottomDeck] : null;
    this.drawDeckLane(c, deck2, halfH, halfH, centerX, '#00f0ff', '#ff007f');

    // Red Center Playhead Line (Exact Traktor DJ style)
    c.strokeStyle = '#ff0055';
    c.lineWidth = 2.5;
    c.shadowColor = '#ff0055';
    c.shadowBlur = 8;
    c.beginPath();
    c.moveTo(centerX, 0);
    c.lineTo(centerX, height);
    c.stroke();
    c.shadowBlur = 0; // reset
  }

  drawDeckLane(c, deck, startY, laneH, centerX, primaryColor, secondaryColor) {
    const centerY = startY + laneH / 2;
    const maxAmp = laneH * 0.44;

    if (!deck || !deck.audioBuffer) {
      // Idle grid line
      c.strokeStyle = '#11151f';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, centerY);
      c.lineTo(c.canvas.width, centerY);
      c.stroke();
      return;
    }

    const buffer = deck.audioBuffer;
    const channelData = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;
    const currentTime = deck.getCurrentTime();
    const bpm = window.audioEngine.bpm || 120;
    const beatDuration = 60.0 / bpm;

    // Visible time window: 60 pixels per second on screen
    const pxPerSec = 75;
    const timePerPx = 1.0 / pxPerSec;

    // 1. Draw Beat Grid Lines (vertical lines scrolling in time)
    c.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    c.lineWidth = 1;
    const firstBeatTime = Math.floor((currentTime - (centerX * timePerPx)) / beatDuration) * beatDuration;
    for (let bt = firstBeatTime; bt < currentTime + (centerX * timePerPx); bt += beatDuration) {
      const gx = centerX + (bt - currentTime) * pxPerSec;
      if (gx >= 0 && gx <= c.canvas.width) {
        c.beginPath();
        c.moveTo(gx, startY + 2);
        c.lineTo(gx, startY + laneH - 2);
        c.stroke();
      }
    }

    // 2. Draw Scrolling Spectral Waveform Bars
    const totalSamples = channelData.length;
    for (let x = 0; x < c.canvas.width; x += 2) {
      const t = currentTime + (x - centerX) * timePerPx;
      if (t < 0 || t >= buffer.duration) continue;

      const sampleIdx = Math.floor(t * sampleRate);
      if (sampleIdx < 0 || sampleIdx >= totalSamples) continue;

      let min = 1.0;
      let max = -1.0;
      const step = Math.max(1, Math.floor(sampleRate * timePerPx * 1.5));
      for (let s = 0; s < step; s += 2) {
        const val = channelData[sampleIdx + s] || 0;
        if (val < min) min = val;
        if (val > max) max = val;
      }

      const barHeight = Math.max(2, (max - min) * maxAmp);

      // Traktor Color Spectrum:
      // High transient peaks = White, Mids = Primary Deck Color, Lows = Deep Color
      if (barHeight > maxAmp * 0.85) {
        c.fillStyle = '#ffffff';
      } else if (barHeight > maxAmp * 0.45) {
        c.fillStyle = primaryColor;
      } else {
        c.fillStyle = secondaryColor;
      }

      const y = centerY - barHeight / 2;
      c.fillRect(x, y, 1.5, barHeight);
    }

    // 3. Draw HotCue Flags on the waveform
    if (deck.hotCues) {
      deck.hotCues.forEach((cueTime, idx) => {
        if (cueTime !== null) {
          const cueX = centerX + (cueTime - currentTime) * pxPerSec;
          if (cueX >= 0 && cueX <= c.canvas.width) {
            c.fillStyle = '#ffea00';
            c.fillRect(cueX - 1, startY + 2, 2, laneH - 4);
            c.fillStyle = '#000';
            c.fillRect(cueX - 6, startY + 4, 12, 12);
            c.fillStyle = '#ffea00';
            c.font = 'bold 9px monospace';
            c.textAlign = 'center';
            c.fillText(`${idx + 1}`, cueX, startY + 13);
          }
        }
      });
    }
  }
}

window.initTraktorMonitor = () => {
  window.traktorMonitor = new TraktorMasterMonitor();
};
