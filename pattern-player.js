// pattern-player.js
// Reusable Tone.js-based playback engine for PatternLogic guitar patterns.
//
// This is the Milestone 1 scaffolding — class and method signatures are defined,
// but implementations are pulled in gradually from PatternLogic's index.html.
//
// See README.md and API.md for usage.

/**
 * Minimal event emitter used internally by PatternPlayer.
 * Consumers use player.on('step', handler) etc. to react to playback events.
 */
class EventEmitter {
  constructor() { this._handlers = {}; }
  on(event, handler) {
    (this._handlers[event] = this._handlers[event] || []).push(handler);
    return () => this.off(event, handler);
  }
  off(event, handler) {
    const list = this._handlers[event];
    if (!list) return;
    const idx = list.indexOf(handler);
    if (idx >= 0) list.splice(idx, 1);
  }
  emit(event, payload) {
    const list = this._handlers[event];
    if (!list) return;
    for (const h of list) {
      try { h(payload); } catch (err) { console.error(`[PatternPlayer] handler error for "${event}":`, err); }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Voicing engine constants (to be populated in Step 1)
// ─────────────────────────────────────────────────────────────────────────────

// E/A barre shape templates — placeholder, filled in Step 1
export const SHAPES = {};

// Chord quality → semitone offsets per string — placeholder
export const CHORD_OFFSETS = {};

// Beat-to-step / step-to-beat mappings — placeholder
export const BEAT_TO_STEP = {};
export const STEP_TO_BEAT = {};
export const BEAT_TO_STEP_32 = {};
export const STEP_TO_BEAT_32 = {};

// Velocity accent per beat position — placeholder
export const BEAT_ACCENT = {};

// Note-name normalization — placeholder
export const FLAT_TO_SHARP = {};

// Sequence parser quality map — placeholder
export const SEQ_QUALITY_MAP = {};

// ─────────────────────────────────────────────────────────────────────────────
// Pure utilities (no DOM, no Tone.js state) — to be filled in Step 1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse chord sequence text into array of chord descriptors.
 * Example: "C G Am(001) F.." → [{root, quality, beats, patternId, ...}, ...]
 */
export function parseSequence(text, opts = {}) {
  // Placeholder — implementation moves in Step 1
  throw new Error('parseSequence: not yet implemented (Milestone 1 / Step 1)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Main class
// ─────────────────────────────────────────────────────────────────────────────

export class PatternPlayer extends EventEmitter {
  /**
   * @param {object} config
   * @param {Tone.Sampler} config.guitarSampler  — REQUIRED, pre-loaded Tone.Sampler
   * @param {Tone.Sampler} [config.muteSampler]  — optional palm-mute variant sampler
   * @param {number}       [config.bpm=100]
   * @param {string}       [config.timeSignature='4/4']  — '4/4' | '3/4'
   */
  constructor(config = {}) {
    super();
    if (!config.guitarSampler) {
      throw new Error('PatternPlayer: config.guitarSampler is required (pass a Tone.Sampler instance).');
    }
    this._guitarSampler = config.guitarSampler;
    this._muteSampler   = config.muteSampler || null;
    this._bpm           = config.bpm || 100;
    this._timeSignature = config.timeSignature || '4/4';

    // Internal state (populated as milestones land)
    this._currentVoicing = null;
    this._currentPattern = null;
    this._isPlaying = false;
    this._isPlayingSequence = false;
  }

  // ─── Voicing ─────────────────────────────────────────────────────────────
  setChord({ root, quality, shape = 'E', shapeOctave = 1 }) {
    throw new Error('setChord: not yet implemented (Step 2)');
  }

  // ─── Single-chord playback ───────────────────────────────────────────────
  loadPattern(patternJson) {
    throw new Error('loadPattern: not yet implemented (Step 2)');
  }
  play() {
    throw new Error('play: not yet implemented (Step 2)');
  }
  hotUpdatePattern(newPatternJson) {
    throw new Error('hotUpdatePattern: not yet implemented (Step 4)');
  }

  // ─── Sequence playback ───────────────────────────────────────────────────
  playSequence(text, opts = {}) {
    throw new Error('playSequence: not yet implemented (Step 3)');
  }

  // ─── Common ──────────────────────────────────────────────────────────────
  stop() {
    throw new Error('stop: not yet implemented (Step 2)');
  }

  // ─── Runtime config ──────────────────────────────────────────────────────
  setBpm(bpm) {
    this._bpm = bpm;
    if (typeof Tone !== 'undefined' && Tone.Transport) Tone.Transport.bpm.value = bpm;
  }
  setTimeSignature(ts) {
    this._timeSignature = ts;
  }
  setMuteSampler(sampler) {
    this._muteSampler = sampler;
  }

  // ─── Static utilities ────────────────────────────────────────────────────
  static generateVoicing({ root, quality, shape = 'E', shapeOctave = 1 }) {
    throw new Error('PatternPlayer.generateVoicing: not yet implemented (Step 1)');
  }
  static getAllPositions({ root, quality, shapeFilter }) {
    throw new Error('PatternPlayer.getAllPositions: not yet implemented (Step 1)');
  }
  static compilePattern(patternJson) {
    throw new Error('PatternPlayer.compilePattern: not yet implemented (Step 1)');
  }
}

// Default export for convenience
export default PatternPlayer;
