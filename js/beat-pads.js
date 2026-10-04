/**
 * Ist_Mix_Music - Beat Pads & 16-Step Sequencer
 * Multi-touch drum pads and high-precision rhythmic step sequencer.
 */

class BeatStudio {
  constructor() {
    this.pads = [
      { id: 'pad-kick',  name: '808 KICK', key: '1', fn: () => window.audioEngine.playKick() },
      { id: 'pad-snare', name: 'SNARE',    key: '2', fn: () => window.audioEngine.playSnare() },
      { id: 'pad-hihat', name: 'HI-HAT',   key: '3', fn: () => window.audioEngine.playHiHat(0, false) },
      { id: 'pad-clap',  name: 'CLAP',     key: '4', fn: () => window.audioEngine.playClap() },
      { id: 'pad-bass',  name: '808 BASS', key: '5', fn: () => window.audioEngine.playBass(55) },
      { id: 'pad-chord', name: 'CHORD',    key: '6', fn: () => window.audioEngine.playChord() },
      { id: 'pad-lead',  name: 'LEAD',     key: '7', fn: () => window.audioEngine.playLead() },
      { id: 'pad-fx',    name: 'DJ FX',    key: '8', fn: () => window.audioEngine.playFx() }
    ];

    // Sequencer Grid: Dynamic array of tracks
    this.seqTracks = [
      { id: 'track-kick',  name: 'KICK',  type: 'drum', color: '#00f0ff', isMuted: false, isCustom: false, sound: () => window.audioEngine.playKick(), steps: new Array(16).fill(false) },
      { id: 'track-snare', name: 'SNARE', type: 'drum', color: '#f43f5e', isMuted: false, isCustom: false, sound: () => window.audioEngine.playSnare(), steps: new Array(16).fill(false) },
      { id: 'track-hihat', name: 'HIHAT', type: 'drum', color: '#eab308', isMuted: false, isCustom: false, sound: () => window.audioEngine.playHiHat(0, false), steps: new Array(16).fill(false) },
      { id: 'track-clap',  name: 'CLAP',  type: 'drum', color: '#10b981', isMuted: false, isCustom: false, sound: () => window.audioEngine.playClap(), steps: new Array(16).fill(false) }
    ];

    // Default beat pattern (Classic Groove)
    this.seqTracks[0].steps[0] = true;  // Kick on 1
    this.seqTracks[0].steps[8] = true;  // Kick on 3
    this.seqTracks[0].steps[10] = true; // Kick syncopation
    this.seqTracks[1].steps[4] = true;  // Snare on 2
    this.seqTracks[1].steps[12] = true; // Snare on 4
    for (let i = 0; i < 16; i += 2) {
      this.seqTracks[2].steps[i] = true; // 8th note Hi-Hats
    }
    this.seqTracks[3].steps[12] = true; // Clap on 4

    this.isPlayingSeq = false;
    this.currentStep = 0;
    this.stepTimerId = null;

    // Dedicated Beat Recording State
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recStartTime = 0;
    this.recTimerInterval = null;
    this.lastRecordedBuffer = null;
    this.lastRecordedBlob = null;
    this.previewSourceNode = null;
    this.isPreviewPlaying = false;

    // Track Adder Elements
    this.btnAddTrack = document.getElementById('seq-btn-add-track');
    this.panelAddTrack = document.getElementById('seq-add-track-panel');
    this.btnCloseAdd = document.getElementById('btn-close-seq-add');
    this.selInstrument = document.getElementById('seq-select-instrument');
    this.btnAddInst = document.getElementById('btn-add-inst-track');
    this.selSample = document.getElementById('seq-select-sample');
    this.btnAddSample = document.getElementById('btn-add-sample-track');

    // Recording Controls Elements
    this.btnRec = document.getElementById('seq-btn-rec');
    this.lblRecTimer = document.getElementById('seq-rec-timer');
    this.resultBar = document.getElementById('seq-rec-result-bar');
    this.inputRecName = document.getElementById('seq-rec-name');
    this.lblRecDuration = document.getElementById('seq-rec-duration-badge');
    this.btnPreview = document.getElementById('btn-seq-rec-preview');
    this.btnSaveVault = document.getElementById('btn-seq-rec-save-vault');
    this.btnDownload = document.getElementById('btn-seq-rec-download');
    this.btnDiscard = document.getElementById('btn-seq-rec-discard');

    this._initPads();
    this._attachUIEvents();
    this._renderSequencer();
    this._attachKeyboard();
  }

