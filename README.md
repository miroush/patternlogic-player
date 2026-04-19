# patternlogic-player

Reusable Tone.js-based playback engine for PatternLogic guitar patterns.

Used by:
- [PatternLogic](https://github.com/miroush/patternlogic) — pattern editor and library
- [Vibechords](https://github.com/miroush/vibechords) — chord progression player

## Install (as Git submodule)

```bash
git submodule add https://github.com/miroush/patternlogic-player.git player
```

Then in your HTML:

```html
<script src="https://unpkg.com/tone@14.8.49/build/Tone.js"></script>
<script type="module">
  import { PatternPlayer } from './player/pattern-player.js';

  const sampler = new Tone.Sampler({ /* your samples */ });
  await Tone.loaded();

  const player = new PatternPlayer({
    guitarSampler: sampler,
    bpm: 100,
  });

  player.setChord({ root: 'C', quality: 'maj', shape: 'E' });
  player.loadPattern(myPatternJson);
  player.play();
</script>
```

## API

See [API.md](./API.md) for full reference.

Quick overview:

```js
// Setup
const player = new PatternPlayer({ guitarSampler, bpm, timeSignature });

// Voicing
player.setChord({ root, quality, shape, shapeOctave });

// Playback (single chord loop)
player.loadPattern(patternJson);
player.play();
player.stop();
player.hotUpdatePattern(newPatternJson);  // live update

// Playback (chord sequence)
player.playSequence('C G Am F', { loop: true });

// Runtime
player.setBpm(120);
player.setTimeSignature('3/4');

// Events
player.on('step',  ({ step, beatGroup }) => {});
player.on('chord', ({ index, root, quality }) => {});
player.on('note',  ({ notes, strings, technique }) => {});
player.on('start', () => {});
player.on('stop',  () => {});

// Utilities (static)
const chords = parseSequence('C G Am F', { timeSignature: '4/4' });
const voicing = PatternPlayer.generateVoicing({ root: 'C', quality: 'maj', shape: 'E' });
const positions = PatternPlayer.getAllPositions({ root: 'C', quality: 'maj' });
```

## Pattern format

See [pattern.schema.json](./pattern.schema.json) for the JSON Schema.

## Demo

Open [demo.html](./demo.html) in a browser with a local HTTP server:

```bash
npx serve .
# open http://localhost:3000/demo.html
```

## License

MIT
