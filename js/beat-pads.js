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

    // Sequencer Grid: 4 tracks x 16 steps
    this.seqTracks = [
      { name: 'KICK',  sound: () => window.audioEngine.playKick(), steps: new Array(16).fill(false) },
      { name: 'SNARE', sound: () => window.audioEngine.playSnare(), steps: new Array(16).fill(false) },
      { name: 'HIHAT', sound: () => window.audioEngine.playHiHat(0, false), steps: new Array(16).fill(false) },
      { name: 'CLAP',  sound: () => window.audioEngine.playClap(), steps: new Array(16).fill(false) }
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

    this._initPads();
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
        
        // Haptic feedback for touch devices
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

  _attachKeyboard() {
    window.addEventListener('keydown', (e) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

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

  _renderSequencer() {
    const container = document.getElementById('seq-rows-container');
    if (!container) return;
    container.innerHTML = '';

    this.seqTracks.forEach((track, tIdx) => {
      const row = document.createElement('div');
      row.className = 'seq-row';

      const nameLabel = document.createElement('div');
      nameLabel.className = 'seq-track-name';
      nameLabel.textContent = track.name;
      row.appendChild(nameLabel);

      const stepsBox = document.createElement('div');
      stepsBox.className = 'seq-steps';

      track.steps.forEach((active, sIdx) => {
        const stepBtn = document.createElement('div');
        stepBtn.className = `seq-step ${active ? 'active' : ''}`;
        stepBtn.dataset.track = tIdx;
        stepBtn.dataset.step = sIdx;

        stepBtn.addEventListener('pointerdown', () => {
          track.steps[sIdx] = !track.steps[sIdx];
          stepBtn.classList.toggle('active', track.steps[sIdx]);
          if (track.steps[sIdx]) {
            window.audioEngine.unlockAudio();
            track.sound();
          }
        });

        stepsBox.appendChild(stepBtn);
      });

      row.appendChild(stepsBox);
      container.appendChild(row);
    });

    const btnPlaySeq = document.getElementById('seq-btn-play');
    if (btnPlaySeq) {
      btnPlaySeq.addEventListener('click', () => {
        window.audioEngine.unlockAudio();
        this.toggleSequencer();
      });
    }

    const btnClearSeq = document.getElementById('seq-btn-clear');
    if (btnClearSeq) {
      btnClearSeq.addEventListener('click', () => {
        this.clearSequencer();
      });
    }
  }

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
      btn.style.background = '#ef4444';
      btn.style.color = '#ffffff';
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
      btn.style.background = 'var(--neon-green)';
      btn.style.color = '#000000';
    }
  }

  clearSequencer() {
    this.seqTracks.forEach(t => t.steps.fill(false));
    document.querySelectorAll('.seq-step').forEach(el => el.classList.remove('active'));
  }

  _stepLoop() {
    if (!this.isPlayingSeq) return;

    // Trigger sounds for active tracks at this step
    this.seqTracks.forEach((track) => {
      if (track.steps[this.currentStep]) {
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
}

window.initBeatStudio = () => {
  window.beatStudio = new BeatStudio();
};
