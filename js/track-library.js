/**
 * Ist_Mix_Music - Track Library & Music List Manager
 * Manages the central music collection, file uploads, track previews,
 * and 1-click loading into Deck A, B, C, or D.
 */

class TrackLibrary {
  constructor() {
    this.tracks = []; // Array of { id, name, file, buffer, duration, durationStr, isPreviewing }
    this.previewSource = null;
    this.currentPreviewId = null;

    this.btnToggle = document.getElementById('btn-toggle-library');
    this.section = document.getElementById('music-library-section');
    this.tableBody = document.getElementById('library-table-body');
    this.lblCount = document.getElementById('lib-count');
    this.searchInput = document.getElementById('library-search-input');
    this.fileInput = document.getElementById('library-file-input');

    this._attachEvents();
  }

  _attachEvents() {
    // Toggle Library Drawer / Panel
    if (this.btnToggle && this.section) {
      this.btnToggle.addEventListener('click', () => {
        const isHidden = this.section.classList.toggle('hidden');
        this.btnToggle.classList.toggle('active', !isHidden);
        if (!isHidden) {
          this.section.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }

    const btnClose = document.getElementById('btn-close-library');
    if (btnClose && this.section) {
      btnClose.addEventListener('click', () => {
        this.section.classList.add('hidden');
        if (this.btnToggle) this.btnToggle.classList.remove('active');
      });
    }

    // Add Files Button
    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.addFiles(Array.from(e.target.files));
        }
      });
    }

    // Load Demos Button
    const btnDemos = document.getElementById('btn-library-demos');
    if (btnDemos) {
      btnDemos.addEventListener('click', () => {
        this.loadDemoTracks();
      });
    }

