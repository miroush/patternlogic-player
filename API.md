# API Reference — patternlogic-player

Tone.js-based guitar pattern playback engine. This document covers every public
method, event, and exported utility of the library. For a quick start see
[README.md](./README.md), for the JSON pattern format see
[pattern.schema.json](./pattern.schema.json).

- [1. Setup](#1-setup)
- [2. Constructor](#2-constructor)
- [3. Voicing — `setChord`](#3-voicing--setchord)
- [4. Single-chord playback](#4-single-chord-playback)
- [5. Sequence playback](#5-sequence-playback)
- [6. Hot-update APIs](#6-hot-update-apis)
- [7. Events](#7-events)
- [8. Exported utilities](#8-exported-utilities)
- [9. Pattern format](#9-pattern-format)
- [10. Sequence notation](#10-sequence-notation)
- [11. Integration guide](#11-integration-guide)
- [12. Known limitations](#12-known-limitations)

---

## 1. Setup

The library is ES-module only (`<script type="module">`). It expects a **global
`Tone`** provided by `Tone.js v14.x` to be present before the module is imported.

```html
<script src="https://unpkg.com/tone@14.8.49/build/Tone.js"></script>
<script type="module">
  import {
    PatternPlayer,
    parseSequence, compilePattern, generateVoicing, getAllPositions,
  } from './player/pattern-player.js';

  // 1. Load a sampler (this is *your* responsibility — the library never creates samplers)
  const sampler = new Tone.Sampler({ urls: { A2: 'A2.wav', A3: 'A3.wav' }, baseUrl: './samples/' });
  await Tone.loaded();

  // 2. Create the player
  const player = new PatternPlayer({ guitarSampler: sampler, bpm: 100 });

  // 3. Set a chord, load a pattern, hit play
  player.setChord({ root: 'C', quality: 'maj' });
  player.loadPattern(myPattern);
  player.play();
</script>
```

Browsers block audio until user interaction — always call `Tone.start()` inside a
click handler before the first `player.play()` / `player.playSequence()`.

---

## 2. Constructor

```js
new PatternPlayer(config)
```

| Field | Type | Required | Default | Notes |
|---|---|---|---|---|
| `guitarSampler` | `Tone.Sampler` \| anything with `triggerAttackRelease` | ✓ | — | Primary voice. |
| `muteSampler` | same | ✗ | `null` | Used when a step has `technique: 'palm_mute'`. Optional — without it palm-mute events fall back to `guitarSampler`. |
| `bpm` | `number` | ✗ | `100` | Playback tempo. Can be changed at runtime via `setBpm()`. |
| `timeSignature` | `'4/4'` \| `'3/4'` | ✗ | `'4/4'` | Affects sequence parsing (beats per measure). |
| `humanization.velVariance` | `number` | ✗ | `0.08` | Random ±range added to each note's velocity. |
| `humanization.accentStrength` | `number` | ✗ | `0.15` | How strongly `BEAT_ACCENT` coefficients push velocities. |
| `humanization.timingVarianceMs` | `number` | ✗ | `5` | Random ±ms timing offset per string. |

The sampler is **never** created by the library. You pass in a pre-configured
instance so the host app controls signal chain, effects, and loading. The
library only calls `triggerAttackRelease(note, duration, time, velocity)`,
`triggerRelease(note, time)` (optional), and `releaseAll()` (optional).

---

## 3. Voicing — `setChord`

```js
player.setChord({ root, quality, shape = 'auto', shapeOctave = 1 })
```

Picks a barre position, generates the voicing for all six strings + two bass
variants, stores it as the active voicing. Emits `chord`.

| Field | Type | Notes |
|---|---|---|
| `root` | `string` | `'A'`, `'C#'`, `'Bb'`… Flats are auto-converted to sharps via `FLAT_TO_SHARP`. |
| `quality` | `string` | Key in `SHAPES` / `CHORD_OFFSETS` — `'maj'`, `'min'`, `'7'`, `'maj7'`, `'min7'`, `'dim'`, `'aug'`, `'sus2'`, `'sus4'`, `'add9'`, `'6'`, `'m6'`, `'9'`. |
| `shape` | `'E'` \| `'A'` \| `'auto'` | Shape-filter. `'auto'` picks the lowest playable barre fret across both shapes. |
| `shapeOctave` | `1` \| `2` | Within the chosen shape, `1` is the low barre, `2` is the same shape +12 frets. |

Throws if no playable position exists for the root/shape combination.

After `setChord`, `player.currentVoicing` and `player.currentPosition` expose
the selection (useful for fretboard rendering).

---

## 4. Single-chord playback

```js
player.loadPattern(patternJson)   // compile + cache grid, emit 'pattern'
player.play()                     // schedule on Tone.Transport, emit 'start'
player.stop()                     // clear scheduler + releaseAll, emit 'stop'
```

- `loadPattern(json)` validates that `json.steps` is an array and compiles the
  pattern into a step-indexed grid with pre-computed `ring` durations for held
  notes.
- `play()` starts `Tone.Transport` and schedules ticks on the pattern's
  `resolution` (`'16n'` or `'32n'`). One chord loops until stopped. Emits
  `start`, then `step` per tick, then `note` per triggered event, and `loop` at
  every loop boundary.
- `stop()` uses `Tone.Transport.clear(repeatId)` (not `.cancel()`), so
  scheduled callbacks that belong to the host app (e.g. a bass track) stay
  alive.

To change the chord mid-playback: call `setChord(...)` again. The new voicing
is picked up at the next tick.

To change the pattern mid-playback: use [`hotUpdatePattern`](#6-hot-update-apis).

---

## 5. Sequence playback

```js
player.playSequence(text, opts)
```

Plays a space-separated chord sequence (`'C G Am F'`, see
[Sequence notation](#10-sequence-notation)). The scheduler always runs on a
uniform **32n grid**, which means you can freely mix 16n and 32n patterns in
the same sequence — 16n patterns trigger only on even scheduler ticks.

| Option | Type | Default | Notes |
|---|---|---|---|
| `loop` | `boolean` | `true` | Loop the whole sequence when it ends. |
| `timeSignature` | `'4/4'` \| `'3/4'` | instance default | Used by the parser to compute chord length. |
| `patNumMap` | `{ code: patternId }` | `{}` | Lookup table for `(001)` / `(abc)` codes in the sequence text. |
| `defaultPattern` | `pattern` | — | Static pattern used when a chord has no `patternId` override. |
| `getPattern` | `(id) => pattern` | — | Dynamic lookup called on every loop boundary (host cache). |
| `getDefaultPattern` | `() => pattern` | — | Dynamic lookup for the current "editor" pattern — called every loop boundary so a live editor reflects in the next bar. |
| `getText` | `() => string` | — | Live reparse — called on every chord boundary. If the returned text differs from the previous one, the library reparses and emits `seq-reparse`. |

At least one of `defaultPattern`, `getPattern(id)`-returning-non-null-for-first-chord,
or `getDefaultPattern()`-returning-non-null must resolve to a usable pattern,
otherwise `playSequence` throws.

Emits (in order): `seq-start`, `pattern`, `seq-chord` (first chord), `start`.
Then per tick: `tick`. On a chord boundary: `seq-chord`, optionally `pattern`
(if the pattern switched) and `seq-reparse` (if `getText` returned new text).
On end-of-sequence with `loop=false`: async `stop`.

---

## 6. Hot-update APIs

All three methods work during both single-chord and sequence playback, without
stopping the Transport.

### `hotUpdatePattern(newPattern)`

Swap the active pattern.

- **Not playing:** acts like `loadPattern` (reset state, emit `pattern`).
- **Single-chord playing:** recompiles; keeps the step position modulo the new
  loop length. If the new pattern has a different `resolution`, the library
  auto-reschedules the Transport callback (`scheduleRepeat` intervals can't be
  changed in place).
- **Sequence playing:** updates `_seqCurrentPattern` and `_currentPattern`,
  recompiles. The scheduler stays on 32n, so `tickRatio` is recomputed at the
  next tick — no reschedule needed.

Always emits `pattern` with `hot: true` (distinguishes hot-swap from
`loadPattern`, useful for UI that resets cursors on explicit loads only).

### `setBpm(bpm)`

Sets tempo. If the current pattern declares `edit_bpm`, `strum_delay_ms` is
rescaled by `edit_bpm / bpm` so that subjective feel stays the same. Emits
`bpm`.

### `setTimeSignature(ts)`

Sets `'4/4'` or `'3/4'`. If a sequence is playing, the library reparses the
active text with the new signature (so `beats` per chord reflects the new
`beatsPerMeasure`) and emits `seq-reparse` with `reason: 'timeSignature'`. If
the current chord index falls outside the reparsed sequence, it clamps to `0`.

### `setGuitarSampler(sampler)`

Hot-swap the main guitar sampler without stopping playback. Useful when the
host (PatternLogic, Vibechords) lets the user pick a different instrument
mid-song and doesn't want to reset the step position, sequence progress, or
loop boundary.

The library stores the reference internally; the next triggered note uses the
new sampler. Does not release in-flight notes on the old sampler — the host
should call `oldSampler.releaseAll()` itself if it wants a clean cut (most
often the fade from ring-until-next-hit is enough).

### `setMuteSampler(sampler)`

Hot-swap the palm-mute sampler (the one used when `event.technique ===
'palm_mute'`). Pass `null` to disable palm-mute entirely — the library falls
back to the main guitar sampler. Typical pattern: only set a real mute
sampler for instruments that actually have a palm-mute layer (PatternLogic
uses it for MDM-Strat sustain voices), everything else gets `null`.

---

## 7. Events

Subscribe with `player.on(event, handler)`. Unsubscribe with the returned
function, or `player.off(event, handler)`. Calling `player.off(event)` with no
handler clears **all** handlers for that event.

| Event | Payload | When |
|---|---|---|
| `chord` | `{ root, quality, shape, barFret, voicing, position }` | After `setChord` succeeds. |
| `pattern` | `{ pattern, loopLen, resolution, hot?, chordIndex? }` | After `loadPattern` / `hotUpdatePattern` / pattern switch in sequence. `hot: true` marks `hotUpdatePattern`. `chordIndex` set when switched mid-sequence. |
| `start` | `{ time, sequence? }` | After `play()` / `playSequence()`. |
| `step` | `{ step, loopLen, time, resolution, sequence?, chordIndex? }` | Every tick. `step` is 0-based within the current pattern's loop. |
| `note` | `{ notes, resolved, event, time, dur, vel, technique, direction, sequence? }` | Every triggered step event (not every tick — only ticks with events). |
| `loop` | `{ time }` | When the pattern loop wraps around (both single-chord and sequence). |
| `stop` | `{ sequence }` | After `stop()` or end-of-sequence without loop. |
| `seq-start` | `{ chords, loop }` | Beginning of `playSequence`. `chords` is a copy — safe to store. |
| `seq-chord` | `{ chord, index }` | When the sequence advances to a chord (including the first one). |
| `seq-loop` | `{ time }` | When the whole sequence wraps (`loop=true`). |
| `seq-reparse` | `{ chords, reason?, timeSignature? }` | When `getText()` returned new text, or `setTimeSignature` triggered a reparse. `reason` is `'timeSignature'` for the timesig case, otherwise undefined. |
| `tick` | `{ rawTick, time }` | Every 32n tick during sequence playback. Finer than `step` — use it for metronomes and UI indicators that need to cover both 16n and 32n patterns uniformly. |
| `bpm` | `{ bpm }` | After `setBpm`. |
| `error` | `{ err, note?, event?, where? }` | Recoverable errors during triggering. Does not stop playback. |

All event handlers run synchronously inside `_onTick` / `_onSeqTick`. Keep them
light — heavy DOM work should be wrapped in `Tone.Draw.schedule(fn, time)` or
`requestAnimationFrame`.

---

## 8. Exported utilities

All utilities are pure functions — they don't touch `Tone.Transport` or any
player state. Available as named exports **and** as static methods on
`PatternPlayer`.

### `parseSequence(text, opts)`

Parses a space-separated chord sequence into descriptors. See
[Sequence notation](#10-sequence-notation) for the grammar.

```js
parseSequence('C G.. Am(001) F.(a2)', { timeSignature: '4/4', patNumMap: { '001': 'my-pattern-id' } })
// → [
//   { root: 'C',  quality: 'maj', steps: 16, beats: 4, patternId: null,            shape: null, shapeOctave: 1, _src: 'C' },
//   { root: 'G',  quality: 'maj', steps:  4, beats: 1, patternId: null,            shape: null, shapeOctave: 1, _src: 'G..' },
//   { root: 'A',  quality: 'min', steps: 16, beats: 4, patternId: 'my-pattern-id', shape: null, shapeOctave: 1, _src: 'Am(001)' },
//   { root: 'F',  quality: 'maj', steps:  8, beats: 2, patternId: null,            shape: 'A',  shapeOctave: 2, _src: 'F.(a2)' },
// ]
```

### `compilePattern(pattern)`

Turns a pattern JSON into a `{ grid, loopLen }` structure where `grid[stepIdx]`
is an array of events at that step. Also pre-computes `_resolvedRingDur` /
`_resolvedRingDurNoCap` on each event for efficient "ring until next hit"
rendering.

### `generateVoicing(position, quality)`

Given a position (from `getAllPositions`) and a quality, returns an 8-key
voicing: `{ 1, 2, 3, 4, 5, 6, bass_root, bass_alt }` with Tone note names
(`'C5'`, `'G3'`, …).

### `getAllPositions({ root, quality, shapeFilter? })`

Returns every playable E/A barre position sorted by fret ascending, with E
preferred at equal frets. `shapeFilter: 'E' | 'A' | 'auto'`.

### `resolveStrings(strings, shape)`

Maps mixed numeric/abstract string references to physical string numbers:
`'bass_root' / 'bass_alt' / 'bass_3'` resolve to `6/5/4` for E-shape and
`5/4/3` for A-shape, numeric strings pass through.

### `resolveDuration(event, pattern, allowCrossBoundary?)`

Determines the final Tone duration for a step event. Respects explicit
`event.duration`, pre-computed ring durations, pattern-level
`humanization.default_single_duration`, palm-mute short duration, and
style-based fallback (fingerpick → `'4n'`, strum → `'4n'` for single-string
hits or `'2n'` for chord hits).

### Constants

- `SHAPES` — semitone intervals per string for every E/A shape × quality.
- `CHORD_OFFSETS` — fret offsets (relative to the barre) for every E/A shape ×
  quality, with `null` for muted strings.
- `E_BASE_FRET` / `A_BASE_FRET` — root-to-barre-fret lookup tables.
- `BEAT_TO_STEP` / `STEP_TO_BEAT` — 16n grid mapping (16 entries).
- `BEAT_TO_STEP_32` / `STEP_TO_BEAT_32` — 32n grid mapping (32 entries).
- `BEAT_ACCENT` — velocity coefficient per beat position (32 entries).
- `FLAT_TO_SHARP` — `Bb → A#` etc.
- `SEQ_QUALITY_MAP` — raw sequence suffix → internal quality key (`'m' → 'min'`
  etc.).
- `MAX_BARRE_FRET` — `15`, above which positions are considered impractical.

---

## 9. Pattern format

See [pattern.schema.json](./pattern.schema.json) for the full JSON Schema
draft-07. Minimal example:

```json
{
  "id": "my-pattern",
  "resolution": "16n",
  "loop_steps": 16,
  "edit_bpm": 100,
  "meta": { "name": "Simple strum", "style": "strum", "time_signature": "4/4" },
  "humanization": { "strum_delay_ms": 20, "vel_variance": 0.1 },
  "steps": [
    { "beat": "1", "strings": ["bass_root", 4, 3, 2, 1], "direction": "D", "vel": 0.9, "duration": "4n" },
    { "beat": "3", "strings": ["bass_alt",  4, 3, 2, 1], "direction": "D", "vel": 0.85, "duration": "4n" }
  ]
}
```

Key fields:

- `resolution: '16n' | '32n'` — grid fineness. 16n = 16 steps per bar (in 4/4).
- `loop_steps` — total steps in the loop (16 or 32 per bar).
- `edit_bpm` — the tempo the pattern was designed at. The player uses this to
  scale `strum_delay_ms` so that the subjective feel stays the same at
  different playback tempos: `actual_ms = strum_delay_ms × (edit_bpm / playback_bpm)`.
- `steps[i].beat` — key in `BEAT_TO_STEP` (or `BEAT_TO_STEP_32` for 32n
  patterns).
- `steps[i].strings` — array of 1–6 (physical) or `'bass_root' / 'bass_alt' /
  'bass_3'` (abstract — resolved per shape at trigger time).
- `steps[i].direction` — `'D'` (down) or `'U'` (up). Purely advisory — the
  library doesn't reverse the string order, host-side strum delay staggering
  should do that.
- `steps[i].duration` — Tone duration (`'4n'`, `'8n'`, `'16n'`, `'32n'`,
  `'2n'`, `'1n'`) or `'ring'` (hold until next hit on the same string).

---

## 10. Sequence notation

`parseSequence` accepts a whitespace-separated list of chord tokens.

| Token | Meaning |
|---|---|
| `A` | A major, full measure (4 beats in 4/4). |
| `Am` | A minor, full measure. |
| `Amaj7` | A major 7. Qualities: `maj`, `m`/`min`, `7`, `maj7`, `m7`/`min7`, `dim`, `aug`, `sus2`, `sus4`, `add9`, `6`, `m6`, `9`. |
| `C.` | Half measure (2 beats in 4/4). |
| `G..` | Quarter measure (1 beat). |
| `Am(001)` | With pattern code override — `patNumMap['001']` is looked up into a pattern ID. |
| `F(e)` \| `F(a)` | Explicit shape (E or A barre). |
| `G(e2)` \| `G(a2)` | Shape + octave up (+12 frets). |
| `C.(abc e)` | Combined — half measure + pattern code `abc` + E-shape. |
| `F(001a)` | Pattern code `001` + A-shape in a single contiguous instruction. |

Flats (`Bb`, `Eb`, …) are accepted and auto-converted to sharps.

---

## 11. Integration guide

The typical wiring for a host app that has its own editor, sampler, and UI:

```js
// 1. Load samples (host's responsibility)
const sampler = new Tone.Sampler({ urls: myUrls, baseUrl: myBase });
await Tone.loaded();

// 2. Create the player
const player = new PatternPlayer({
  guitarSampler: sampler,
  bpm: ui.bpm,
  humanization: { velVariance: 0.1 },
});

// 3. Wire events → UI
player.on('step', ({ step, loopLen, time, resolution, chordIndex }) => {
  Tone.Draw.schedule(() => {
    ui.highlightStep(step, resolution);
    if (chordIndex != null) ui.highlightChordChip(chordIndex);
  }, time);
});
player.on('pattern', ({ pattern, hot }) => {
  if (!hot) ui.editor.load(pattern);       // explicit load — update editor
  // hot === true means user is editing while playing — don't overwrite
});
player.on('note', ({ notes, event }) => ui.fretboard.flashNotes(notes, event));

// 4. Play a single chord loop
player.setChord({ root: 'C', quality: 'maj' });
player.loadPattern(ui.editor.currentPattern);
player.play();

// 5. Later — play a sequence with live editor + textarea
player.playSequence(ui.sequenceTextarea.value, {
  loop: ui.loopCheckbox.checked,
  patNumMap: ui.patterns.numMap,                // { '001': 'pattern-id' }
  defaultPattern: ui.editor.currentPattern,
  getPattern: (id) => ui.patterns.byId[id],     // recomputed on every loop boundary
  getDefaultPattern: () => ui.editor.currentPattern, // live editor refresh
  getText: () => ui.sequenceTextarea.value,     // live textarea reparse
});

// 6. User edits the pattern in the editor and clicks "Apply"
player.hotUpdatePattern(ui.editor.currentPattern);  // no stop, no restart

// 7. User changes tempo slider
player.setBpm(ui.bpm);

// 8. User clicks stop
player.stop();
```

### Pattern ownership

The library **never mutates** the pattern JSON you pass in — but it does attach
`_resolvedRingDur` / `_resolvedRingDurNoCap` properties to individual step
events during `compilePattern`. If you keep patterns in some structural sharing
scheme, clone the pattern before compiling, or treat these underscore-prefixed
properties as opaque cache that may appear.

### Concurrent samplers

If your app also drives a bass track, a drum track, etc. on `Tone.Transport`,
**do not** call `Tone.Transport.cancel()` anywhere — the library only clears
its own `repeatId` via `Tone.Transport.clear(id)`, so your other callbacks
survive `player.stop()`. Follow the same discipline in your own code.

### Audio gesture requirement

All browsers block audio until a user click. Always wrap the first
`player.play()` / `player.playSequence()` in a click handler that awaits
`Tone.start()`.

---

## 12. Known limitations

- **Tone.js-global dependency.** The library calls `Tone.Transport` and
  `Tone.Frequency` by reference to the global `Tone`. There's no way to inject
  a different Tone instance — but since Tone.js ships as a singleton on the
  page, this is rarely an issue in practice.
- **Single Transport.** The library assumes it owns the tempo on
  `Tone.Transport`. A host app running several independent players on
  different BPMs in the same page will conflict.
- **No piano/other-instrument voicing engine yet.** `setChord` only generates
  guitar-style E/A barre voicings. The sampler API is instrument-agnostic, so a
  piano sampler works, but you'd lose the 6-string voicing — this is on the
  roadmap as Milník 2.
- **Bass is host-provided.** There is no built-in bass voice — the host app
  runs its own `Tone.Transport.scheduleRepeat` for bass. This is intentional:
  the pattern format doesn't describe bass rhythms separately (yet).
- **No MIDI output.** Everything goes through Tone samplers. A MIDI-only build
  would be possible but isn't implemented.
- **Pattern schema is draft-level.** See `pattern.schema.json` for the current
  shape; fields may still be added in minor versions.

---

## Changelog

See [PatternLogic CHANGELOG](https://github.com/miroush/patternlogic/blob/master/CHANGELOG.md)
for entries tagged `patternlogic-player — Krok N`.

## License

MIT