  _initPads() {
    this.pads.forEach((pad) => {
      const el = document.getElementById(pad.id);
      if (!el) return;

      const trigger = (e) => {
        if (e) e.preventDefault();
        window.audioEngine.unlockAudio();
        
        if (navigator.vibrate) {
          navigator.vibrate(15);
        }

        pad.fn();
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 120);
      };

      el.addEventListener('pointerdown', trigger);
    });
  }

  _attachUIEvents() {
    // Sequencer Play / Stop
    const btnPlaySeq = document.getElementById('seq-btn-play');
    if (btnPlaySeq) {
      btnPlaySeq.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.toggleSequencer();
      });
    }

    // Sequencer Clear Grid
    const btnClearSeq = document.getElementById('seq-btn-clear');
    if (btnClearSeq) {
      btnClearSeq.addEventListener('click', () => {
        this.clearSequencer();
      });
    }

    // Toggle Add-Track Panel
    if (this.btnAddTrack && this.panelAddTrack) {
      this.btnAddTrack.addEventListener('click', () => {
        const isHidden = this.panelAddTrack.classList.toggle('hidden');
        if (!isHidden) {
          this.populateSampleDropdown();
          this.panelAddTrack.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      });
    }

    if (this.btnCloseAdd && this.panelAddTrack) {
      this.btnCloseAdd.addEventListener('click', () => {
        this.panelAddTrack.classList.add('hidden');
      });
    }

    // Add Instrument Track
    if (this.btnAddInst && this.selInstrument) {
      this.btnAddInst.addEventListener('click', () => {
        const type = this.selInstrument.value;
        this.addInstrumentTrack(type);
        if (this.panelAddTrack) this.panelAddTrack.classList.add('hidden');
      });
    }

    // Add Sliced Sample Track from Sample Bank
    if (this.btnAddSample && this.selSample) {
      this.btnAddSample.addEventListener('click', () => {
        const sampleId = this.selSample.value;
        if (!sampleId) {
          alert('Bitte wähle zuerst ein Sample aus der Liste aus!');
          return;
        }
        this.addSampleTrack(sampleId);
        if (this.panelAddTrack) this.panelAddTrack.classList.add('hidden');
      });
    }

    // Beat Recording Button
    if (this.btnRec) {
      this.btnRec.addEventListener('click', () => {
        this.toggleRecording();
      });
    }

    // Result Bar Action Buttons
    if (this.btnPreview) {
      this.btnPreview.addEventListener('click', () => {
        this.togglePreview();
      });
    }

    if (this.btnSaveVault) {
      this.btnSaveVault.addEventListener('click', () => {
        this.saveRecordedToVault();
      });
    }

    if (this.btnDownload) {
      this.btnDownload.addEventListener('click', () => {
        this.downloadRecordedWav();
      });
    }

    if (this.btnDiscard) {
      this.btnDiscard.addEventListener('click', () => {
        this.discardRecorded();
      });
    }

    // Load into Decks A, B, C, D
    document.querySelectorAll('.btn-load-seq-deck').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deckId = btn.dataset.deck;
        this.loadRecordedToDeck(deckId);
      });
    });
  }

  _attachKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      const key = e.key.toLowerCase();
      const pad = this.pads.find(p => p.key === key || p.id.endsWith(key));
      if (pad) {
        window.audioEngine.unlockAudio();
        pad.fn();
        const el = document.getElementById(pad.id);
        if (el) {
          el.classList.add('active');
          setTimeout(() => el.classList.remove('active'), 120);
        }
      }

      // Spacebar toggles sequencer
      if (e.code === 'Space') {
        e.preventDefault();
        this.toggleSequencer();
      }
    });
  }

  // ==========================================
  // DYNAMIC TRACK ADDING (INSTRUMENTE & SAMPLES)
  // ==========================================
  populateSampleDropdown() {
    if (!this.selSample) return;
    this.selSample.innerHTML = '';

    const samples = (window.sampleVault && window.sampleVault.samples) ? window.sampleVault.samples : [];

    if (samples.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '⚠️ Keine Samples in Bank vorhanden';
      this.selSample.appendChild(opt);
      return;
    }

    samples.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = `✂️ ${s.name} (${s.durationStr || (s.duration ? s.duration.toFixed(1) + 's' : '')})`;
      this.selSample.appendChild(opt);
    });
  }

  addInstrumentTrack(type) {
    let name = 'TRACK';
    let color = '#38bdf8';
    let soundFn = () => {};

    switch (type) {
      case 'tom_high':
        name = '🥁 HI-TOM';
        color = '#f59e0b';
        soundFn = () => window.audioEngine.playTom('high');
        break;
      case 'tom_mid':
        name = '🥁 MID-TOM';
        color = '#f59e0b';
        soundFn = () => window.audioEngine.playTom('mid');
        break;
      case 'tom_low':
        name = '🥁 LOW-TOM';
        color = '#d97706';
        soundFn = () => window.audioEngine.playTom('low');
        break;
      case 'cowbell':
        name = '🔔 COWBELL';
        color = '#fbbf24';
        soundFn = () => window.audioEngine.playCowbell();
        break;
      case 'rimshot':
        name = '🥢 RIMSHOT';
        color = '#a3e635';
        soundFn = () => window.audioEngine.playRimshot();
        break;
      case 'shaker':
        name = '✨ SHAKER';
        color = '#34d399';
        soundFn = () => window.audioEngine.playShaker();
        break;
      case 'crash':
        name = '💥 CRASH';
        color = '#38bdf8';
        soundFn = () => window.audioEngine.playCrash();
        break;
      case 'tiesto_bass':
        name = '💥 TIËSTO BASS';
        color = '#ef4444';
        soundFn = () => window.audioEngine.playSynthStab('tiesto');
        break;
      case 'bass_808':
        name = '🎸 808 BASS';
        color = '#8b5cf6';
        soundFn = () => window.audioEngine.playBass(55);
        break;
      case 'lead_synth':
        name = '⚡ EDM LEAD';
        color = '#00f0ff';
        soundFn = () => window.audioEngine.playLead();
        break;
      case 'piano_chord':
        name = '🎹 KLAVIER';
        color = '#10b981';
        soundFn = () => window.audioEngine.playChord();
        break;
      case 'organ_stab':
        name = '🎶 ORGEL';
        color = '#ec4899';
        soundFn = () => window.audioEngine.playSynthStab('organ');
        break;
      case 'marimba_pluck':
        name = '🔔 PLUCK';
        color = '#06b6d4';
        soundFn = () => window.audioEngine.playSynthStab('pluck');
        break;
      case 'flute_note':
        name = '🪈 FLÖTE';
        color = '#14b8a6';
        soundFn = () => window.audioEngine.playSynthStab('flute');
        break;
      case 'scratch_fx':
        name = '💿 SCRATCH';
        color = '#f43f5e';
        soundFn = () => window.audioEngine.playFx();
        break;
      default:
        name = type.toUpperCase();
        soundFn = () => window.audioEngine.playTom('mid');
    }

    const newTrack = {
      id: 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: name,
      type: 'instrument',
      color: color,
      sound: soundFn,
      steps: new Array(16).fill(false),
      isMuted: false,
      isCustom: true
    };

    this.seqTracks.push(newTrack);
    this._renderSequencer();
  }

  addSampleTrack(sampleId) {
    if (!window.sampleVault || !window.sampleVault.samples) return;
    const sample = window.sampleVault.samples.find(s => s.id === sampleId);
    if (!sample) return;

    const shortName = sample.name.length > 12 ? sample.name.substring(0, 11) + '..' : sample.name;

    const newTrack = {
      id: 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: `✂️ ${shortName}`,
      fullName: sample.name,
      sampleId: sampleId,
      type: 'sample',
      color: '#00e676',
      sound: () => window.audioEngine.playSampleClip(sampleId),
      steps: new Array(16).fill(false),
      isMuted: false,
      isCustom: true
    };

    this.seqTracks.push(newTrack);
    this._renderSequencer();
  }

  removeTrack(trackId) {
    this.seqTracks = this.seqTracks.filter(t => t.id !== trackId);
    this._renderSequencer();
  }

  // ==========================================
  // SEQUENCER RENDERING
  // ==========================================
  _renderSequencer() {
    const container = document.getElementById('seq-rows-container');
    if (!container) return;
    container.innerHTML = '';

    this.seqTracks.forEach((track, tIdx) => {
      const row = document.createElement('div');
      row.className = `seq-row ${track.isMuted ? 'muted' : ''}`;
      row.dataset.trackId = track.id;

      // Track Info Header (Label, Mute, Delete)
      const infoBox = document.createElement('div');
      infoBox.className = 'seq-track-info';

      const nameLabel = document.createElement('span');
      nameLabel.className = 'seq-track-name';
      nameLabel.textContent = track.name;
      nameLabel.title = track.fullName || track.name;
      if (track.color) {
        nameLabel.style.color = track.color;
      }
      infoBox.appendChild(nameLabel);

      // Mute Button
      const btnMute = document.createElement('button');
      btnMute.className = `btn-track-mute ${track.isMuted ? 'muted' : ''}`;
      btnMute.textContent = 'M';
      btnMute.title = track.isMuted ? 'Spur stummgeschaltet (Klicken zum Entstummen)' : 'Spur stummschalten';
      btnMute.addEventListener('click', (e) => {
        e.stopPropagation();
        track.isMuted = !track.isMuted;
        btnMute.classList.toggle('muted', track.isMuted);
        row.classList.toggle('muted', track.isMuted);
      });
      infoBox.appendChild(btnMute);

      // Delete Button for custom tracks
      if (track.isCustom) {
        const btnDel = document.createElement('button');
        btnDel.className = 'btn-track-del';
        btnDel.textContent = '🗑️';
        btnDel.title = 'Spur entfernen';
        btnDel.addEventListener('click', (e) => {
          e.stopPropagation();
          this.removeTrack(track.id);
        });
        infoBox.appendChild(btnDel);
      }

      row.appendChild(infoBox);

      // 16 Step Buttons
      const stepsBox = document.createElement('div');
      stepsBox.className = 'seq-steps';

      track.steps.forEach((active, sIdx) => {
        const stepBtn = document.createElement('div');
        stepBtn.className = `seq-step ${active ? 'active' : ''}`;
        stepBtn.dataset.trackIdx = tIdx;
        stepBtn.dataset.step = sIdx;

        if (active && track.color) {
          stepBtn.style.background = track.color;
          stepBtn.style.boxShadow = `0 0 8px ${track.color}`;
        }

        stepBtn.addEventListener('pointerdown', () => {
          track.steps[sIdx] = !track.steps[sIdx];
          const isNowActive = track.steps[sIdx];
          stepBtn.classList.toggle('active', isNowActive);

          if (isNowActive) {
            if (track.color) {
              stepBtn.style.background = track.color;
              stepBtn.style.boxShadow = `0 0 8px ${track.color}`;
            }
            window.audioEngine.unlockAudio();
            if (!track.isMuted) {
              track.sound();
            }
          } else {
            stepBtn.style.background = '';
            stepBtn.style.boxShadow = '';
          }
        });

        stepsBox.appendChild(stepBtn);
      });

      row.appendChild(stepsBox);
      container.appendChild(row);
    });
  }

  // ==========================================
  // PLAYBACK LOOP ENGINE
  // ==========================================
  toggleSequencer() {
    if (this.isPlayingSeq) {
      this.stopSequencer();
    } else {
      this.startSequencer();
    }
  }

  startSequencer() {
    window.audioEngine.unlockAudio();
    this.isPlayingSeq = true;
    this.currentStep = 0;

    const btn = document.getElementById('seq-btn-play');
    if (btn) {
      btn.textContent = '⏹ STOP BEAT';
      btn.classList.add('playing');
      btn.style.background = '#ef4444';
      btn.style.color = '#ffffff';
      btn.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.6)';
    }

    this._stepLoop();
  }

  stopSequencer() {
    this.isPlayingSeq = false;
    if (this.stepTimerId) {
      clearTimeout(this.stepTimerId);
      this.stepTimerId = null;
    }

    // Clear step highlights
    document.querySelectorAll('.seq-step.playing-step').forEach(el => el.classList.remove('playing-step'));

    const btn = document.getElementById('seq-btn-play');
    if (btn) {
      btn.textContent = '▶ BEAT STARTEN';
      btn.classList.remove('playing');
      btn.style.background = '#00e676';
      btn.style.color = '#000000';
      btn.style.boxShadow = '0 0 10px rgba(0, 230, 118, 0.4)';
    }
  }

  clearSequencer() {
    this.seqTracks.forEach(t => t.steps.fill(false));
    document.querySelectorAll('.seq-step').forEach(el => {
      el.classList.remove('active');
      el.style.background = '';
      el.style.boxShadow = '';
    });
  }

  _stepLoop() {
    if (!this.isPlayingSeq) return;

    // Trigger sounds for active tracks at this step
    this.seqTracks.forEach((track) => {
      if (track.steps[this.currentStep] && !track.isMuted) {
        track.sound();
      }
    });

    // Update visual playhead
    document.querySelectorAll('.seq-step.playing-step').forEach(el => el.classList.remove('playing-step'));
    document.querySelectorAll(`.seq-step[data-step="${this.currentStep}"]`).forEach(el => el.classList.add('playing-step'));

    this.currentStep = (this.currentStep + 1) % 16;

    // Calculate step interval based on BPM (16th notes: (60 / BPM) / 4 * 1000 ms)
    const bpm = window.audioEngine.bpm || 120;
    const stepDurationMs = (60.0 / bpm / 4.0) * 1000;

    this.stepTimerId = setTimeout(() => this._stepLoop(), stepDurationMs);
  }

  // ==========================================
  // BEAT RECORDER & LOOP EXPORT ENGINE
  // ==========================================
  toggleRecording() {
    if (this.isRecording) {
      this.stopRecording();
    } else {
      this.startRecording();
    }
  }

  async startRecording() {
    if (!window.audioEngine) return;
    window.audioEngine.unlockAudio();

    if (!window.audioEngine.drumsRecordDest || !window.audioEngine.drumsRecordDest.stream) {
      alert('Audiotreiber für Beat-Aufnahme nicht bereit. Bitte Seite neu laden.');
      return;
    }

    const stream = window.audioEngine.drumsRecordDest.stream;

    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
        mimeType = 'audio/ogg';
      } else {
        mimeType = '';
      }
    }

    try {
      this.recordedChunks = [];
      this.mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.mediaRecorder.onstop = async () => {
        await this._processRecordedData();
      };

      this.mediaRecorder.start(100);
      this.isRecording = true;
      this.recStartTime = Date.now();

      // Automatically start sequencer if not playing
      if (!this.isPlayingSeq) {
        this.startSequencer();
      }

      // UI state updates
      if (this.btnRec) {
        this.btnRec.classList.add('recording');
        const lbl = this.btnRec.querySelector('.seq-rec-label');
        if (lbl) lbl.textContent = '⏹ BEAT STOPPEN';
      }
      if (this.lblRecTimer) {
        this.lblRecTimer.style.display = 'inline-block';
        this.lblRecTimer.textContent = '00:00';
      }
      if (this.resultBar) {
        this.resultBar.classList.add('hidden');
      }

      if (this.recTimerInterval) clearInterval(this.recTimerInterval);
      this.recTimerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - this.recStartTime) / 1000);
        const mins = Math.floor(elapsedSec / 60);
        const secs = elapsedSec % 60;
        if (this.lblRecTimer) {
          this.lblRecTimer.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
      }, 500);

    } catch (err) {
      console.error('Fehler beim Starten der Beat-Aufnahme:', err);
      alert('Fehler beim Starten der Beat-Aufnahme: ' + err.message);
      this.isRecording = false;
    }
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.isRecording = false;

    if (this.recTimerInterval) {
      clearInterval(this.recTimerInterval);
      this.recTimerInterval = null;
    }

    if (this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.btnRec) {
      this.btnRec.classList.remove('recording');
      const lbl = this.btnRec.querySelector('.seq-rec-label');
      if (lbl) lbl.textContent = '🔴 BEAT AUFNEHMEN';
    }
    if (this.lblRecTimer) {
      this.lblRecTimer.style.display = 'none';
    }
  }

  async _processRecordedData() {
    if (!this.recordedChunks || this.recordedChunks.length === 0) {
      alert('Keine Audiodaten im aufgenommenen Beat gefunden.');
      return;
    }

    const rawBlob = new Blob(this.recordedChunks, { type: (this.mediaRecorder && this.mediaRecorder.mimeType) || 'audio/webm' });
    const ctx = window.audioEngine ? window.audioEngine.ctx : null;
    if (!ctx) return;

    try {
      const arrayBuf = await rawBlob.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuf);

      if (!decodedBuffer || decodedBuffer.length === 0) {
        alert('Beat-Aufnahme war leer.');
        return;
      }

      // Convert to lossless 16-bit PCM WAV
      const wavBlob = window.audioBufferToWav
        ? window.audioBufferToWav(decodedBuffer)
        : rawBlob;

      this.lastRecordedBuffer = decodedBuffer;
      this.lastRecordedBlob = wavBlob;

      const dur = decodedBuffer.duration;
      const bpm = window.audioEngine.bpm || 120;
      const bars = Math.max(1, Math.round((dur / (60 / bpm * 4))));
      const durStr = `${dur.toFixed(1)}s (${bars} ${bars === 1 ? 'Takt' : 'Takte'} @ ${bpm} BPM)`;

      const timeTag = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');

      if (this.inputRecName) {
        this.inputRecName.value = `Club_Beat_${bpm}BPM_${timeTag}`;
      }
      if (this.lblRecDuration) {
        this.lblRecDuration.textContent = `⏱️ ${durStr}`;
      }
      if (this.resultBar) {
        this.resultBar.classList.remove('hidden');
        this.resultBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

    } catch (e) {
      console.error('Fehler beim Dekodieren der Beat-Aufnahme:', e);
      alert('Konnte Beat-Aufnahme nicht verarbeiten: ' + e.message);
    }
  }

  togglePreview() {
    if (!this.lastRecordedBuffer || !window.audioEngine) return;
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;

    if (this.isPreviewPlaying && this.previewSourceNode) {
      try {
        this.previewSourceNode.stop();
        this.previewSourceNode.disconnect();
      } catch (e) {}
      this.previewSourceNode = null;
      this.isPreviewPlaying = false;
      if (this.btnPreview) this.btnPreview.textContent = '▶ ANHÖREN';
      return;
    }

    try {
      const src = ctx.createBufferSource();
      src.buffer = this.lastRecordedBuffer;
      src.connect(window.audioEngine.drumsGain || window.audioEngine.masterGain);

      src.onended = () => {
        this.isPreviewPlaying = false;
        this.previewSourceNode = null;
        if (this.btnPreview) this.btnPreview.textContent = '▶ ANHÖREN';
      };

      src.start(0);
      this.previewSourceNode = src;
      this.isPreviewPlaying = true;
      if (this.btnPreview) this.btnPreview.textContent = '⏹ STOPP';
    } catch (e) {
      console.error('Preview error:', e);
    }
  }

  async saveRecordedToVault() {
    if (!this.lastRecordedBuffer || !this.lastRecordedBlob) {
      alert('Keine Aufnahme vorhanden zum Speichern.');
      return;
    }

    if (!window.sampleVault) {
      alert('Sample-Bank nicht bereit.');
      return;
    }

    const name = (this.inputRecName ? this.inputRecName.value.trim() : '') || `Beat_Loop_${Date.now().toString().slice(-4)}`;
    const dur = this.lastRecordedBuffer.duration;
    const bpm = window.audioEngine.bpm || 120;
    const durStr = `${dur.toFixed(1)}s`;

    const sampleObj = {
      id: 'sample_beat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: name,
      sourceTrackName: `16-Step Sequencer (${bpm} BPM)`,
      startSec: 0,
      endSec: dur,
      duration: dur,
      durationStr: durStr,
      blob: this.lastRecordedBlob,
      buffer: this.lastRecordedBuffer,
      createdAt: Date.now()
    };

    try {
      if (window.sampleVault.storage) {
        await window.sampleVault.storage.save(sampleObj);
      }
      window.sampleVault.addSample(sampleObj);
      window.sampleVault.show();

      if (this.btnSaveVault) {
        const origText = this.btnSaveVault.textContent;
        this.btnSaveVault.textContent = '✅ GESPEICHERT!';
        this.btnSaveVault.style.background = '#10b981';
        this.btnSaveVault.style.color = '#000';
        setTimeout(() => {
          this.btnSaveVault.textContent = origText;
          this.btnSaveVault.style.background = '';
          this.btnSaveVault.style.color = '';
        }, 1800);
      }
    } catch (err) {
      console.error('Fehler beim Speichern in Sample-Bank:', err);
      alert('Konnte Beat nicht in Sample-Bank speichern: ' + err.message);
    }
  }

  loadRecordedToDeck(deckId) {
    if (!this.lastRecordedBuffer) {
      alert('Keine Aufnahme vorhanden zum Laden.');
      return;
    }

    if (window.isDeckHidden && window.isDeckHidden(deckId)) {
      const deckLetter = deckId.split('-')[1].toUpperCase();
      const confirmUnhide = confirm(`⚠️ DECK ${deckLetter} ist momentan ausgeblendet!\n\nUm den aufgenommenen Beat in DECK ${deckLetter} zu laden, muss der Player zuerst eingeblendet werden.\n\nMöchtest du DECK ${deckLetter} jetzt einblenden und den Beat laden?`);
      if (confirmUnhide) {
        window.setDeckVisibility(deckId, true);
      } else {
        return;
      }
    }

    if (!window.decks || !window.decks[deckId]) {
      alert(`Deck ${deckId} nicht gefunden.`);
      return;
    }

    const deck = window.decks[deckId];
    window.audioEngine.unlockAudio();

    const name = (this.inputRecName ? this.inputRecName.value.trim() : '') || 'Beat_Loop';
    const dur = this.lastRecordedBuffer.duration;
    const durStr = `${dur.toFixed(1)}s`;

    deck.audioBuffer = this.lastRecordedBuffer;
    deck.pauseOffset = 0;
    deck.stop();

    if (deck.trackNameEl) {
      deck.trackNameEl.textContent = `[BEAT] ${name} (${durStr})`;
    }

    deck._drawWaveform();
    deck.updateTimeDisplay();

    const badge = document.querySelector(`.deck-${deckId.split('-')[1]} .deck-badge`);
    if (badge) {
      badge.style.transform = 'scale(1.3)';
      badge.style.transition = 'transform 0.2s';
      setTimeout(() => badge.style.transform = '', 350);
    }
  }

  downloadRecordedWav() {
    if (!this.lastRecordedBlob) {
      alert('Keine Aufnahme vorhanden zum Herunterladen.');
      return;
    }

    const name = (this.inputRecName ? this.inputRecName.value.trim() : '') || 'Beat_Loop';
    const url = URL.createObjectURL(this.lastRecordedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  discardRecorded() {
    if (this.isPreviewPlaying && this.previewSourceNode) {
      try {
        this.previewSourceNode.stop();
        this.previewSourceNode.disconnect();
      } catch (e) {}
      this.previewSourceNode = null;
      this.isPreviewPlaying = false;
    }
    this.lastRecordedBuffer = null;
    this.lastRecordedBlob = null;
    if (this.resultBar) {
      this.resultBar.classList.add('hidden');
    }
  }
}

window.initBeatStudio = () => {
  window.beatStudio = new BeatStudio();
};
