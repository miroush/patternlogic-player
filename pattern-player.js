// pattern-player.js
// Reusable Tone.js-based playback engine for PatternLogic guitar patterns.
//
// STEP 1 (pure utilities) is implemented: voicing engine, chord positions,
// pattern compilation, sequence parser. Steps 2–5 (playback, events, runtime
// updates) are scaffolded but not yet implemented.
//
// This module expects the global `Tone` to exist (Tone.js v14.x, loaded via
// <script src="https://unpkg.com/tone/..."></script> or similar).
//
// See README.md for usage, pattern.schema.json for the pattern format.

// ─────────────────────────────────────────────────────────────────────────────
// Event emitter (internal, used by PatternPlayer instances)
// ─────────────────────────────────────────────────────────────────────────────

class EventEmitter {
  constructor() { this._handlers = {}; }
  on(event, handler) {
    (this._handlers[event] = this._handlers[event] || []).push(handler);
    return () => this.off(event, handler);
  }
  off(event, handler) {
    if (!handler) {
      // off(event) bez handleru → smazat všechny handlery daného eventu
      delete this._handlers[event];
      return;
    }
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
// Constants — E/A barre shapes and chord qualities
// ─────────────────────────────────────────────────────────────────────────────

/** Barre fret for each root when using E-shape (string 6 = bass) */
export const E_BASE_FRET = { E:0, F:1, 'F#':2, G:3, 'G#':4, A:5, 'A#':6, B:7, C:8, 'C#':9, D:10, 'D#':11 };

/** Barre fret for each root when using A-shape (string 5 = bass) */
export const A_BASE_FRET = { A:0, 'A#':1, B:2, C:3, 'C#':4, D:5, 'D#':6, E:7, F:8, 'F#':9, G:10, 'G#':11 };

/** Maximum playable barre fret (higher positions are impractical) */
export const MAX_BARRE_FRET = 15;

/** Shape templates: semitone intervals per string for E/A barre forms × qualities.
 *  Used by generateVoicing() to compute actual pitches. */
export const SHAPES = {
  "E": {
    "maj" : {1:24,2:19,3:16,4:12,5:7,6:0},
    "min" : {1:24,2:19,3:15,4:12,5:7,6:0},
    "7"   : {1:24,2:19,3:16,4:10,5:7,6:0},
    "maj7": {1:24,2:19,3:16,4:11,5:7,6:0},
    "min7": {1:24,2:19,3:15,4:10,5:7,6:0},
    "dim" : {1:24,2:21,3:15,4:12,5:6,6:0},
    "aug" : {1:24,2:20,3:16,4:12,5:8,6:0},
    "sus2": {1:24,2:17,3:14,4:12,5:7,6:0},
    "sus4": {1:24,2:19,3:17,4:12,5:7,6:0},
    "add9": {1:26,2:19,3:16,4:12,5:7,6:0},
    "6"   : {1:21,2:19,3:16,4:12,5:7,6:0},
    "m6"  : {1:21,2:19,3:15,4:12,5:7,6:0},
    "9"   : {1:26,2:19,3:16,4:10,5:7,6:0}
  },
  "A": {
    "maj" : {1:19,2:16,3:12,4:7,5:0,6:-5},
    "min" : {1:19,2:15,3:12,4:7,5:0,6:-5},
    "7"   : {1:19,2:16,3:10,4:7,5:0,6:-5},
    "maj7": {1:19,2:16,3:11,4:7,5:0,6:-5},
    "min7": {1:19,2:15,3:10,4:7,5:0,6:-5},
    "dim" : {1:21,2:15,3:12,4:6,5:0,6:-5},
    "aug" : {1:20,2:16,3:12,4:8,5:0,6:-5},
    "sus2": {1:17,2:14,3:12,4:7,5:0,6:-5},
    "sus4": {1:19,2:17,3:12,4:7,5:0,6:-5},
    "add9": {1:21,2:16,3:12,4:7,5:0,6:-5},
    "6"   : {1:16,2:16,3:12,4:7,5:0,6:-5},
    "m6"  : {1:16,2:15,3:12,4:7,5:0,6:-5},
    "9"   : {1:21,2:16,3:10,4:7,5:0,6:-5}
  }
};

/** Fret offsets relative to barre fret (null = muted string).
 *  Used by getAllPositions() to show where each string is played. */
export const CHORD_OFFSETS = {
  "E": {
    "maj" : {6:0,5:2,4:2,3:1,2:0,1:0},
    "min" : {6:0,5:2,4:2,3:0,2:0,1:0},
    "7"   : {6:0,5:2,4:0,3:1,2:0,1:0},
    "maj7": {6:0,5:2,4:1,3:1,2:0,1:0},
    "min7": {6:0,5:2,4:0,3:0,2:0,1:0},
    "dim" : {6:0,5:1,4:2,3:0,2:2,1:0},
    "aug" : {6:0,5:3,4:2,3:1,2:1,1:0},
    "sus2": {6:0,5:2,4:2,3:2,2:0,1:0},
    "sus4": {6:0,5:2,4:2,3:2,2:3,1:0},
    "add9": {6:0,5:2,4:2,3:1,2:0,1:2},
    "6"   : {6:0,5:2,4:2,3:1,2:2,1:0},
    "m6"  : {6:0,5:2,4:2,3:0,2:2,1:0},
    "9"   : {6:0,5:2,4:0,3:1,2:0,1:2}
  },
  "A": {
    "maj" : {6:null,5:0,4:2,3:2,2:2,1:0},
    "min" : {6:null,5:0,4:2,3:2,2:1,1:0},
    "7"   : {6:null,5:0,4:2,3:0,2:2,1:0},
    "maj7": {6:null,5:0,4:2,3:1,2:2,1:0},
    "min7": {6:null,5:0,4:2,3:0,2:1,1:0},
    "dim" : {6:null,5:0,4:1,3:2,2:1,1:2},
    "aug" : {6:null,5:0,4:3,3:2,2:2,1:1},
    "sus2": {6:null,5:0,4:2,3:2,2:0,1:0},
    "sus4": {6:null,5:0,4:2,3:2,2:3,1:0},
    "add9": {6:null,5:0,4:2,3:2,2:2,1:2},
    "6"   : {6:null,5:0,4:2,3:2,2:2,1:2},
    "m6"  : {6:null,5:0,4:2,3:2,2:1,1:2},
    "9"   : {6:null,5:0,4:2,3:0,2:2,1:2}
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants — beat grids (16n and 32n)
// ─────────────────────────────────────────────────────────────────────────────

/** 16n grid: beat notation → step index (0–15). 4 steps per beat. */
export const BEAT_TO_STEP = {
  "1":0,"1e":1,"1+":2,"1a":3,
  "2":4,"2e":5,"2+":6,"2a":7,
  "3":8,"3e":9,"3+":10,"3a":11,
  "4":12,"4e":13,"4+":14,"4a":15
};
/** 16n grid: step index → beat notation. */
export const STEP_TO_BEAT = Object.fromEntries(
  Object.entries(BEAT_TO_STEP).map(([b, s]) => [s, b])
);

/** 32n grid: beat notation → step index (0–31). 8 steps per beat.
 *  The "." suffix marks 32nd note positions between standard 16th notes. */
export const BEAT_TO_STEP_32 = {
  "1":0,  "1.":1,  "1e":2,  "1e.":3,
  "1+":4, "1+.":5, "1a":6,  "1a.":7,
  "2":8,  "2.":9,  "2e":10, "2e.":11,
  "2+":12,"2+.":13,"2a":14, "2a.":15,
  "3":16, "3.":17, "3e":18, "3e.":19,
  "3+":20,"3+.":21,"3a":22, "3a.":23,
  "4":24, "4.":25, "4e":26, "4e.":27,
  "4+":28,"4+.":29,"4a":30, "4a.":31
};
/** 32n grid: step index → beat notation. */
export const STEP_TO_BEAT_32 = Object.fromEntries(
  Object.entries(BEAT_TO_STEP_32).map(([b, s]) => [s, b])
);

/** Velocity accent coefficient per beat position (1.0 = full, <1.0 = softer). */
export const BEAT_ACCENT = {
  "1":1.00,"1.":0.78,"1e":0.82,"1e.":0.76,"1+":0.88,"1+.":0.76,"1a":0.80,"1a.":0.74,
  "2":0.92,"2.":0.76,"2e":0.80,"2e.":0.74,"2+":0.85,"2+.":0.75,"2a":0.78,"2a.":0.73,
  "3":0.96,"3.":0.77,"3e":0.81,"3e.":0.75,"3+":0.88,"3+.":0.76,"3a":0.79,"3a.":0.73,
  "4":0.90,"4.":0.76,"4e":0.80,"4e.":0.74,"4+":0.82,"4+.":0.74,"4a":0.77,"4a.":0.72
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants — sequence parser
// ─────────────────────────────────────────────────────────────────────────────

/** Normalize flat note names to sharps (Tone.js prefers sharps). */
export const FLAT_TO_SHARP = {
  'Db':'C#', 'Eb':'D#', 'Gb':'F#', 'Ab':'G#', 'Bb':'A#', 'Cb':'B', 'Fb':'E'
};

/** Raw quality notation → internal quality key used in SHAPES / CHORD_OFFSETS. */
export const SEQ_QUALITY_MAP = {
  '': 'maj', 'm': 'min', '7': '7', 'maj7': 'maj7', 'min7': 'min7', 'm7': 'min7',
  'dim': 'dim', 'aug': 'aug', 'sus2': 'sus2', 'sus4': 'sus4',
  'add9': 'add9', '6': '6', 'm6': 'm6', '9': '9'
};

// ─────────────────────────────────────────────────────────────────────────────
// Pure utilities — voicing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute note names for all 6 strings + bass variants of a chord at a given position.
 *
 * @param {object} position - Position descriptor from getAllPositions()
 * @param {'E'|'A'} position.shape - Barre shape
 * @param {string}  position.baseNote - Root note (e.g. 'C3'), computed by getAllPositions()
 * @param {string}  quality - Chord quality ('maj', 'min', '7', ...) — must be a key in SHAPES[shape]
 * @returns {object} Voicing: { 1..6: string note names, bass_root, bass_alt }
 *
 * @example
 *   const positions = getAllPositions({ root: 'C', quality: 'maj' });
 *   const voicing = generateVoicing(positions[0], 'maj');
 *   // { 1: 'C5', 2: 'G4', ..., bass_root: 'C3', bass_alt: 'G3' }
 */
export function generateVoicing(position, quality) {
  if (typeof Tone === 'undefined') {
    throw new Error('generateVoicing: Tone.js is required (global Tone not found).');
  }
  const iv = SHAPES[position.shape][quality];
  if (!iv) throw new Error(`generateVoicing: unknown quality "${quality}" for shape "${position.shape}"`);
  const base = Tone.Frequency(position.baseNote);
  return {
    1: base.transpose(iv[1]).toNote(),
    2: base.transpose(iv[2]).toNote(),
    3: base.transpose(iv[3]).toNote(),
    4: base.transpose(iv[4]).toNote(),
    5: base.transpose(iv[5]).toNote(),
    6: base.transpose(iv[6]).toNote(),
    "bass_root": position.baseNote,
    "bass_alt":  base.transpose(7).toNote()
  };
}

/**
 * Resolve abstract string references (bass_root/bass_alt/bass_3) to physical string numbers (1–6)
 * based on the current barre shape. For E-shape: bass_root=6, bass_alt=5, bass_3=4.
 * For A-shape: bass_root=5, bass_alt=4, bass_3=3.
 *
 * @param {Array<number|string>} strings - Mix of numeric string numbers and abstract names
 * @param {'E'|'A'} shape - Current barre shape
 * @returns {Array<number>} Physical string numbers (1–6)
 */
export function resolveStrings(strings, shape) {
  const bassRoot = shape === 'E' ? 6 : 5;
  const bassAlt  = shape === 'E' ? 5 : 4;
  const bass3    = shape === 'E' ? 4 : 3;
  return strings.map(s =>
    s === 'bass_root' ? bassRoot :
    s === 'bass_alt'  ? bassAlt  :
    s === 'bass_3'    ? bass3    : s
  );
}

/**
 * Get all playable barre positions for a given chord.
 *
 * @param {object} opts
 * @param {string}              opts.root          - Root note ('A', 'C#', ...) — must be normalized (use FLAT_TO_SHARP to convert 'Db'→'C#' etc.)
 * @param {string}              opts.quality       - Chord quality ('maj', 'min', '7', ...)
 * @param {'auto'|'E'|'A'}      [opts.shapeFilter='auto'] - Filter to specific shape or return both
 * @returns {Array<object>} Array of positions: [{ shape, barFret, frets, baseNote }, ...]
 *                          sorted by barre fret ascending (E-shape preferred at equal fret).
 */
export function getAllPositions({ root, quality, shapeFilter = 'auto' }) {
  if (typeof Tone === 'undefined') {
    throw new Error('getAllPositions: Tone.js is required (global Tone not found).');
  }
  const positions = [];

  const addPos = (shape, barFret) => {
    if (barFret < 0 || barFret > MAX_BARRE_FRET) return;
    if (shapeFilter !== 'auto' && shape !== shapeFilter) return;
    const off = CHORD_OFFSETS[shape][quality];
    if (!off) return;
    const frets = {};
    for (let s = 1; s <= 6; s++) {
      frets[s] = off[s] === null ? null : barFret + off[s];
    }
    const baseNote = Tone.Frequency(shape === 'E' ? 'E2' : 'A2').transpose(barFret).toNote();
    positions.push({ shape, barFret, frets, baseNote });
  };

  const eF = E_BASE_FRET[root];
  if (eF !== undefined) { addPos('E', eF); addPos('E', eF + 12); }

  const aF = A_BASE_FRET[root];
  if (aF !== undefined) { addPos('A', aF); addPos('A', aF + 12); }

  positions.sort((a, b) => a.barFret - b.barFret || (a.shape === 'E' ? -1 : 1));
  return positions;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure utilities — pattern compilation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compile a pattern JSON into a step-indexed grid of events, plus pre-computed
 * "ring" durations for notes that should hold until the next hit on the same string.
 *
 * @param {object} pattern - Pattern JSON (see pattern.schema.json)
 * @returns {{ grid: Array<Array<object>>, loopLen: number }}
 */
export function compilePattern(pattern) {
  const loopLen = pattern.loop_steps || 16;
  const beatMap = pattern.resolution === '32n' ? BEAT_TO_STEP_32 : BEAT_TO_STEP;
  const grid = Array.from({ length: loopLen }, () => []);
  for (const step of pattern.steps) {
    const idx = beatMap[step.beat];
    if (idx !== undefined && idx < loopLen) grid[idx].push(step);
  }

  // Pre-compute "ring" durations. Two variants:
  //   _resolvedRingDur     = capped at loop end (next loop is a different chord)
  //   _resolvedRingDurNoCap = uncapped (next loop continues same chord → ring bleeds over)
  const STEP_DUR = { 1: "16n", 2: "8n", 3: "8n.", 4: "4n", 6: "4n.", 8: "2n", 12: "2n.", 16: "1n" };
  for (let i = 0; i < loopLen; i++) {
    grid[i].forEach(event => {
      // Clear stale values (could be from a previous compile if the event is shared)
      delete event._resolvedRingDur;
      delete event._resolvedRingDurNoCap;
      if (event.duration !== 'ring' && !pattern.humanization?.default_single_duration) return;
      const usesRing = event.duration === 'ring' ||
        (pattern.humanization?.default_single_duration === 'ring' && event.strings.length === 1 && !event.duration);
      if (!usesRing) return;

      // For each string in this event, find when it next rings (cyclic over loop)
      let minDist = loopLen;
      event.strings.forEach(str => {
        for (let d = 1; d < loopLen; d++) {
          const nextIdx = (i + d) % loopLen;
          const hits = grid[nextIdx].some(ev => ev.strings.includes(str));
          if (hits) { minDist = Math.min(minDist, d); return; }
        }
      });

      // If string is hit multiple times in the bar: shorten by 1 step (gap before next hit → no overlap)
      // If hit only once: cap at half a bar (sampler release covers the rest)
      let safeDistNoCap;
      if (minDist < loopLen) {
        safeDistNoCap = Math.max(1, minDist - 1);
      } else {
        safeDistNoCap = 8;
      }
      // Capped: note must not extend past end of loop
      const safeDist = Math.min(safeDistNoCap, Math.max(1, loopLen - i - 1));
      const STEP_KEYS = [1, 2, 3, 4, 6, 8, 12, 16];
      const nearestKey = STEP_KEYS.filter(k => k <= safeDist).pop() || 1;
      const nearestKeyNoCap = STEP_KEYS.filter(k => k <= safeDistNoCap).pop() || 1;
      event._resolvedRingDur = STEP_DUR[nearestKey] || '2n';
      event._resolvedRingDurNoCap = STEP_DUR[nearestKeyNoCap] || '2n';
    });
  }

  return { grid, loopLen };
}

/**
 * Resolve the final duration for a step event, respecting explicit duration,
 * pre-computed ring durations, pattern-level humanization defaults, and boundary rules.
 *
 * @param {object}  event - Step event from a pattern
 * @param {object}  pattern - Whole pattern JSON (for humanization defaults and style fallback)
 * @param {boolean} [allowCrossBoundary=false] - If true, use uncapped ring duration (same chord continues)
 * @returns {string} Tone.js duration string (e.g. '4n', '8n', '2n')
 */
export function resolveDuration(event, pattern, allowCrossBoundary = false) {
  if (event.duration && event.duration !== 'ring') return event.duration;
  const ringDur = (allowCrossBoundary && event._resolvedRingDurNoCap) ? event._resolvedRingDurNoCap : event._resolvedRingDur;
  if (ringDur) return ringDur;
  const h = pattern.humanization || {};
  if (event.technique === 'palm_mute') return h.palm_mute_duration || '8n';
  if (h.default_duration) return h.default_duration;
  if (h.default_single_duration === 'ring' && event.strings.length === 1) {
    return (allowCrossBoundary && event._resolvedRingDurNoCap) || event._resolvedRingDur || '2n';
  }
  if (pattern.meta?.style === 'fingerpick') return '4n';
  return event.strings.length === 1 ? '4n' : '2n';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure utilities — chord sequence parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a chord sequence text into an array of chord descriptors.
 *
 * Notation:
 *   A, Am, Amin7 — chord (maj/min/quality), full measure
 *   C.           — half measure (2 beats in 4/4)
 *   G..          — one beat
 *   Am(001)      — chord with pattern code override (lookup via patNumMap)
 *   F(e), F(a2)  — explicit shape (E or A), optional octave shift
 *   C.(001a)     — combined: half measure + pattern 001 + A-shape
 *
 * @param {string} text - Free-form chord sequence text (whitespace-separated tokens)
 * @param {object} [opts]
 * @param {'4/4'|'3/4'} [opts.timeSignature='4/4'] - Affects measure length
 * @param {object} [opts.patNumMap={}] - Map from pattern code → pattern ID, used for `Am(001)` resolution
 * @returns {Array<object>} Chord descriptors:
 *   [{ root, quality, steps, beats, patternId, patNum, shape, shapeOctave, _src }, ...]
 */
export function parseSequence(text, opts = {}) {
  const timeSig = opts.timeSignature || '4/4';
  const patNumMap = opts.patNumMap || {};
  const tokens = (text || '').trim().split(/\s+/).filter(Boolean);
  const chords = [];
  const stepsPerBeat = 4; // 16n grid (canonical unit)
  const beatsPerMeasure = timeSig === '3/4' ? 3 : 4;
  const fullMeasure = beatsPerMeasure * stepsPerBeat;

  for (const tok of tokens) {
    // Regex: root + optional quality + dots + optional (instruction)
    // Instruction: pattern code (1–3 chars) and/or shape (e|a|e2|a2)
    const m = tok.match(/^([A-G][#b]?)(m(?:in)?7?|maj7|dim|aug|sus[24]|add9|[679]|m6)?(\.*)?(?:\(([^)]*)\))?$/i);
    if (!m) continue;
    const root = m[1].charAt(0).toUpperCase() + m[1].slice(1);
    const qRaw = (m[2] || '').toLowerCase();
    const quality = SEQ_QUALITY_MAP[qRaw] || qRaw || 'maj';
    const dots = (m[3] || '').length;

    // Parse (...) content: pattern code + shape (e/a/e2/a2)
    let patNum = null;
    let shape = null;
    let shapeOctave = 1;
    const instr = (m[4] || '').trim();
    if (instr) {
      const im = instr.match(/^([a-z0-9]{1,3})?\s*([ea]2?)?$/i);
      if (im) {
        if (im[1]) {
          // "a", "e", "a2", "e2" alone = shape, not pattern code
          if (/^[ea]2?$/i.test(im[1]) && !im[2]) {
            const s = im[1].toLowerCase();
            shape = s.charAt(0) === 'a' ? 'A' : 'E';
            shapeOctave = s.endsWith('2') ? 2 : 1;
          } else {
            patNum = im[1].toLowerCase();
          }
        }
        if (im[2]) {
          const s = im[2].toLowerCase();
          shape = s.charAt(0) === 'a' ? 'A' : 'E';
          shapeOctave = s.endsWith('2') ? 2 : 1;
        }
      }
    }

    // Length: 0 dots = full measure, 1 = half, 2+ = one beat
    // `steps` kept (16n units) for backward compatibility
    // `beats` is grid-independent (quarter notes) — used by the scheduler
    let steps, beats;
    if (dots === 0)      { steps = fullMeasure;     beats = beatsPerMeasure; }
    else if (dots === 1) { steps = fullMeasure / 2; beats = beatsPerMeasure / 2; }
    else                 { steps = stepsPerBeat;    beats = 1; }

    const patternId = patNum ? (patNumMap[patNum] || null) : null;

    chords.push({ root, quality, steps, beats, patternId, patNum, shape, shapeOctave, _src: tok });
  }
  return chords;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main class — PatternPlayer (steps 2–5 not yet implemented)
// ─────────────────────────────────────────────────────────────────────────────

export class PatternPlayer extends EventEmitter {
  /**
   * @param {object} config
   * @param {object} config.guitarSampler - REQUIRED, a pre-loaded Tone.Sampler
   * @param {object} [config.muteSampler] - Optional palm-mute variant sampler
   * @param {number} [config.bpm=100]
   * @param {'4/4'|'3/4'} [config.timeSignature='4/4']
   * @param {object} [config.humanization] - { velVariance, accentStrength, timingVarianceMs }
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
    // Globální humanizace (navíc k té z pattern.humanization)
    this._humanization = {
      velVariance:       config.humanization?.velVariance       ?? 0.08,
      accentStrength:    config.humanization?.accentStrength    ?? 0.15,
      timingVarianceMs:  config.humanization?.timingVarianceMs  ?? 5,
    };

    // State
    this._currentVoicing  = null;
    this._currentPosition = null;
    this._currentQuality  = null;
    this._currentPattern  = null;
    this._compiled        = null;   // { grid, loopLen }
    this._resolution      = '16n';
    this._rmsScale        = 1;      // škála pro strum_delay (edit_bpm / playback_bpm)
    this._currentStep     = 0;
    this._repeatId        = null;
    this._isPlaying       = false;
    this._isPlayingSequence = false;
  }

  // ─── Voicing ─────────────────────────────────────────────────────────────
  /**
   * Nastaví aktuální akord — vybere pozici podle shape/octave a pregeneruje voicing.
   * @param {object} args
   * @param {string} args.root      - 'C', 'C#', 'Bb' atd. (flats se převedou na sharps)
   * @param {string} args.quality   - 'maj', 'min', 'dom7', ... (klíč ze SHAPES)
   * @param {'E'|'A'|'auto'} [args.shape='auto']
   * @param {number} [args.shapeOctave=1]  - 1 = základní pozice, 2 = o oktávu výš (+12 pražců)
   */
  setChord({ root, quality, shape = 'auto', shapeOctave = 1 } = {}) {
    if (!root || !quality) throw new Error('setChord: root a quality jsou povinné');
    const normRoot = FLAT_TO_SHARP[root] || root;
    const positions = getAllPositions({ root: normRoot, quality, shapeFilter: shape === 'auto' ? 'auto' : shape });
    if (positions.length === 0) {
      throw new Error(`setChord: žádná pozice pro ${root} ${quality} (shape=${shape})`);
    }
    // Vybrat pozici podle shapeOctave: 1 = nižší barFret dané shape, 2 = vyšší
    let pos;
    if (shape === 'auto') {
      pos = positions[0]; // nejnižší
    } else {
      const sameShape = positions.filter(p => p.shape === shape);
      pos = sameShape[Math.min(shapeOctave - 1, sameShape.length - 1)] || sameShape[0];
    }
    this._currentPosition = pos;
    this._currentQuality  = quality;
    this._currentVoicing  = generateVoicing(pos, quality);
    this.emit('chord', {
      root: normRoot,
      quality,
      shape: pos.shape,
      barFret: pos.barFret,
      voicing: this._currentVoicing,
      position: pos,
    });
  }

  // ─── Pattern ─────────────────────────────────────────────────────────────
  /**
   * Načte pattern, zkompiluje grid, přepočítá rms škálu pro strum_delay.
   */
  loadPattern(patternJson) {
    if (!patternJson || !Array.isArray(patternJson.steps)) {
      throw new Error('loadPattern: neplatný pattern (chybí steps)');
    }
    this._currentPattern = patternJson;
    this._compiled       = compilePattern(patternJson);
    this._resolution     = patternJson.resolution || '16n';
    // RMS škála: pokud pattern má edit_bpm, strum_delay_ms se přepočítá k playback_bpm
    this._rmsScale = (patternJson.edit_bpm && patternJson.edit_bpm > 0)
      ? (patternJson.edit_bpm / this._bpm)
      : 1;
    this.emit('pattern', {
      loopLen: this._compiled.loopLen,
      resolution: this._resolution,
      pattern: patternJson,
    });
  }

  // ─── Playback ────────────────────────────────────────────────────────────
  /**
   * Spustí přehrávání načteného patternu s aktuálním akordem.
   * Loopuje stejný akord dokud nezavoláš stop().
   */
  play() {
    if (typeof Tone === 'undefined' || !Tone.Transport) {
      throw new Error('play: Tone.js není dostupný (očekává se window.Tone)');
    }
    if (!this._currentPattern) throw new Error('play: nejdřív zavolej loadPattern(...)');
    if (!this._currentVoicing) throw new Error('play: nejdřív zavolej setChord(...)');
    if (this._isPlaying) this.stop();

    // Nastavit BPM + přepočítat rms škálu pro aktuální tempo
    Tone.Transport.bpm.value = this._bpm;
    if (this._currentPattern.edit_bpm && this._currentPattern.edit_bpm > 0) {
      this._rmsScale = this._currentPattern.edit_bpm / this._bpm;
    }

    this._currentStep = 0;
    this._isPlaying   = true;

    // Scheduler běží na resoluci patternu (16n nebo 32n).
    // Sequence playback (Krok 3) poběží na '32n' + tickRatio, aby uměl míchat.
    this._repeatId = Tone.Transport.scheduleRepeat(time => {
      this._onTick(time);
    }, this._resolution);

    Tone.Transport.start('+0.1'); // malý lead-in, audio engine se stihne připravit
    this.emit('start', { time: Tone.Transport.seconds });
  }

  /**
   * Zastaví přehrávání (single chord i sekvenci), ukončí všechny doznívající noty.
   */
  stop() {
    if (!this._isPlaying && !this._isPlayingSequence) return;
    const wasSequence = this._isPlayingSequence;
    if (this._repeatId !== null && typeof Tone !== 'undefined' && Tone.Transport) {
      try { Tone.Transport.clear(this._repeatId); } catch {}
      this._repeatId = null;
    }
    // NE Tone.Transport.cancel() — smazalo by i ostatní callbacks (např. bass v hostové app)
    if (typeof Tone !== 'undefined' && Tone.Transport) {
      try { Tone.Transport.stop(); } catch {}
    }
    try { this._guitarSampler.releaseAll?.(); } catch {}
    try { this._muteSampler?.releaseAll?.();  } catch {}
    this._isPlaying         = false;
    this._isPlayingSequence = false;
    this._currentStep       = 0;
    this._seqChordIdx       = 0;
    this._seqStepInChord    = 0;
    this._seqEnded          = false;
    if (this._seqTriggeredNotes) this._seqTriggeredNotes.clear();
    this.emit('stop', { sequence: wasSequence });
  }

  // ─── Scheduler tick (internal) ───────────────────────────────────────────
  _onTick(time) {
    const step = this._currentStep;
    const loopLen = this._compiled.loopLen;
    const events = this._compiled.grid[step] || [];

    // Emit 'step' — UI se přihlásí pro step indikátor, overlay reset atd.
    this.emit('step', { step, loopLen, time, resolution: this._resolution });

    // Zpracovat všechny události na tomto kroku
    for (const ev of events) {
      this._triggerEvent(ev, time);
    }

    // Posun + detekce loopu
    this._currentStep = (step + 1) % loopLen;
    if (this._currentStep === 0) {
      this.emit('loop', { time });
    }
  }

  _triggerEvent(event, time) {
    if (!this._currentPosition) return;
    const resolved = resolveStrings(event.strings, this._currentPosition.shape);
    const notes    = resolved.map(s => this._currentVoicing[s]).filter(Boolean);
    // allowCrossBoundary=true → ring smí přečuhovat přes konec loopu, stejný akord pokračuje
    const dur      = resolveDuration(event, this._currentPattern, true);

    // Humanizace: kombinace pattern.humanization + globální this._humanization
    const pHum     = this._currentPattern.humanization || {};
    const patVarRange = pHum.vel_variance || 0;
    const velVarPat   = (Math.random() * 2 - 1) * patVarRange;
    const velVarGlob  = (Math.random() * 2 - 1) * this._humanization.velVariance;
    const accentMul   = 1 + ((BEAT_ACCENT[event.beat] || 1) - 1) * this._humanization.accentStrength;
    const baseVel     = event.vel ?? 0.7;
    const vel         = Math.min(1, Math.max(0.01, (baseVel + velVarPat + velVarGlob) * accentMul));

    const timingOff   = (Math.random() * 2 - 1) * (this._humanization.timingVarianceMs / 1000);

    // Strum delay: relativní k edit_bpm (pokud je), škálovaný na aktuální tempo
    const strumRaw    = event.strum_delay_ms !== undefined
      ? event.strum_delay_ms
      : (pHum.strum_delay_ms || 0);
    const strumDelay  = strumRaw * this._rmsScale / 1000;

    // Výběr sampleru (palm_mute → muteSampler, pokud je k dispozici)
    const sampler = (event.technique === 'palm_mute' && this._muteSampler)
      ? this._muteSampler
      : this._guitarSampler;

    // Spustit noty — každá struna se posune o strumDelay pro přirozený rozstřik
    notes.forEach((note, idx) => {
      try {
        sampler.triggerAttackRelease(note, dur, time + idx * strumDelay + timingOff, vel);
      } catch (err) {
        // Neukončit loop — jen report a pokračovat
        this.emit('error', { err, note, event });
      }
    });

    // Emit 'note' — UI udělá fretboard highlight, overlay atd.
    this.emit('note', {
      notes, resolved, event, time, dur, vel,
      technique: event.technique || null,
      direction: event.direction || null,
    });
  }

  // ─── Sequence playback ───────────────────────────────────────────────────
  /**
   * Přehraje sekvenci akordů z textu ("C G Am F.(001)").
   *
   * Scheduler běží vždy na '32n' gridu (8 tiků/doba) — univerzální grid, co umí
   * míchat 16n i 32n patterny v jedné sekvenci. 16n patterny triggerují jen na
   * sudých tikcích (tickRatio=2), 32n na všech (tickRatio=1).
   *
   * @param {string} text - Text sekvence (viz parseSequence)
   * @param {object} [opts]
   * @param {boolean} [opts.loop=true] - Loopovat sekvenci po dokončení
   * @param {string}  [opts.timeSignature] - '4/4' nebo '3/4' (default self._timeSignature)
   * @param {object}  [opts.patNumMap] - { '001': 'patternId' } pro parser
   * @param {object}  [opts.defaultPattern] - Pattern pro chordy bez patternId
   * @param {Function}[opts.getPattern] - (patternId) => pattern, lookup pro ch.patternId
   * @param {Function}[opts.getText] - () => string, pokud definován, reparse textu na akord boundary (živé změny textarey)
   * @param {Function}[opts.getDefaultPattern] - () => pattern, pokud definován, recompile patternu pro chordy bez patternId (živé změny editoru)
   */
  playSequence(text, opts = {}) {
    if (typeof Tone === 'undefined' || !Tone.Transport) {
      throw new Error('playSequence: Tone.js není dostupný');
    }
    const timeSig = opts.timeSignature || this._timeSignature;
    const chords = parseSequence(text, { timeSignature: timeSig, patNumMap: opts.patNumMap });
    if (chords.length === 0) throw new Error('playSequence: žádné akordy v textu');

    if (this._isPlaying || this._isPlayingSequence) this.stop();

    // Resolve první pattern
    const getPat = opts.getPattern || ((id) => null);
    const getDefaultPat = opts.getDefaultPattern || (() => opts.defaultPattern);

    let firstPat = chords[0].patternId ? getPat(chords[0].patternId) : null;
    if (!firstPat) firstPat = opts.defaultPattern;
    if (!firstPat) throw new Error('playSequence: defaultPattern je povinný (nebo první chord musí mít patternId s odpovídajícím getPattern)');

    // Setup state
    this._seqText            = text;
    this._seqOpts            = opts;
    this._seqChords          = chords;
    this._seqChordIdx        = 0;
    this._seqStepInChord     = 0;
    this._seqEnded           = false;
    this._seqLoop            = opts.loop !== false;
    this._seqCurrentPattern  = firstPat;
    this._compiled           = compilePattern(firstPat);
    this._resolution         = firstPat.resolution || '16n';
    this._currentPattern     = firstPat;
    // Noty aktuálně doznívající (pro cut na chord boundary, když se akord změní)
    this._seqTriggeredNotes  = new Set();
    this._seqLastVoicingKey  = `${chords[0].root}|${chords[0].quality}`;

    // BPM
    Tone.Transport.bpm.value = this._bpm;
    this._rmsScale = (firstPat.edit_bpm && firstPat.edit_bpm > 0) ? (firstPat.edit_bpm / this._bpm) : 1;

    // První akord — voicing
    this.setChord({
      root: chords[0].root,
      quality: chords[0].quality,
      shape: chords[0].shape || 'auto',
      shapeOctave: chords[0].shapeOctave || 1,
    });

    this._isPlayingSequence = true;
    this._isPlaying         = true; // pro stop() logiku

    // Emit start events
    this.emit('seq-start', { chords: [...chords], loop: this._seqLoop });
    this.emit('pattern', { loopLen: this._compiled.loopLen, resolution: this._resolution, pattern: firstPat });
    this.emit('seq-chord', { chord: chords[0], index: 0 });

    // Scheduler — vždy '32n' pro uniformní grid
    this._repeatId = Tone.Transport.scheduleRepeat((time) => {
      this._onSeqTick(time);
    }, '32n');

    Tone.Transport.start('+0.1'); // audio lead-in
    this.emit('start', { time: Tone.Transport.seconds, sequence: true });
  }

  /**
   * Interní scheduler tick pro playSequence. Běží na '32n' (8 tiků/doba).
   */
  _onSeqTick(time) {
    // End-of-sequence guard: stop je async, další ticky po posledním akordu přeskočit.
    if (this._seqEnded) return;

    const SCHED_TICKS_PER_BEAT = 8;
    const chordSchedTicks = (ch) => Math.max(1, Math.round(ch.beats * SCHED_TICKS_PER_BEAT));
    const patTickRatio    = (p)  => (p.resolution === '32n') ? 1 : 2;

    // Emit 'tick' — pro metronom a granulární UI (zelená světýlka, step box)
    this.emit('tick', { rawTick: this._seqStepInChord, time });

    // ─── Akord boundary — přepnout na další akord? ─────────────────────────
    if (this._seqStepInChord >= chordSchedTicks(this._seqChords[this._seqChordIdx])) {
      // Živé změny textarey — reparse, pokud host dodal getText callback
      if (typeof this._seqOpts.getText === 'function') {
        try {
          const freshText = this._seqOpts.getText();
          if (freshText && freshText !== this._seqText) {
            const fresh = parseSequence(freshText, {
              timeSignature: this._seqOpts.timeSignature || this._timeSignature,
              patNumMap: this._seqOpts.patNumMap,
            });
            if (fresh.length) {
              this._seqChords = fresh;
              this._seqText   = freshText;
              this.emit('seq-reparse', { chords: [...fresh] });
            }
          }
        } catch {}
      }

      this._seqChordIdx++;
      if (this._seqChordIdx >= this._seqChords.length) {
        if (this._seqLoop) {
          this._seqChordIdx = 0;
          this.emit('seq-loop', { time });
        } else {
          // Konec sekvence, loop off. Další ticky přeskočit (stop je async).
          this._seqEnded = true;
          Promise.resolve().then(() => this.stop());
          return;
        }
      }
      this._seqStepInChord = 0;

      // Přepnout akord — voicing
      const ch = this._seqChords[this._seqChordIdx];
      this.setChord({
        root: ch.root,
        quality: ch.quality,
        shape: ch.shape || 'auto',
        shapeOctave: ch.shapeOctave || 1,
      });
      this.emit('seq-chord', { chord: ch, index: this._seqChordIdx });
      // Recompile pattern proběhne na loop boundary (stepInPattern === 0) níže
    }

    // ─── Konverze scheduler-tick → pattern step ─────────────────────────────
    const ratio         = patTickRatio(this._seqCurrentPattern);
    const loopLen       = this._compiled.loopLen;
    const loopSchedTicks = loopLen * ratio;
    const tickInLoop    = this._seqStepInChord % loopSchedTicks;
    const stepInPattern = Math.floor(tickInLoop / ratio);
    const triggerThis   = (tickInLoop % ratio) === 0;
    const curCh         = this._seqChords[this._seqChordIdx];
    const curKey        = `${curCh.root}|${curCh.quality}`;

    // ─── Pattern loop boundary — recompile pro živé změny ──────────────────
    if (triggerThis && stepInPattern === 0) {
      // Cut doznívající noty JEN když se akord od minulého boundary změnil
      if (curKey !== this._seqLastVoicingKey && this._seqTriggeredNotes.size > 0) {
        const savedRelease = this._guitarSampler.release;
        try {
          this._guitarSampler.release = 0.01;
          this._seqTriggeredNotes.forEach(note => {
            try { this._guitarSampler.triggerRelease?.(note, time); } catch {}
          });
        } finally {
          if (savedRelease !== undefined) this._guitarSampler.release = savedRelease;
        }
      }
      this._seqTriggeredNotes.clear();
      this._seqLastVoicingKey = curKey;

      // Recompile: akord s patternId → lookup, bez → getDefaultPattern() callback
      const prevResolution = this._seqCurrentPattern.resolution || '16n';
      const prevLoopLen    = loopLen;
      let newPat = null;
      if (curCh.patternId && typeof this._seqOpts.getPattern === 'function') {
        newPat = this._seqOpts.getPattern(curCh.patternId);
      }
      if (!newPat) {
        // Bez patternId → host může dodat getDefaultPattern callback pro živý editor refresh
        if (typeof this._seqOpts.getDefaultPattern === 'function') {
          newPat = this._seqOpts.getDefaultPattern();
        } else {
          newPat = this._seqOpts.defaultPattern || this._seqCurrentPattern;
        }
      }
      if (newPat && newPat !== this._seqCurrentPattern) {
        this._seqCurrentPattern = newPat;
        this._currentPattern    = newPat;
        this._compiled          = compilePattern(newPat);
        this._resolution        = newPat.resolution || '16n';
        this._rmsScale = (newPat.edit_bpm && newPat.edit_bpm > 0) ? (newPat.edit_bpm / this._bpm) : 1;
        this.emit('pattern', {
          loopLen: this._compiled.loopLen,
          resolution: this._resolution,
          pattern: newPat,
          chordIndex: this._seqChordIdx,
        });
      }
    }

    // ─── Emit step + trigger events (jen když tick odpovídá pattern kroku) ─
    if (triggerThis) {
      this.emit('step', {
        step: stepInPattern,
        loopLen: this._compiled.loopLen,
        time,
        resolution: this._resolution,
        sequence: true,
        chordIndex: this._seqChordIdx,
      });

      // Ring přes hranici: mid-chord → ano, last chord bez loop → ne, jinak záleží na dalším akordu
      const schedTicksRemainingInChord = chordSchedTicks(curCh) - this._seqStepInChord;
      const schedTicksRemainingInLoop  = loopSchedTicks - tickInLoop;
      let allowCrossBoundary;
      if (schedTicksRemainingInChord > schedTicksRemainingInLoop) {
        allowCrossBoundary = true; // mid-chord, voicing pokračuje
      } else {
        const isLastChord = (this._seqChordIdx === this._seqChords.length - 1) && !this._seqLoop;
        if (isLastChord) {
          allowCrossBoundary = false;
        } else {
          const nextCh = this._seqChords[(this._seqChordIdx + 1) % this._seqChords.length];
          allowCrossBoundary = !!(nextCh && nextCh.root === curCh.root && nextCh.quality === curCh.quality);
        }
      }

      const events = this._compiled.grid[stepInPattern] || [];
      for (const ev of events) {
        this._triggerSeqEvent(ev, time, allowCrossBoundary);
      }

      if (stepInPattern === 0 && this._seqStepInChord > 0) {
        this.emit('loop', { time });
      }
    }

    this._seqStepInChord++;
  }

  /**
   * Varianta _triggerEvent s podporou allowCrossBoundary a tracking doznívajících not.
   */
  _triggerSeqEvent(event, time, allowCrossBoundary) {
    if (!this._currentPosition) return;
    const resolved = resolveStrings(event.strings, this._currentPosition.shape);
    const notes    = resolved.map(s => this._currentVoicing[s]).filter(Boolean);
    const dur      = resolveDuration(event, this._seqCurrentPattern, allowCrossBoundary);

    const pHum     = this._seqCurrentPattern.humanization || {};
    const patVarRange = pHum.vel_variance || 0;
    const velVarPat   = (Math.random() * 2 - 1) * patVarRange;
    const velVarGlob  = (Math.random() * 2 - 1) * this._humanization.velVariance;
    const accentMul   = 1 + ((BEAT_ACCENT[event.beat] || 1) - 1) * this._humanization.accentStrength;
    const baseVel     = event.vel ?? 0.7;
    const vel         = Math.min(1, Math.max(0.01, (baseVel + velVarPat + velVarGlob) * accentMul));

    const timingOff   = (Math.random() * 2 - 1) * (this._humanization.timingVarianceMs / 1000);
    const strumRaw    = event.strum_delay_ms !== undefined ? event.strum_delay_ms : (pHum.strum_delay_ms || 0);
    const strumDelay  = strumRaw * this._rmsScale / 1000;

    const sampler = (event.technique === 'palm_mute' && this._muteSampler)
      ? this._muteSampler
      : this._guitarSampler;

    notes.forEach((note, idx) => {
      try {
        sampler.triggerAttackRelease(note, dur, time + idx * strumDelay + timingOff, vel);
        this._seqTriggeredNotes.add(note);
      } catch (err) {
        this.emit('error', { err, note, event });
      }
    });

    this.emit('note', {
      notes, resolved, event, time, dur, vel,
      technique: event.technique || null,
      direction: event.direction || null,
      sequence: true,
    });
  }

  /**
   * Vymění pattern za běhu bez stopnutí přehrávání.
   * - Mimo přehrávání: funguje jako loadPattern (reset state, emit 'pattern').
   * - Single-chord za běhu: zachová pozici (`_currentStep % newLoopLen`), recompile.
   *   Pokud se změnila resolution, přeplánuje scheduler (`Transport.clear` + nový `scheduleRepeat`).
   * - Sekvence za běhu: aktualizuje `_seqCurrentPattern`, recompile. Scheduler zůstává
   *   na 32n — `tickRatio` se přepočítá při dalším tiku, žádný reschedule není třeba.
   *
   * V obou případech emituje `pattern` event s `hot: true`.
   * @param {object} newPattern - Nový pattern JSON
   */
  hotUpdatePattern(newPattern) {
    if (!newPattern || !Array.isArray(newPattern.steps)) {
      throw new Error('hotUpdatePattern: neplatný pattern (chybí steps)');
    }
    // Mimo přehrávání — stejné jako loadPattern (ale bez duplicity loglogiky)
    if (!this._isPlaying && !this._isPlayingSequence) {
      this.loadPattern(newPattern);
      return;
    }

    const prevResolution = this._resolution;
    const newResolution  = newPattern.resolution || '16n';
    const newCompiled    = compilePattern(newPattern);

    // Update state
    this._currentPattern = newPattern;
    this._compiled       = newCompiled;
    this._resolution     = newResolution;
    this._rmsScale = (newPattern.edit_bpm && newPattern.edit_bpm > 0)
      ? (newPattern.edit_bpm / this._bpm) : 1;
    if (this._isPlayingSequence) {
      this._seqCurrentPattern = newPattern;
      // U sekvence necháme `_seqStepInChord` být — scheduler si při příštím tiku
      // spočítá stepInPattern z tickInLoop a nového tickRatio.
    } else {
      // Single-chord: zachovat pozici uvnitř nového loopu (modulo)
      if (this._currentStep >= newCompiled.loopLen) {
        this._currentStep = this._currentStep % newCompiled.loopLen;
      }
    }

    // Single-chord: pokud se resolution změnila, přeplánovat scheduler
    // (Tone.Transport.scheduleRepeat interval nejde změnit za běhu → clear + reschedule)
    if (!this._isPlayingSequence && prevResolution !== newResolution && this._repeatId !== null) {
      try { Tone.Transport.clear(this._repeatId); } catch {}
      this._repeatId = Tone.Transport.scheduleRepeat(time => {
        this._onTick(time);
      }, newResolution);
    }

    this.emit('pattern', {
      loopLen: newCompiled.loopLen,
      resolution: newResolution,
      pattern: newPattern,
      hot: true,
    });
  }

  // ─── Runtime config ──────────────────────────────────────────────────────
  /**
   * Nastaví tempo za běhu (přepočítá rms škálu pro strum_delay, pokud pattern má edit_bpm).
   */
  setBpm(bpm) {
    this._bpm = bpm;
    if (typeof Tone !== 'undefined' && Tone.Transport) Tone.Transport.bpm.value = bpm;
    // Přepočítat rms škálu pro strum_delay
    if (this._currentPattern?.edit_bpm > 0) {
      this._rmsScale = this._currentPattern.edit_bpm / bpm;
    }
    this.emit('bpm', { bpm });
  }

  /**
   * Nastaví časový podpis ('4/4' nebo '3/4'). Za běhu sekvence reparsuje aktuální text
   * s novým podpisem (mění se `beats` akordů → fullMeasure = 4 nebo 3 beaty).
   */
  setTimeSignature(ts) {
    if (ts !== '4/4' && ts !== '3/4') {
      throw new Error(`setTimeSignature: nepodporovaný podpis "${ts}" (očekávám '4/4' nebo '3/4')`);
    }
    this._timeSignature = ts;

    // Za běhu sekvence — reparse s novým timeSig, aby délka akordu odpovídala
    if (this._isPlayingSequence && this._seqText) {
      try {
        const fresh = parseSequence(this._seqText, {
          timeSignature: ts,
          patNumMap: this._seqOpts?.patNumMap,
        });
        if (fresh.length) {
          this._seqChords = fresh;
          // Pokud je aktuální index mimo rozsah nové sekvence, clamp na začátek
          if (this._seqChordIdx >= fresh.length) {
            this._seqChordIdx    = 0;
            this._seqStepInChord = 0;
          }
          this.emit('seq-reparse', { chords: [...fresh], reason: 'timeSignature', timeSignature: ts });
        }
      } catch (err) {
        this.emit('error', { err, where: 'setTimeSignature reparse' });
      }
    }
  }

  setMuteSampler(sampler)        { this._muteSampler = sampler; }

  // Veřejný getter na aktuální voicing (UI si může sáhnout pro fretboard render)
  get currentVoicing()  { return this._currentVoicing; }
  get currentPosition() { return this._currentPosition; }
  get isPlaying()       { return this._isPlaying; }

  // ─── Static utilities (thin wrappers over the exported pure functions) ──
  static generateVoicing(position, quality)   { return generateVoicing(position, quality); }
  static resolveStrings(strings, shape)       { return resolveStrings(strings, shape); }
  static getAllPositions(opts)                { return getAllPositions(opts); }
  static compilePattern(pattern)              { return compilePattern(pattern); }
  static resolveDuration(ev, pat, allow)      { return resolveDuration(ev, pat, allow); }
  static parseSequence(text, opts)            { return parseSequence(text, opts); }
}

export default PatternPlayer;
