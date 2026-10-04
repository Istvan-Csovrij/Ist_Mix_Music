/**
 * Ist_Mix_Music - Virtual Instrument & Synthesizer Studio
 * 8 Professional Web Audio Instruments:
 * 1. Konzert-Klavier (Grand Piano)
 * 2. EDM Club Synthesizer (Saw Lead)
 * 3. Deep 808 Sub-Bass (Verschiedene Tiefen & Stärken)
 * 4. Acid / Slap Bass (Knackig & Perkussiv)
 * 5. Flöte (Panflöte / Konzertflöte mit Atemluft & Vibrato)
 * 6. Synth Strings & Ambient Pad
 * 7. Electro Club Orgel (90s House & Club Organ)
 * 8. Pluck / Marimba / Glöckchen
 *
 * Features:
 * - Einstellbare Geschwindigkeit (BPM-synchroner Arpeggiator & Rhythmus-Muster)
 * - Tontiefen- & Tonhöhen-Regler (Oktaven -2 bis +2, Transponierung, Filter Cutoff/Resonanz, ADSR)
 * - 25-Tasten Klaviatur mit Touch-Glissando & PC-Tastaturbelegung
 * - Quick-Chord Akkord-Pads (C, Am, F, G, Dm, Em)
 * - Nahtlose Integration in den DJ Master-Mix & Mix-Aufnahme
 */

