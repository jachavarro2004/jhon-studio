# Changelog

All notable changes to jhon-studio are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The repository: the presentation-video tooling moved out of Jhon's core (jhon-agent's
  `tools/media`) and made generic, so it makes videos for any project.
- `jhon-studio` command line (Node 22, no build step, no dependencies): `init`, `doctor
  [--json]`, `video script --check | --approve`, `video narrate`, `video compose`, `video render
  [--lang en,es] [--dry-run]`, and `--help` for each. `video brief`, `video capture` and writing
  a script from a brief answer "not yet" (exit 2).
- `.jhon/studio.yaml` per project (name, tagline, url, palette, mark, intro, voice, languages,
  screens), read with a small YAML subset parser; defaults guessed from the project's README and
  git remote, a neutral palette and the name's initial as the mark.
- `script.json` per video in `.jhon/studio/<video>/`: the shot model (intro, head, card, list,
  numbers, proof, close), Spanish subtitles, a `say` map for pronunciations, and validation
  (kinds, fields, marks in order, subtitles in the tú form). `render` refuses a script that is
  not approved.
- A flat animated 2D intro with the project's logo or initial, in its palette; the 3D seal
  stays available as `intro: seal` for a glyph mark.
- The motion engine (`engine/motion.js`), the presentation template, three.js 0.187.0, the font
  subsets and the Kokoro voice script, moved from the core.
- Tests on a fictional sample project with fixture narration (no models), a hygiene test, and
  CI on Node 22.

### Changed

- Environment names: `JHON_STUDIO_KOKORO` and `JHON_STUDIO_CHROME`, the cache in
  `~/.cache/jhon-studio`; the core's `JHON_MEDIA_KOKORO`, `JHON_MEDIA_CHROME` and
  `~/.cache/jhon-media` still work as fallbacks.