    // Live Search Filter
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.filterTable(e.target.value);
      });
    }
  }

  async addFiles(files) {
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    for (const file of files) {
      const trackId = 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await ctx.decodeAudioData(arrayBuffer);

        const mins = Math.floor(decoded.duration / 60);
        const secs = Math.floor(decoded.duration % 60);
        const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

        this.tracks.push({
          id: trackId,
          name: file.name,
          file: file,
          buffer: decoded,
          duration: decoded.duration,
          durationStr: durationStr
        });
      } catch (err) {
        console.error('Error adding track:', file.name, err);
      }
    }

    this.updateUI();

    // Show library if currently hidden
    if (this.section && this.section.classList.contains('hidden')) {
      this.section.classList.remove('hidden');
      if (this.btnToggle) this.btnToggle.classList.add('active');
    }
  }

  async loadDemoTracks() {
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    // Synthesize 3 demo tracks directly in Web Audio:
    // 1. House Groove 124 BPM (8s)
    // 2. Techno Bassline 128 BPM (8s)
    // 3. Synth Arp Melody 120 BPM (8s)
    const demos = [
      { name: "Demo_01_House_Groove.wav", bpm: 124, type: "groove" },
      { name: "Demo_02_Deep_808_Bass.wav", bpm: 128, type: "bass" },
      { name: "Demo_03_Melodic_Arp.wav", bpm: 120, type: "synth" }
    ];

    for (const demo of demos) {
      const duration = 8.0;
      const sampleRate = ctx.sampleRate;
      const buffer = ctx.createBuffer(2, sampleRate * duration, sampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);

      for (let i = 0; i < left.length; i++) {
        const t = i / sampleRate;
        let s = 0;
        if (demo.type === "groove") {
          // 4-on-the-floor beat
          const beatTime = (t * (demo.bpm / 60)) % 1.0;
          s = Math.sin(2 * Math.PI * (50 + (1.0 - beatTime) * 100) * t) * Math.exp(-beatTime * 6);
          s += (Math.random() * 2 - 1) * 0.1 * (beatTime > 0.5 ? Math.exp(-(beatTime - 0.5) * 10) : 0);
        } else if (demo.type === "bass") {
          const bassNote = 45 + (Math.floor(t * 2) % 4) * 8;
          s = Math.sin(2 * Math.PI * bassNote * t) * 0.7;
        } else {
          const noteFreq = [261, 329, 392, 523][Math.floor(t * 4) % 4];
          s = Math.sin(2 * Math.PI * noteFreq * t) * 0.4;
        }
        left[i] = s;
        right[i] = s;
      }

      const trackId = 'demo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      this.tracks.push({
        id: trackId,
        name: demo.name,
        buffer: buffer,
        duration: duration,
        durationStr: "00:08"
      });
    }

    this.updateUI();

    if (this.section && this.section.classList.contains('hidden')) {
      this.section.classList.remove('hidden');
      if (this.btnToggle) this.btnToggle.classList.add('active');
    }
  }

  loadToDeck(trackId, deckId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track || !window.decks || !window.decks[deckId]) return;

    const deck = window.decks[deckId];
    deck.audioBuffer = track.buffer;
    deck.pauseOffset = 0;
    deck.stop();

    if (deck.trackNameEl) {
      deck.trackNameEl.textContent = `${track.name} (${track.durationStr})`;
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

  togglePreview(trackId) {
    if (this.currentPreviewId === trackId) {
      this.stopPreview();
      return;
    }

    this.stopPreview();

    const track = this.tracks.find(t => t.id === trackId);
    if (!track || !track.buffer) return;

    const ctx = window.audioEngine.ctx;
    this.previewSource = ctx.createBufferSource();
    this.previewSource.buffer = track.buffer;

    const gain = ctx.createGain();
    gain.gain.value = 0.7;

    this.previewSource.connect(gain);
    gain.connect(ctx.destination);

    this.previewSource.start();
    this.currentPreviewId = trackId;

    this.previewSource.onended = () => {
      this.stopPreview();
    };

    this.renderTable();
  }

  stopPreview() {
    if (this.previewSource) {
      try { this.previewSource.stop(); } catch(e){}
      this.previewSource = null;
    }
    this.currentPreviewId = null;
    this.renderTable();
  }

  removeTrack(trackId) {
    if (this.currentPreviewId === trackId) {
      this.stopPreview();
    }
    this.tracks = this.tracks.filter(t => t.id !== trackId);
    this.updateUI();
  }

  updateUI() {
    if (this.lblCount) {
      this.lblCount.textContent = this.tracks.length;
    }
    this.renderTable();
  }

  renderTable(filteredTracks = null) {
    if (!this.tableBody) return;
    const list = filteredTracks || this.tracks;

    if (list.length === 0) {
      this.tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:24px; color:var(--text-dim);">
            Keine Songs in der Liste. Klicke auf <strong>"📂 Musik hinzufügen"</strong> oder <strong>"🎵 Demos laden"</strong>!
          </td>
        </tr>
      `;
      return;
    }

    this.tableBody.innerHTML = '';
    list.forEach((track, idx) => {
      const tr = document.createElement('tr');
      const isPreviewing = (this.currentPreviewId === track.id);

      tr.innerHTML = `
        <td style="width:40px; text-align:center; font-family:var(--font-mono); color:var(--text-dim);">${idx + 1}</td>
        <td style="width:50px; text-align:center;">
          <button class="btn-lib-preview ${isPreviewing ? 'playing' : ''}" data-id="${track.id}">
            ${isPreviewing ? '⏹' : '▶'}
          </button>
        </td>
        <td style="font-weight:600;">${track.name}</td>
        <td style="font-family:var(--font-mono); color:var(--text-dim); width:70px;">${track.durationStr}</td>
        <td style="width:240px; text-align:right;">
          <div class="deck-load-buttons">
            <button class="btn-load-deck load-a" data-id="${track.id}" data-deck="deck-a">LOAD A</button>
            <button class="btn-load-deck load-b" data-id="${track.id}" data-deck="deck-b">LOAD B</button>
            <button class="btn-load-deck load-c" data-id="${track.id}" data-deck="deck-c">LOAD C</button>
            <button class="btn-load-deck load-d" data-id="${track.id}" data-deck="deck-d">LOAD D</button>
            <button class="btn-del-track" data-id="${track.id}" title="Aus Liste entfernen">🗑️</button>
          </div>
        </td>
      `;

      // Event listeners
      tr.querySelector('.btn-lib-preview').addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.togglePreview(track.id);
      });

      tr.querySelectorAll('.btn-load-deck').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.audioEngine.unlockAudio();
          this.loadToDeck(btn.dataset.id, btn.dataset.deck);
        });
      });

      tr.querySelector('.btn-del-track').addEventListener('click', () => {
        this.removeTrack(track.id);
      });

      this.tableBody.appendChild(tr);
    });
  }

  filterTable(query) {
    const q = query.toLowerCase().trim();
    if (!q) {
      this.renderTable();
      return;
    }
    const filtered = this.tracks.filter(t => t.name.toLowerCase().includes(q));
    this.renderTable(filtered);
  }
}

window.initTrackLibrary = () => {
  window.trackLibrary = new TrackLibrary();
};
