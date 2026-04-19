# API Reference

> **Status:** Scaffolding only. Detailed reference will be populated alongside each milestone step.

See [README.md](./README.md) for a quick overview.

## Planned sections

- `new PatternPlayer(config)` — constructor
- `player.setChord(chord)` — voicing selection
- `player.loadPattern(json)` / `player.play()` / `player.stop()`
- `player.playSequence(text, opts)` — chord sequence playback
- `player.hotUpdatePattern(json)` / `player.setBpm(n)` / `player.setTimeSignature(ts)`
- Events: `step`, `chord`, `note`, `start`, `stop`, `loop`
- Static utilities: `PatternPlayer.generateVoicing()`, `PatternPlayer.getAllPositions()`, `PatternPlayer.compilePattern()`, `parseSequence()`

Each section will include: signature, arguments, return value, examples.
