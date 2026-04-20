# patternlogic-player

Reusable [Tone.js](https://tonejs.github.io) (v14.x) playback engine for
[PatternLogic](https://github.com/miroush/patternlogic) guitar patterns.
Pure utilities for voicing, pattern compilation, and sequence parsing, plus a
`PatternPlayer` class that drives `Tone.Transport`, emits events, and supports
live hot-update of pattern and tempo without stopping playback.

Used by:
- [PatternLogic](https://github.com/miroush/patternlogic) — pattern editor and library
- [Vibechords](https://github.com/miroush/vibechords) — chord progression player *(upcoming)*

## Install (as a Git submodule)

```bash
git submodule add https://github.com/miroush/patternlogic-player.git player
```

## Quick start

```html
<script src="https://unpkg.com/tone@14.8.49/build/Tone.js"></script>
<script type="module">
  import { PatternPlayer } from './player/pattern-player.js';

  const sampler = new Tone.Sampler({ urls: { A2: 'A2.wav' }, baseUrl: './samples/' });
  await Tone.loaded();

  const player = new PatternPlayer({ guitarSampler: sampler, bpm: 100 });

  document.querySelector('#play').addEventListener('click', async () => {
    await Tone.start();                   // browsers require a user gesture
    player.setChord({ root: 'C', quality: 'maj' });
    player.loadPattern(myPatternJson);
    player.play();
  });
</script>
```

See [API.md](./API.md) for the full reference and [demo.html](./demo.html) for a
runnable end-to-end example covering all four milestones.

## Feature summary

- **Voicing engine** — E/A barre shapes across 13 qualities, all playable
  positions, numeric or abstract (`bass_root`, `bass_alt`, `bass_3`) string
  references resolved at trigger time.
- **Single-chord playback** — `loadPattern` → `play` → `stop`, with per-step
  events, ring-until-next-hit durations, per-pattern + global humanization
  (velocity variance, accent, timing jitter), tempo-relative strum delay.
- **Sequence playback** — `playSequence('C G Am F(001) D.(a2)')` with pattern
  code overrides, explicit shape/octave per chord, mixing 16n and 32n patterns
  in one sequence on a uniform 32n scheduler grid.
- **Live editing** — `getText()` callback reparses the textarea on every chord
  boundary; `getDefaultPattern()` callback recompiles the editor pattern on
  every loop boundary.
- **Hot-update** — `hotUpdatePattern(newPattern)`, `setBpm(n)`,
  `setTimeSignature('3/4')` work during playback without stopping the
  Transport.
- **Event-based** — `chord`, `pattern`, `start`, `step`, `note`, `loop`,
  `stop`, `seq-start`, `seq-chord`, `seq-reparse`, `seq-loop`, `tick`, `bpm`,
  `error`.

## Pattern format

See [pattern.schema.json](./pattern.schema.json) for the JSON Schema draft-07
spec. Minimal example:

```json
{
  "id": "simple-strum",
  "resolution": "16n",
  "loop_steps": 16,
  "edit_bpm": 100,
  "meta": { "name": "Simple strum", "style": "strum" },
  "steps": [
    { "beat": "1", "strings": ["bass_root", 4, 3, 2, 1], "direction": "D", "duration": "4n" },
    { "beat": "3", "strings": ["bass_alt",  4, 3, 2, 1], "direction": "D", "duration": "4n" }
  ]
}
```

## Demo

```bash
npx serve .
# open http://localhost:3000/demo.html
```

The demo covers every API — single-chord, sequence, hot-swap, time-signature
change — with sanity checks you can watch turn green.

## License

MIT