class SynthStudio {
  constructor() {
    this.currentInstrument = 'tiesto_bass';
    this.octaveShift = -1; // -2, -1, 0, +1, +2 (Default -1 for deep club bass)
    this.detuneSemi = 0;   // -12 to +12
    this.filterCutoff = 4200;
    this.filterResonance = 6.5;
    this.attackTime = 0.003;
    this.releaseTime = 0.18;
    this.drive = 0.70; // 0.0 to 1.0 (Saturation / DZZZ bite)
    this.volume = 0.85;

    // Arpeggiator Settings
    this.arpMode = 'off'; // 'off', 'up', 'down', 'updown', 'random', 'chord'
    this.arpRate = '1/16'; // '1/4', '1/8', '1/16', '1/32'
    this.arpGate = 0.75;
    this.arpTimerId = null;
    this.arpIndex = 0;
    this.arpStepDir = 1;

    // Active playing voices: map of noteNumber -> array of active voice objects
    this.activeVoices = new Map();
    // Held keys for arpeggiator
    this.heldNotes = new Set();
    this.isPointerDown = false;

    // Dedicated Instrument Recorder State
    this.isRecording = false;
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recStartTime = 0;
    this.recTimerInterval = null;
    this.lastRecordedBuffer = null;
    this.lastRecordedBlob = null;
    this.previewSourceNode = null;
    this.isPreviewPlaying = false;

    // UI Elements
    this.section = document.getElementById('instrument-studio-section');
    this.btnToggle = document.getElementById('btn-toggle-synth');
    this.btnClose = document.getElementById('btn-close-synth');
    this.keyboardContainer = document.getElementById('synth-keyboard-container');

    // Controls
    this.selInstrument = document.getElementById('synth-instrument-select');
    this.sliderOctave = document.getElementById('synth-octave-slider');
    this.lblOctave = document.getElementById('synth-octave-display');
    this.sliderDetune = document.getElementById('synth-detune-slider');
    this.lblDetune = document.getElementById('synth-detune-display');
    this.sliderCutoff = document.getElementById('synth-cutoff-slider');
    this.lblCutoff = document.getElementById('synth-cutoff-display');
    this.sliderRes = document.getElementById('synth-res-slider');
    this.lblRes = document.getElementById('synth-res-display');
    this.sliderDrive = document.getElementById('synth-drive-slider');
    this.lblDrive = document.getElementById('synth-drive-display');
    this.sliderVolume = document.getElementById('synth-volume-slider');
    this.lblVolume = document.getElementById('synth-volume-display');

    // Arp Controls
    this.selArpMode = document.getElementById('synth-arp-mode');
    this.selArpRate = document.getElementById('synth-arp-rate');

    // Recording Controls & Result Bar UI
    this.btnRec = document.getElementById('btn-rec-synth');
    this.lblRecTimer = document.getElementById('synth-rec-timer');
    this.resultBar = document.getElementById('synth-rec-result-bar');
    this.inputRecName = document.getElementById('synth-rec-name');
    this.lblRecDuration = document.getElementById('synth-rec-duration-badge');
    this.btnPreview = document.getElementById('btn-synth-rec-preview');
    this.btnSaveVault = document.getElementById('btn-synth-rec-save-vault');
    this.btnDownload = document.getElementById('btn-synth-rec-download');
    this.btnDiscard = document.getElementById('btn-synth-rec-discard');

    // Instrument Presets Metadata
    this.presets = {
      tiesto_bass: {
        name: 'Tiësto DZZZ Bass',
        icon: '💥',
        cutoff: 4200,
        res: 6.5,
        octave: -1,
        attack: 0.003,
        release: 0.18,
        drive: 0.70
      },
      future_rave_bass: {
        name: 'Future Rave Bass',
        icon: '🚀',
        cutoff: 3600,
        res: 5.0,
        octave: -1,
        attack: 0.004,
        release: 0.22,
        drive: 0.65
      },
      piano: {
        name: 'Konzert-Klavier',
        icon: '🎹',
        cutoff: 5500,
        res: 1.0,
        octave: 0,
        attack: 0.005,
        release: 0.5,
        drive: 0.0
      },
      synth_lead: {
        name: 'EDM Club Synthesizer',
        icon: '⚡',
        cutoff: 4200,
        res: 4.5,
        octave: 0,
        attack: 0.01,
        release: 0.25,
        drive: 0.35
      },
      sub_bass: {
        name: 'Deep 808 Sub-Bass',
        icon: '🎸',
        cutoff: 280,
        res: 1.5,
        octave: -1,
        attack: 0.015,
        release: 0.45,
        drive: 0.15
      },
      acid_bass: {
        name: 'Acid / Slap Bass',
        icon: '🔊',
        cutoff: 1800,
        res: 8.5,
        octave: -1,
        attack: 0.005,
        release: 0.18,
        drive: 0.45
      },
      flute: {
        name: 'Flöte (Pan / Konzert)',
        icon: '🪈',
        cutoff: 4800,
        res: 2.0,
        octave: 1,
        attack: 0.06,
        release: 0.28,
        drive: 0.0
      },
      strings_pad: {
        name: 'Synth Strings & Pad',
        icon: '🎻',
        cutoff: 2400,
        res: 1.8,
        octave: 0,
        attack: 0.25,
        release: 0.95,
        drive: 0.1
      },
      organ: {
        name: 'Electro Club Orgel',
        icon: '🎶',
        cutoff: 6000,
        res: 2.0,
        octave: 0,
        attack: 0.005,
        release: 0.18,
        drive: 0.2
      },
      pluck_marimba: {
        name: 'Pluck / Marimba',
        icon: '🔔',
        cutoff: 5000,
        res: 3.0,
        octave: 0,
        attack: 0.002,
        release: 0.35,
        drive: 0.0
      }
    };

    // Note definitions for 2 Octaves (25 keys: C3 to C5)
    this.keyDefinitions = [
      // Octave 1
      { note: 'C3',  midi: 48, isBlack: false, keyLabel: 'A' },
      { note: 'C#3', midi: 49, isBlack: true,  keyLabel: 'W' },
      { note: 'D3',  midi: 50, isBlack: false, keyLabel: 'S' },
      { note: 'D#3', midi: 51, isBlack: true,  keyLabel: 'E' },
      { note: 'E3',  midi: 52, isBlack: false, keyLabel: 'D' },
      { note: 'F3',  midi: 53, isBlack: false, keyLabel: 'F' },
      { note: 'F#3', midi: 54, isBlack: true,  keyLabel: 'T' },
      { note: 'G3',  midi: 55, isBlack: false, keyLabel: 'G' },
      { note: 'G#3', midi: 56, isBlack: true,  keyLabel: 'Y' },
      { note: 'A3',  midi: 57, isBlack: false, keyLabel: 'H' },
      { note: 'A#3', midi: 58, isBlack: true,  keyLabel: 'U' },
      { note: 'B3',  midi: 59, isBlack: false, keyLabel: 'J' },
      // Octave 2
      { note: 'C4',  midi: 60, isBlack: false, keyLabel: 'K' },
      { note: 'C#4', midi: 61, isBlack: true,  keyLabel: 'O' },
      { note: 'D4',  midi: 62, isBlack: false, keyLabel: 'L' },
      { note: 'D#4', midi: 63, isBlack: true,  keyLabel: 'P' },
      { note: 'E4',  midi: 64, isBlack: false, keyLabel: 'Ö' },
      { note: 'F4',  midi: 65, isBlack: false, keyLabel: 'Ä' },
      { note: 'F#4', midi: 66, isBlack: true,  keyLabel: '2' },
      { note: 'G4',  midi: 67, isBlack: false, keyLabel: 'X' },
      { note: 'G#4', midi: 68, isBlack: true,  keyLabel: '3' },
      { note: 'A4',  midi: 69, isBlack: false, keyLabel: 'C' },
      { note: 'A#4', midi: 70, isBlack: true,  keyLabel: '4' },
      { note: 'B4',  midi: 71, isBlack: false, keyLabel: 'V' },
      // Top note
      { note: 'C5',  midi: 72, isBlack: false, keyLabel: 'B' }
    ];

    // Quick Chords
    this.quickChords = {
      'chord-c':  [48, 52, 55], // C-Dur (C, E, G)
      'chord-am': [45, 48, 52], // A-Moll (A, C, E)
      'chord-f':  [41, 45, 48], // F-Dur (F, A, C)
      'chord-g':  [43, 47, 50], // G-Dur (G, B, D)
      'chord-dm': [50, 53, 57], // D-Moll (D, F, A)
      'chord-em': [52, 55, 59]  // E-Moll (E, G, B)
    };

    this._renderKeyboard();
    this._attachEvents();
    this._attachKeyboardListener();
  }

