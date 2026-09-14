/**
 * Ist_Mix_Music - Track Library & Permanent Music Storage
 * Stores all user songs permanently in browser IndexedDB so they NEVER disappear on F5!
 */

class TrackStorage {
  constructor() {
    this.dbName = 'IstMixMusicDB';
    this.dbVersion = 1;
    this.storeName = 'tracks';
    this.db = null;
  }

  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };
      request.onerror = (e) => {
        console.warn('IndexedDB open error:', e);
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
      console.warn('Could not load from IndexedDB:', e);
      return [];
    }
  }

  async save(trackData) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.put(trackData);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Could not save to IndexedDB:', e);
    }
  }

  async delete(trackId) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const req = store.delete(trackId);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('Could not delete from IndexedDB:', e);
    }
  }
}

class TrackLibrary {
  constructor() {
    this.storage = new TrackStorage();
    this.tracks = []; // Array of { id, name, file, blob, buffer, duration, durationStr, isPreviewing }
    this.previewSource = null;
    this.currentPreviewId = null;

    this.btnToggle = document.getElementById('btn-toggle-library');
    this.section = document.getElementById('music-library-section');
    this.tableBody = document.getElementById('library-table-body');
    this.lblCount = document.getElementById('lib-count');
    this.searchInput = document.getElementById('library-search-input');
    this.fileInput = document.getElementById('library-file-input');

    this._attachEvents();
    this.initStorage();
  }

