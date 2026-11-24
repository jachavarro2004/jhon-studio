# Changelog

All notable changes to jhon-studio are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- The repository: the presentation-video tooling moved out of Jhon's core (jhon-agent's
  `tools/media`) and made generic, so it makes videos for any project.
- `jhon-studio` command line (Node 22, no build step, no dependencies): `init`, `doctor
  [--json]`, `video brief`, `video script`, `video capture`, `video narrate`, `video compose`,
  `video render [--lang en,es] [--dry-run]`, `video make [--dry-run]`, and `--help` for each.
- `video brief <source>`: a video's `brief.md` (name, tagline, url, what it is, who it is for,
  the facts to show, the screens) drafted by text extraction alone from `readme`,
  `ldd:<change>` (openspec/ or ldd/ changes), `release:<tag>` (its CHANGELOG section, else the
  git log since the previous tag) or any file.
- `video script` with no option prints the shot model, a valid example of each kind in the
  narration's language, the screens and the brief, so a person or an agent writes
  `script.json`.
- `video capture`: `screens` in studio.yaml may list files (copied), commands (an argv list run
  in the project with a timeout, drawn as a terminal SVG in the project's palette) and web pages
  (a headless Chrome driven over the DevTools Protocol with Node's own WebSocket: steps click,
  fill, wait, goto, scroll; no npm dependency, no browser download; without a Chrome, exit 2
  after the other screens).
- `video make`: capture, narrate, compose and render in order, skipping what is done, stopping
  with exit 3 where the user is needed (no script yet, or a script not approved as it is now).
- Narration in English or Spanish (`narration: en | es`), subtitled in the other
  (`subtitles`); Kokoro's `af_heart` and `ef_dora` by default, `voice:` to choose another.
- The sample project has a command (`bin/larder.mjs`) and a page (`web/index.html`) to capture.
- `.jhon/studio.yaml` per project (name, tagline, url, palette, mark, intro, narration,
  subtitles, voice, screens; `languages` read as the older spelling), read with a small YAML subset parser; defaults guessed from the project's README and
  git remote, a neutral palette and the name's initial as the mark.
- `script.json` per video in `.jhon/studio/<video>/`: the shot model (intro, head, card, list,
  numbers, proof, close), each line in English and Spanish, a `say` map for pronunciations, and
  validation (kinds, fields, marks in order in the spoken line, subtitles, the tú form). The
  approval is the script's hash (`"approved": { "sha256": ... }`): `render` refuses a script
  never approved or changed after its approval.
- A flat animated 2D intro with the project's logo or initial, in its palette; the 3D seal
  stays available as `intro: seal` for a glyph mark.
- The motion engine (`engine/motion.js`), the presentation template, three.js 0.187.0, the font
  subsets and the Kokoro voice script, moved from the core.
- Tests on a fictional sample project with fixture narration (no models), web capture against
  a local page (skipped without a Chrome), a hygiene test, and CI on Node 22, 24 and the current
  LTS.

### Changed

- The eases' test compares every one of the 1,001 points of each ease with the reference within
  1e-12 (and reports the largest error) instead of a byte hash: V8 versions round the last bit
  of an exponential differently (Node 22 failed the hash on `expo.out`). The reference keeps its
  hashes and now stores its values.
- compose links a screens folder inside the project relatively, so a project can move.

- Environment names: `JHON_STUDIO_KOKORO` and `JHON_STUDIO_CHROME`, the cache in
  `~/.cache/jhon-studio`; the core's `JHON_MEDIA_KOKORO`, `JHON_MEDIA_CHROME` and
  `~/.cache/jhon-media` still work as fallbacks.