  _renderKeyboard() {
    if (!this.keyboardContainer) return;
    this.keyboardContainer.innerHTML = '';

    const pianoEl = document.createElement('div');
    pianoEl.className = 'synth-piano-bed';

    let whiteCount = 0;
    this.keyDefinitions.forEach((def) => {
      const keyBtn = document.createElement('div');
      keyBtn.className = `synth-key ${def.isBlack ? 'black-key' : 'white-key'}`;
      keyBtn.dataset.midi = def.midi;
      keyBtn.dataset.note = def.note;

      if (!def.isBlack) {
        whiteCount++;
      } else {
        keyBtn.style.left = `calc(${whiteCount} * (100% / 15) - 14px)`;
      }

      keyBtn.innerHTML = `
        <span class="synth-key-name">${def.note}</span>
        <span class="synth-key-shortcut">${def.keyLabel}</span>
      `;

      // Touch & Mouse Support
      const startPlay = (e) => {
        if (e.cancelable && e.type.startsWith('touch')) e.preventDefault();
        window.audioEngine.unlockAudio();
        this.noteOn(def.midi);
        keyBtn.classList.add('pressed');
      };

      const stopPlay = (e) => {
        this.noteOff(def.midi);
        keyBtn.classList.remove('pressed');
      };

      keyBtn.addEventListener('mousedown', (e) => {
        this.isPointerDown = true;
        startPlay(e);
      });

      keyBtn.addEventListener('mouseenter', (e) => {
        if (this.isPointerDown) {
          startPlay(e);
        }
      });

      keyBtn.addEventListener('mouseleave', (e) => {
        if (this.isPointerDown) {
          stopPlay(e);
        }
      });

      keyBtn.addEventListener('mouseup', (e) => {
        stopPlay(e);
      });

      keyBtn.addEventListener('touchstart', (e) => {
        startPlay(e);
      }, { passive: false });

      keyBtn.addEventListener('touchend', (e) => {
        stopPlay(e);
      });

      pianoEl.appendChild(keyBtn);
    });

    window.addEventListener('mouseup', () => {
      this.isPointerDown = false;
    });

    this.keyboardContainer.appendChild(pianoEl);
  }