  async initStorage() {
    const saved = await this.storage.getAll();
    if (saved && saved.length > 0) {
      this.tracks = saved.map(item => ({
        id: item.id,
        name: item.name,
        blob: item.blob,
        duration: item.duration,
        durationStr: item.durationStr,
        buffer: null // decoded on demand when loaded into deck or previewed
      }));
      this.updateUI();
      console.log(`Restored ${saved.length} tracks from permanent storage.`);
    } else {
      // Beim ersten Start echte Demo-Tracks automatisch laden
      this.loadDemoTracks(true);
    }
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

  async saveExternalFile(file, decodedBuffer) {
    const exists = this.tracks.some(t => t.name === file.name);
    if (exists) return;

    const trackId = 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const mins = Math.floor(decodedBuffer.duration / 60);
    const secs = Math.floor(decodedBuffer.duration % 60);
    const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

    const trackObj = {
      id: trackId,
      name: file.name,
      blob: file,
      buffer: decodedBuffer,
      duration: decodedBuffer.duration,
      durationStr: durationStr
    };

    this.tracks.push(trackObj);
    this.updateUI();

    await this.storage.save({
      id: trackId,
      name: file.name,
      blob: file,
      duration: decodedBuffer.duration,
      durationStr: durationStr,
      savedAt: Date.now()
    });
  }

  async addFiles(files) {
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    for (const file of files) {
      if (this.tracks.some(t => t.name === file.name)) continue;

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
          blob: file,
          buffer: decoded,
          duration: decoded.duration,
          durationStr: durationStr
        });

        // Save permanently to IndexedDB
        await this.storage.save({
          id: trackId,
          name: file.name,
          blob: file,
          duration: decoded.duration,
          durationStr: durationStr,
          savedAt: Date.now()
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

  async loadDemoTracks(silent = false) {
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    const realDemos = [
      { name: "Fisherman - Lockdown Club Mix.mp3", path: "demo_tracks/Fisherman_Club_Mix_Sample.mp3" },
      { name: "Sample_Istvan_Mix.mp3", path: "demo_tracks/Sample_Istvan_Mix.mp3" },
      { name: "Track_01_Ambient_Intro.wav", path: "demo_tracks/Track_01_Ambient_Intro.wav" },
      { name: "Track_02_Bassline_Groove.wav", path: "demo_tracks/Track_02_Bassline_Groove.wav" },
      { name: "Track_03_Melodic_Outro.wav", path: "demo_tracks/Track_03_Melodic_Outro.wav" }
    ];

    let loadedCount = 0;
    for (const demo of realDemos) {
      if (this.tracks.some(t => t.name === demo.name)) continue;
      try {
        const resp = await fetch(demo.path);
        if (resp.ok) {
          const blob = await resp.blob();
          const ab = await blob.clone().arrayBuffer();
          const decoded = await ctx.decodeAudioData(ab);
          const duration = decoded.duration;
          const mins = Math.floor(duration / 60);
          const secs = Math.floor(duration % 60);
          const durationStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
          const trackId = 'demo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

          const trackObj = {
            id: trackId,
            name: demo.name,
            blob: blob,
            buffer: decoded,
            duration: duration,
            durationStr: durationStr
          };
          this.tracks.push(trackObj);
          await this.storage.save(trackObj);
          loadedCount++;
        }
      } catch (e) {
        console.warn('Konnte Demo-Datei nicht laden:', demo.name, e);
      }
    }

    if (loadedCount === 0 && this.tracks.length === 0) {
      const demos = [
        { name: "Demo_01_House_Groove.wav", bpm: 124, type: "groove" },
        { name: "Demo_02_Deep_808_Bass.wav", bpm: 128, type: "bass" },
        { name: "Demo_03_Melodic_Arp.wav", bpm: 120, type: "synth" }
      ];

      for (const demo of demos) {
        if (this.tracks.some(t => t.name === demo.name)) continue;

        const duration = 8.0;
        const sampleRate = ctx.sampleRate;
        const buffer = ctx.createBuffer(2, sampleRate * duration, sampleRate);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);

        for (let i = 0; i < left.length; i++) {
          const t = i / sampleRate;
          let s = 0;
          if (demo.type === "groove") {
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
    }

    this.updateUI();

    if (!silent && this.section && this.section.classList.contains('hidden')) {
      this.section.classList.remove('hidden');
      if (this.btnToggle) this.btnToggle.classList.add('active');
    }
  }

  async loadToDeck(trackId, deckId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (!track || !window.decks || !window.decks[deckId]) return;

    const deck = window.decks[deckId];
    if (deck.trackNameEl) {
      deck.trackNameEl.textContent = `Lade: ${track.name}...`;
    }

    // Decode on demand if buffer is not yet in RAM
    if (!track.buffer && (track.blob || track.file)) {
      window.audioEngine.unlockAudio();
      const ctx = window.audioEngine.ctx;
      try {
        const data = track.blob || track.file;
        const arrayBuffer = await data.arrayBuffer();
        track.buffer = await ctx.decodeAudioData(arrayBuffer);
      } catch (err) {
        console.error('Error decoding track buffer:', err);
        if (deck.trackNameEl) deck.trackNameEl.textContent = 'Fehler beim Laden!';
        alert(`Song konnte nicht dekodiert werden: ${err.message}`);
        return;
      }
    }

    deck.audioBuffer = track.buffer;
    deck.pauseOffset = 0;
    deck.stop();

    if (deck.trackNameEl) {
      deck.trackNameEl.textContent = `${track.name} (${track.durationStr})`;
    }

    deck._drawWaveform();
    deck.updateTimeDisplay();

    // Visual feedback on deck badge
    const badge = document.querySelector(`.deck-${deckId.split('-')[1]} .deck-badge`);
    if (badge) {
      badge.style.transform = 'scale(1.25)';
      setTimeout(() => badge.style.transform = '', 300);
    }
  }

  async togglePreview(trackId) {
    if (this.currentPreviewId === trackId) {
      this.stopPreview();
      return;
    }

    this.stopPreview();

    const track = this.tracks.find(t => t.id === trackId);
    if (!track) return;

    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    // Decode on demand if needed
    if (!track.buffer && (track.blob || track.file)) {
      try {
        const data = track.blob || track.file;
        const arrayBuffer = await data.arrayBuffer();
        track.buffer = await ctx.decodeAudioData(arrayBuffer);
      } catch (err) {
        console.error('Error decoding preview:', err);
        return;
      }
    }

    if (!track.buffer) return;

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

  async removeTrack(trackId) {
    if (this.currentPreviewId === trackId) {
      this.stopPreview();
    }
    this.tracks = this.tracks.filter(t => t.id !== trackId);
    await this.storage.delete(trackId);
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
            Keine Songs in der Liste. Klicke auf <strong>"➕ Musikdateien hinzufügen"</strong> oder <strong>"🎵 Demos laden"</strong>!
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