  _attachEvents() {
    // Section Drawer Toggle
    if (this.btnToggle && this.section) {
      const isVisible = !this.section.classList.contains('hidden');
      this.btnToggle.classList.toggle('active', isVisible);

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

    // Instrument Quick Preset Buttons
    document.querySelectorAll('.btn-synth-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inst = btn.dataset.instrument;
        this.selectInstrument(inst);
      });
    });

    // Instrument Dropdown (Mobile / Compact)
    if (this.selInstrument) {
      this.selInstrument.addEventListener('change', (e) => {
        this.selectInstrument(e.target.value);
      });
    }

    // Octave Slider
    if (this.sliderOctave) {
      this.sliderOctave.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.octaveShift = val;
        if (this.lblOctave) {
          this.lblOctave.textContent = val > 0 ? `+${val} OKT` : (val === 0 ? '0 (NORMAL)' : `${val} OKT`);
        }
      });
    }

    // Detune / Semitone Slider
    if (this.sliderDetune) {
      this.sliderDetune.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.detuneSemi = val;
        if (this.lblDetune) {
          this.lblDetune.textContent = val > 0 ? `+${val} ST` : (val === 0 ? '0' : `${val} ST`);
        }
      });
    }

    // Filter Cutoff Slider
    if (this.sliderCutoff) {
      this.sliderCutoff.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.filterCutoff = val;
        if (this.lblCutoff) {
          this.lblCutoff.textContent = `${Math.round(val)} Hz`;
        }
      });
    }

    // Filter Resonance Slider
    if (this.sliderRes) {
      this.sliderRes.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.filterResonance = val;
        if (this.lblRes) {
          this.lblRes.textContent = val.toFixed(1);
        }
      });
    }

    // Saturation / DZZZ-Bite Drive Slider
    if (this.sliderDrive) {
      this.sliderDrive.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.drive = val;
        if (this.lblDrive) {
          this.lblDrive.textContent = `${Math.round(val * 100)}%`;
        }
      });
    }

    // Dedicated Instrument Recording Button
    if (this.btnRec) {
      this.btnRec.addEventListener('click', () => {
        this.toggleRecording();
      });
    }

    // Recorded Riff Result Bar Controls
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

    // Deck load buttons for recorded riff
    document.querySelectorAll('.btn-load-synth-deck').forEach((btn) => {
      btn.addEventListener('click', () => {
        const deckId = btn.dataset.deck;
        this.loadRecordedToDeck(deckId);
      });
    });

    // Volume Slider
    if (this.sliderVolume) {
      this.sliderVolume.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        this.volume = val;
        if (this.lblVolume) {
          this.lblVolume.textContent = `${Math.round(val * 100)}%`;
        }
        if (window.audioEngine) {
          window.audioEngine.setSynthVolume(val);
        }
      });
    }

    // Arpeggiator Mode
    if (this.selArpMode) {
      this.selArpMode.addEventListener('change', (e) => {
        this.arpMode = e.target.value;
        this._updateArpeggiator();
      });
    }

    // Arpeggiator Rate (Speed)
    if (this.selArpRate) {
      this.selArpRate.addEventListener('change', (e) => {
        this.arpRate = e.target.value;
        this._updateArpeggiator();
      });
    }

    // Quick Chord Buttons
    document.querySelectorAll('.btn-quick-chord').forEach((btn) => {
      const chordId = btn.dataset.chord;
      const notes = this.quickChords[chordId] || [];

      const playChord = () => {
        window.audioEngine.unlockAudio();
        notes.forEach((m) => {
          this.noteOn(m);
          this._highlightKey(m, true);
        });
      };

      const stopChord = () => {
        notes.forEach((m) => {
          this.noteOff(m);
          this._highlightKey(m, false);
        });
      };

      btn.addEventListener('mousedown', playChord);
      btn.addEventListener('mouseup', stopChord);
      btn.addEventListener('mouseleave', stopChord);

      btn.addEventListener('touchstart', (e) => {
        if (e.cancelable) e.preventDefault();
        playChord();
      }, { passive: false });

      btn.addEventListener('touchend', stopChord);
    });
  }

  selectInstrument(instKey) {
    if (!this.presets[instKey]) return;
    this.currentInstrument = instKey;
    const p = this.presets[instKey];

    // Update preset buttons visual active state
    document.querySelectorAll('.btn-synth-preset').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.instrument === instKey);
    });

    if (this.selInstrument) {
      this.selInstrument.value = instKey;
    }

    // Apply default sound parameters for this instrument
    this.filterCutoff = p.cutoff;
    this.filterResonance = p.res;
    this.octaveShift = p.octave;
    this.attackTime = p.attack;
    this.releaseTime = p.release;
    this.drive = p.drive !== undefined ? p.drive : 0.2;

    // Update UI controls
    if (this.sliderCutoff) this.sliderCutoff.value = p.cutoff;
    if (this.lblCutoff) this.lblCutoff.textContent = `${Math.round(p.cutoff)} Hz`;
    if (this.sliderRes) this.sliderRes.value = p.res;
    if (this.lblRes) this.lblRes.textContent = p.res.toFixed(1);
    if (this.sliderOctave) this.sliderOctave.value = p.octave;
    if (this.lblOctave) {
      this.lblOctave.textContent = p.octave > 0 ? `+${p.octave} OKT` : (p.octave === 0 ? '0 (NORMAL)' : `${p.octave} OKT`);
    }
    if (this.sliderDrive) this.sliderDrive.value = this.drive;
    if (this.lblDrive) this.lblDrive.textContent = `${Math.round(this.drive * 100)}%`;

    // Current instrument banner / title
    const banner = document.getElementById('synth-active-instrument-title');
    if (banner) {
      banner.innerHTML = `${p.icon} <span>${p.name.toUpperCase()}</span>`;
    }
  }

  _attachKeyboardListener() {
    const keyMap = {
      'a': 48, // C3
      'w': 49, // C#3
      's': 50, // D3
      'e': 51, // D#3
      'd': 52, // E3
      'f': 53, // F3
      't': 54, // F#3
      'g': 55, // G3
      'y': 56, // G#3 (German QWERTZ / English QWERTY)
      'z': 56, // Z mapped as well for international layout
      'h': 57, // A3
      'u': 58, // A#3
      'j': 59, // B3
      'k': 60, // C4
      'o': 61, // C#4
      'l': 62, // D4
      'p': 63, // D#4
      'ö': 64, // E4
      'ä': 65, // F4
      '2': 66, // F#4
      'x': 67, // G4
      '3': 68, // G#4
      'c': 69, // A4
      '4': 70, // A#4
      'v': 71, // B4
      'b': 72  // C5
    };

    window.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.repeat) return;

      const k = e.key.toLowerCase();
      if (keyMap[k] !== undefined) {
        const midi = keyMap[k];
        window.audioEngine.unlockAudio();
        this.noteOn(midi);
        this._highlightKey(midi, true);
      }
    });

    window.addEventListener('keyup', (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (keyMap[k] !== undefined) {
        const midi = keyMap[k];
        this.noteOff(midi);
        this._highlightKey(midi, false);
      }
    });
  }

  _highlightKey(midi, isPressed) {
    const keyEl = this.keyboardContainer
      ? this.keyboardContainer.querySelector(`.synth-key[data-midi="${midi}"]`)
      : null;
    if (keyEl) {
      keyEl.classList.toggle('pressed', isPressed);
    }
  }

  midiToFreq(midi) {
    // Apply octave shift and semitone detune
    const effectiveMidi = midi + (this.octaveShift * 12) + this.detuneSemi;
    return 440 * Math.pow(2, (effectiveMidi - 69) / 12);
  }

  noteOn(midi) {
    this.heldNotes.add(midi);

    // If arpeggiator is running, let arpeggiator handle scheduling
    if (this.arpMode !== 'off') {
      this._updateArpeggiator();
      return;
    }

    this._startVoice(midi);
  }

  noteOff(midi) {
    this.heldNotes.delete(midi);

    if (this.arpMode !== 'off') {
      this._updateArpeggiator();
      return;
    }

    this._stopVoice(midi);
  }

  _getTanhCurve(drive) {
    const samples = 1024;
    const curve = new Float32Array(samples);
    const k = Math.max(1, 1 + drive * 28);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  _startVoice(midi) {
    if (!window.audioEngine) return;
    window.audioEngine.unlockAudio();
    const ctx = window.audioEngine.ctx;
    if (!ctx) return;

    // If already playing this note, stop previous instance
    this._stopVoice(midi);

    const freq = this.midiToFreq(midi);
    const now = ctx.currentTime;
    const inst = this.currentInstrument;

    // Filter Node
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(this.filterCutoff, now);
    filter.Q.setValueAtTime(this.filterResonance, now);

    // Gain / Envelope Node
    const envGain = ctx.createGain();
    envGain.gain.setValueAtTime(0.0001, now);

    // Route to synth gain bus (which routes to masterGain & recorder)
    const masterDest = window.audioEngine.synthGain || window.audioEngine.masterGain;
    filter.connect(envGain);
    envGain.connect(masterDest);

    const voice = {
      oscillators: [],
      noiseNodes: [],
      filter: filter,
      envGain: envGain,
      midi: midi,
      inst: inst
    };

    // Synthesize based on selected instrument
    switch (inst) {
      case 'tiesto_bass': {
        // Tiësto Brazilian / Slap House "DZZZ" Club Bass
        // 1. Dual Saturation Waveforms: Sawtooth + Square/Pulse with gritty phase detune
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, now);

        osc2.type = 'square';
        osc2.frequency.setValueAtTime(freq, now);
        osc2.detune.setValueAtTime(5.0, now); // 5 cents detune creates classic harmonic buzz

        // Snappy Kick-Style Pitch Drop Transient in first 35ms (The punchy "knock" attack)
        osc1.frequency.setValueAtTime(freq * 1.5, now);
        osc1.frequency.exponentialRampToValueAtTime(freq, now + 0.035);
        osc2.frequency.setValueAtTime(freq * 1.5, now);
        osc2.frequency.exponentialRampToValueAtTime(freq, now + 0.035);

        // Pre-gain stage into Waveshaper saturation
        const preGain = ctx.createGain();
        preGain.gain.setValueAtTime(0.75, now);
        osc1.connect(preGain);
        osc2.connect(preGain);

        // Non-linear Waveshaper for the authentic "DZZZ" overtone buzz
        const shaper = ctx.createWaveShaper();
        const driveAmt = Math.max(0.25, this.drive * 1.8);
        shaper.curve = this._getTanhCurve(driveAmt);
        shaper.oversample = '2x';

        preGain.connect(shaper);
        shaper.connect(filter);

        // 2. Sub Sine underneath: Bypasses distortion to guarantee clean, massive 40-80Hz sub pressure
        const subOsc = ctx.createOscillator();
        subOsc.type = 'sine';
        subOsc.frequency.setValueAtTime(freq, now);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.7, now);
        subOsc.connect(subGain);
        subGain.connect(envGain); // Straight into master envGain, clean & punchy

        // 3. Resonant Pluck Filter Envelope Sweep (Snaps open then drops fast to 150Hz in 160ms)
        filter.Q.setValueAtTime(Math.max(5.5, this.filterResonance), now);
        filter.frequency.setValueAtTime(Math.min(9500, this.filterCutoff * 2.2), now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(120, this.filterCutoff * 0.12), now + 0.16);

        // 4. Tight Amp Envelope (Instant Attack, Punchy Decay)
        envGain.gain.linearRampToValueAtTime(0.95, now + this.attackTime);
        envGain.gain.exponentialRampToValueAtTime(0.35, now + 0.18);

        [osc1, osc2, subOsc].forEach(o => { o.start(now); voice.oscillators.push(o); });
        break;
      }

      case 'future_rave_bass': {
        // David Guetta & MORTEN Future Rave Saturated Saw Bass
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const oscSub = ctx.createOscillator();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, now);
        osc1.detune.setValueAtTime(-9, now);

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq, now);
        osc2.detune.setValueAtTime(9, now);

        oscSub.type = 'triangle';
        oscSub.frequency.setValueAtTime(freq / 2, now); // Deep Sub body

        const preGain = ctx.createGain();
        preGain.gain.setValueAtTime(0.7, now);
        osc1.connect(preGain);
        osc2.connect(preGain);

        const shaper = ctx.createWaveShaper();
        shaper.curve = this._getTanhCurve(Math.max(0.2, this.drive * 1.5));
        shaper.oversample = '2x';
        preGain.connect(shaper);
        shaper.connect(filter);

        const subGain = ctx.createGain();
        subGain.gain.setValueAtTime(0.55, now);
        oscSub.connect(subGain);
        subGain.connect(filter);

        filter.Q.setValueAtTime(Math.max(4.5, this.filterResonance), now);
        filter.frequency.setValueAtTime(Math.min(8500, this.filterCutoff * 2.5), now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(160, this.filterCutoff * 0.15), now + 0.22);

        envGain.gain.linearRampToValueAtTime(0.9, now + this.attackTime);
        envGain.gain.exponentialRampToValueAtTime(0.45, now + 0.24);

        [osc1, osc2, oscSub].forEach(o => { o.start(now); voice.oscillators.push(o); });
        break;
      }

      case 'piano': {
        // Multi-harmonic acoustic piano emulation
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const osc3 = ctx.createOscillator();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(freq, now);

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq, now);

        osc3.type = 'sine';
        osc3.frequency.setValueAtTime(freq * 2, now); // 1st overtone

        const g1 = ctx.createGain();
        const g2 = ctx.createGain();
        const g3 = ctx.createGain();

        g1.gain.value = 0.7;
        g2.gain.value = 0.35;
        g3.gain.value = 0.15;

        osc1.connect(g1); g1.connect(filter);
        osc2.connect(g2); g2.connect(filter);
        osc3.connect(g3); g3.connect(filter);

        // Attack & natural acoustic decay
        envGain.gain.linearRampToValueAtTime(0.85, now + this.attackTime);
        envGain.gain.exponentialRampToValueAtTime(0.2, now + 1.2);

        [osc1, osc2, osc3].forEach(o => { o.start(now); voice.oscillators.push(o); });
        break;
      }

      case 'synth_lead': {
        // Dual Sawtooth with Detune & Fast Filter Envelope
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const subOsc = ctx.createOscillator();

        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(freq, now);
        osc1.detune.setValueAtTime(-8, now); // -8 cents

        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(freq, now);
        osc2.detune.setValueAtTime(8, now); // +8 cents

        subOsc.type = 'triangle';
        subOsc.frequency.setValueAtTime(freq / 2, now); // Sub-bass body

        osc1.connect(filter);
        osc2.connect(filter);
        subOsc.connect(filter);

        // Filter envelope sweep
        filter.frequency.setValueAtTime(Math.min(12000, this.filterCutoff * 2.8), now);
        filter.frequency.exponentialRampToValueAtTime(this.filterCutoff, now + 0.35);

        envGain.gain.linearRampToValueAtTime(0.75, now + this.attackTime);
        envGain.gain.exponentialRampToValueAtTime(0.55, now + 0.4);

        [osc1, osc2, subOsc].forEach(o => { o.start(now); voice.oscillators.push(o); });
        break;
      }

      case 'sub_bass': {
        // Massive 808 Sub-Bass with punchy pitch drop
        const osc = ctx.createOscillator();
        osc.type = 'sine';

        // Pitch envelope (kick-style snap)
        osc.frequency.setValueAtTime(freq * 1.8, now);
        osc.frequency.exponentialRampToValueAtTime(freq, now + 0.045);

        const subHarmonic = ctx.createOscillator();
        subHarmonic.type = 'triangle';
        subHarmonic.frequency.setValueAtTime(freq, now);

        const harmGain = ctx.createGain();
        harmGain.gain.value = 0.25;
        subHarmonic.connect(harmGain);
        harmGain.connect(filter);

        osc.connect(filter);

        filter.frequency.setValueAtTime(320, now);
        envGain.gain.linearRampToValueAtTime(0.95, now + this.attackTime);

        osc.start(now);
        subHarmonic.start(now);
        voice.oscillators.push(osc, subHarmonic);
        break;
      }

      case 'acid_bass': {
        // Resonant Acid 303 Sawtooth with snappy filter modulation
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(filter);

        filter.Q.setValueAtTime(Math.max(6.0, this.filterResonance), now);
        filter.frequency.setValueAtTime(Math.min(10000, this.filterCutoff * 3.5), now);
        filter.frequency.exponentialRampToValueAtTime(Math.max(120, this.filterCutoff * 0.4), now + 0.22);

        envGain.gain.linearRampToValueAtTime(0.85, now + this.attackTime);
        envGain.gain.exponentialRampToValueAtTime(0.3, now + 0.25);

        osc.start(now);
        voice.oscillators.push(osc);
        break;
      }

      case 'flute': {
        // Panflöte / Flute with Breath Noise & Vibrato LFO
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const osc2 = ctx.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(freq * 2, now); // Upper harmonic

        const g2 = ctx.createGain();
        g2.gain.value = 0.18;
        osc2.connect(g2);
        g2.connect(filter);

        // Vibrato LFO
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.setValueAtTime(5.5, now); // 5.5 Hz vibrato
        lfoGain.gain.setValueAtTime(0.001, now);
        lfoGain.gain.linearRampToValueAtTime(freq * 0.015, now + 0.35); // fade in vibrato
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(now);
        voice.oscillators.push(lfo);

        // Breath Noise (Air Texture)
        if (window.audioEngine.noiseBuffer) {
          const noise = ctx.createBufferSource();
          noise.buffer = window.audioEngine.noiseBuffer;
          noise.loop = true;

          const nFilter = ctx.createBiquadFilter();
          nFilter.type = 'bandpass';
          nFilter.frequency.setValueAtTime(Math.min(4500, freq * 2.5), now);
          nFilter.Q.setValueAtTime(3.0, now);

          const nGain = ctx.createGain();
          nGain.gain.setValueAtTime(0.08, now);

          noise.connect(nFilter);
          nFilter.connect(nGain);
          nGain.connect(filter);

          noise.start(now);
          voice.noiseNodes.push(noise);
        }

        osc.connect(filter);

        envGain.gain.linearRampToValueAtTime(0.8, now + this.attackTime);

        osc.start(now);
        osc2.start(now);
        voice.oscillators.push(osc, osc2);
        break;
      }

      case 'strings_pad': {
        // Lush String Ensemble Pad with slow attack & chorus detune
        [-12, -4, 4, 12].forEach((det) => {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(freq, now);
          o.detune.setValueAtTime(det, now);

          const g = ctx.createGain();
          g.gain.value = 0.22;
          o.connect(g);
          g.connect(filter);

          o.start(now);
          voice.oscillators.push(o);
        });

        envGain.gain.linearRampToValueAtTime(0.75, now + this.attackTime);
        break;
      }

      case 'organ': {
        // 90s House & Club Organ (Drawbar Harmonics)
        [1, 2, 3, 4].forEach((mult, idx) => {
          const o = ctx.createOscillator();
          o.type = idx === 1 ? 'triangle' : 'sine';
          o.frequency.setValueAtTime(freq * mult, now);

          const g = ctx.createGain();
          g.gain.value = [0.6, 0.35, 0.2, 0.1][idx];
          o.connect(g);
          g.connect(filter);

          o.start(now);
          voice.oscillators.push(o);
        });

        envGain.gain.linearRampToValueAtTime(0.85, now + this.attackTime);
        break;
      }

      case 'pluck_marimba': {
        // Woody Marimba / Pluck with quick bell-like decay
        [1, 2.76, 5.4].forEach((ratio, idx) => {
          const o = ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq * ratio, now);

          const g = ctx.createGain();
          g.gain.value = [0.8, 0.28, 0.12][idx];
          o.connect(g);
          g.connect(filter);

          o.start(now);
          voice.oscillators.push(o);
        });

        envGain.gain.linearRampToValueAtTime(0.9, now + this.attackTime);
        envGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        break;
      }
    }

    if (!this.activeVoices.has(midi)) {
      this.activeVoices.set(midi, []);
    }
    this.activeVoices.get(midi).push(voice);
  }

  _stopVoice(midi) {
    if (!this.activeVoices.has(midi)) return;
    const voices = this.activeVoices.get(midi);
    const ctx = window.audioEngine ? window.audioEngine.ctx : null;
    if (!ctx) return;

    const now = ctx.currentTime;
    const rel = Math.max(0.04, this.releaseTime);

    voices.forEach((v) => {
      try {
        v.envGain.gain.cancelScheduledValues(now);
        v.envGain.gain.setValueAtTime(v.envGain.gain.value, now);
        v.envGain.gain.exponentialRampToValueAtTime(0.0001, now + rel);

        setTimeout(() => {
          v.oscillators.forEach(o => { try { o.stop(); o.disconnect(); } catch (e) {} });
          v.noiseNodes.forEach(n => { try { n.stop(); n.disconnect(); } catch (e) {} });
          try { v.filter.disconnect(); v.envGain.disconnect(); } catch (e) {}
        }, (rel + 0.1) * 1000);
      } catch (err) {
        console.warn('Voice release cleanup notice:', err);
      }
    });

    this.activeVoices.delete(midi);
  }

  _stopAllVoices() {
    this.activeVoices.forEach((_, midi) => this._stopVoice(midi));
  }

  // ==========================================
  // ARPEGGIATOR & SPEED SYNCHRONIZER
  // ==========================================
  _updateArpeggiator() {
    if (this.arpTimerId) {
      clearInterval(this.arpTimerId);
      this.arpTimerId = null;
    }

    if (this.arpMode === 'off' || this.heldNotes.size === 0) {
      this._stopAllVoices();
      this.arpIndex = 0;
      return;
    }

    const bpm = (window.audioEngine && window.audioEngine.bpm) ? window.audioEngine.bpm : 120;
    const beatSec = 60 / bpm;

    // Rate calculations
    let stepDurationSec = beatSec * 0.25; // default 1/16
    if (this.arpRate === '1/4')  stepDurationSec = beatSec * 1.0;
    if (this.arpRate === '1/8')  stepDurationSec = beatSec * 0.5;
    if (this.arpRate === '1/16') stepDurationSec = beatSec * 0.25;
    if (this.arpRate === '1/32') stepDurationSec = beatSec * 0.125;

    const stepIntervalMs = stepDurationSec * 1000;

    // Execute first step immediately
    this._playArpStep();

    this.arpTimerId = setInterval(() => {
      this._playArpStep();
    }, stepIntervalMs);
  }

  _playArpStep() {
    if (this.heldNotes.size === 0) return;

    const sortedNotes = Array.from(this.heldNotes).sort((a, b) => a - b);
    const count = sortedNotes.length;

    let targetNotes = [];

    switch (this.arpMode) {
      case 'up':
        this.arpIndex = (this.arpIndex) % count;
        targetNotes = [sortedNotes[this.arpIndex]];
        this.arpIndex = (this.arpIndex + 1) % count;
        break;

      case 'down':
        this.arpIndex = (this.arpIndex) % count;
        targetNotes = [sortedNotes[count - 1 - this.arpIndex]];
        this.arpIndex = (this.arpIndex + 1) % count;
        break;

      case 'updown':
        targetNotes = [sortedNotes[this.arpIndex]];
        this.arpIndex += this.arpStepDir;
        if (this.arpIndex >= count) {
          this.arpIndex = Math.max(0, count - 2);
          this.arpStepDir = -1;
        } else if (this.arpIndex < 0) {
          this.arpIndex = Math.min(count - 1, 1);
          this.arpStepDir = 1;
        }
        break;

      case 'random':
        const r = Math.floor(Math.random() * count);
        targetNotes = [sortedNotes[r]];
        break;

      case 'chord':
        // Pulse all held notes together on the beat
        targetNotes = sortedNotes;
        break;

      default:
        targetNotes = [sortedNotes[0]];
    }

    // Retrigger selected notes
    targetNotes.forEach((midi) => {
      this._startVoice(midi);
      this._highlightKey(midi, true);
      setTimeout(() => {
        this._stopVoice(midi);
        if (!this.heldNotes.has(midi)) {
          this._highlightKey(midi, false);
        }
      }, 140);
    });
  }

  // ==========================================
  // INSTRUMENT RECORDER & RIFF EXPORT ENGINE
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

    if (!window.audioEngine.synthRecordDest || !window.audioEngine.synthRecordDest.stream) {
      alert('Audiotreiber für Instrumenten-Aufnahme nicht bereit. Bitte Seite aktualisieren.');
      return;
    }

    const stream = window.audioEngine.synthRecordDest.stream;

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

      // UI state updates
      if (this.btnRec) {
        this.btnRec.classList.add('recording');
        const lbl = this.btnRec.querySelector('.rec-label');
        if (lbl) lbl.textContent = '⏹ AUFNAHME BEENDEN';
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
      console.error('Fehler beim Starten der Instrumentenaufnahme:', err);
      alert('Fehler beim Starten der Instrumentenaufnahme: ' + err.message);
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
      const lbl = this.btnRec.querySelector('.rec-label');
      if (lbl) lbl.textContent = '🔴 RIFF AUFNEHMEN';
    }
    if (this.lblRecTimer) {
      this.lblRecTimer.style.display = 'none';
    }
  }

  async _processRecordedData() {
    if (!this.recordedChunks || this.recordedChunks.length === 0) {
      alert('Keine Audiodaten im aufgenommenen Riff gefunden.');
      return;
    }

    const rawBlob = new Blob(this.recordedChunks, { type: (this.mediaRecorder && this.mediaRecorder.mimeType) || 'audio/webm' });
    const ctx = window.audioEngine ? window.audioEngine.ctx : null;
    if (!ctx) return;

    try {
      const arrayBuf = await rawBlob.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuf);

      if (!decodedBuffer || decodedBuffer.length === 0) {
        alert('Aufnahme war leer.');
        return;
      }

      // Lossless WAV Blob creation using global audioBufferToWav
      const wavBlob = window.audioBufferToWav
        ? window.audioBufferToWav(decodedBuffer)
        : rawBlob;

      this.lastRecordedBuffer = decodedBuffer;
      this.lastRecordedBlob = wavBlob;

      const dur = decodedBuffer.duration;
      const durStr = dur >= 60
        ? `${Math.floor(dur / 60)}:${(dur % 60).toFixed(1).padStart(4, '0')} min`
        : `${dur.toFixed(1)}s`;

      const instName = this.presets[this.currentInstrument]?.name || 'Instrument';
      const cleanInstName = instName.replace(/[^a-zA-Z0-9]/g, '_');
      const timeTag = new Date().toTimeString().split(' ')[0].replace(/:/g, '-');

      if (this.inputRecName) {
        this.inputRecName.value = `${cleanInstName}_Riff_${timeTag}`;
      }
      if (this.lblRecDuration) {
        this.lblRecDuration.textContent = `⏱️ ${durStr}`;
      }
      if (this.resultBar) {
        this.resultBar.classList.remove('hidden');
        this.resultBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

    } catch (e) {
      console.error('Fehler beim Dekodieren des aufgenommenen Riffs:', e);
      alert('Konnte Riff-Aufnahme nicht verarbeiten: ' + e.message);
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
      src.connect(window.audioEngine.synthGain || window.audioEngine.masterGain);

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

    const name = (this.inputRecName ? this.inputRecName.value.trim() : '') || `Synth_Riff_${Date.now().toString().slice(-4)}`;
    const dur = this.lastRecordedBuffer.duration;
    const durStr = dur >= 60
      ? `${Math.floor(dur / 60)}:${(dur % 60).toFixed(1).padStart(4, '0')}`
      : `${dur.toFixed(1)}s`;

    const sampleObj = {
      id: 'sample_synth_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: name,
      sourceTrackName: `Studio (${this.presets[this.currentInstrument]?.name || 'Synthesizer'})`,
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

      // Visual success confirmation on button
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
      alert('Konnte Riff nicht in Sample-Bank speichern: ' + err.message);
    }
  }

  loadRecordedToDeck(deckId) {
    if (!this.lastRecordedBuffer) {
      alert('Keine Aufnahme vorhanden zum Laden.');
      return;
    }

    if (window.isDeckHidden && window.isDeckHidden(deckId)) {
      const deckLetter = deckId.split('-')[1].toUpperCase();
      const confirmUnhide = confirm(`⚠️ DECK ${deckLetter} ist momentan ausgeblendet!\n\nUm das aufgenommene Riff in DECK ${deckLetter} zu laden, muss der Player zuerst eingeblendet werden.\n\nMöchtest du DECK ${deckLetter} jetzt einblenden und das Riff laden?`);
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

    const name = (this.inputRecName ? this.inputRecName.value.trim() : '') || 'Synth_Riff';
    const dur = this.lastRecordedBuffer.duration;
    const durStr = dur >= 60 ? `${Math.floor(dur / 60)}:${(dur % 60).toFixed(1)}` : `${dur.toFixed(1)}s`;

    deck.audioBuffer = this.lastRecordedBuffer;
    deck.pauseOffset = 0;
    deck.stop();

    if (deck.trackNameEl) {
      deck.trackNameEl.textContent = `[RIFF] ${name} (${durStr})`;
    }

    deck._drawWaveform();
    deck.updateTimeDisplay();

    // Visual pulse on target deck badge
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

    const name = (this.inputRecName ? this.inputRecName.value.trim() : '') || 'Synth_Riff';
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

// Global initialization
window.initSynthStudio = () => {
  window.synthStudio = new SynthStudio();
};
