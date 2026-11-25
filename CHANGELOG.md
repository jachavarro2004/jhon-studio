# Changelog

All notable changes to jhon-studio are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/) (`X.Y.Z`, pre-releases `X.Y.Z-rc.N`). Each release's
notes are its section here.

## [Unreleased]

### Added

- CI against a real jhon (`.github/workflows/jhon.yml`, on every push and pull request, and
  weekly): the minimum jhon, the `>=` bound of `requires_jhon` read from `src/version.ts` at run
  time, and the latest (its newest stable release in the range, else its newest pre-release),
  each installed in a clean HOME from its signed release with jhon's `install.sh`. With
  `integrations.studio` on and this commit's studio unpacked from its release tarball, it checks
  that `integration --json` gives every field jhon reads, that `jhon doctor` exits 0 with the
  requires line met and the studio's own checks in its `jhon-studio` section, and that a studio
  requiring a newer jhon is off with jhon's one note while doctor still exits 0.
  `tools/jhon-compat.ts` picks the versions and makes those checks.

## [0.1.0-rc.1]

The first release. It runs with jhon `>=0.5.0-rc.1` (`requires_jhon`).

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
- The Jhon integration, studio side: a Claude Code plugin (`plugin/claude-code`, named
  `jhon-studio`) whose `video` skill is `/jhon-studio:video` in Claude Code; Jhon's
  `/jhon:video` in pi runs the same `SKILL.md`. The skill walks doctor, init, brief, the script,
  a preview and the user's approval (never the agent's) to the MP4s.
- `jhon-studio integration [--json]`: the version, the plugin folder and the skill, as absolute
  paths in the studio's real folder (a link on PATH is followed), for Jhon's setup and doctor;
  also `schema` (its JSON's own schema, `jhon-studio.integration/v1`), `requires_jhon` (the jhon
  versions it runs with, a SemVer range jhon reads) and `contract` (`jhon.integration/v1`), so
  Jhon turns off a studio that needs a newer jhon instead of failing.
- `jhon-studio --version`. `src/version.ts` is the one source of the version, the jhon it needs,
  the contract and the release's signer; tests hold plugin.json, the README's install lines and
  required jhon, the CHANGELOG's section and the release workflow to it.
- Versioned, signed releases: a tag `vX.Y.Z` (or `vX.Y.Z-rc.N`, a pre-release) runs the tests,
  is refused when it differs from the version, and publishes `jhon-studio-<version>.tar.gz`, its
  `.sha256` and a cosign keyless signature bundle (`.sigstore.json`, signed through GitHub's
  OIDC by the release workflow at that tag), with this file's section as the notes
  (`.github/workflows/release.yml`). `tools/pack.sh` builds the tarball (the same files to the
  same bytes; no tests, examples, docs or task files) and `tools/notes.sh` the notes, also
  locally.
- The README installs from a release (download, sha256, the signature, a folder per version
  under `~/.local/share/jhon-studio/`, a link on PATH) and says what jhon each release needs;
  `git clone` stays the development install.
- `capture: chrome_no_sandbox: true` in `.jhon/studio.yaml` (false by default; the environment's
  `JHON_STUDIO_CHROME_NO_SANDBOX=1` or `0` overrides it): every Chrome the studio starts runs
  without Chrome's own sandbox (`--no-sandbox --disable-setuid-sandbox --no-zygote`), and the
  render tells HyperFrames the same (`HYPERFRAMES_CHROME_SANDBOX=0`), for a sandbox that allows
  Chrome's none (such as Jhon's). Chrome dying with "No usable sandbox!" names this setting as
  its fix.
- Text fits its frame: headlines, card titles and lines, list rows, figures, the close's pitch,
  the intro's name and tagline and the kickers shrink (each down to a smallest size, a group at
  one scale) and then wrap, balanced, instead of running off the picture on one line; the
  fitting runs in the page once its fonts load (a HyperFrames buildReady promise).
- `video compose` (and so `video make`) measures every shot at its final state in a headless
  Chrome and fails with exit 1 on text that overflows its card or the picture, naming each shot
  and element (`problem: the headline's line 1 (#problem-l1) runs 212 px past the frame's
  bottom`); the composition is still written, to preview it. Without a Chrome it says the text
  was not measured.
- `video review`: each shot's final state (0.35 s before its end) as `review/<shot>.png` and a
  contact sheet, `review.png`, in the video folder, with a table of each shot's start and end;
  its Chrome runs in the video folder and is served that folder alone. The video skill runs it
  and shows the sheet with the script before it asks the owner for the approval.

### Changed

- The eases' test compares every one of the 1,001 points of each ease with the reference within
  1e-12 (and reports the largest error) instead of a byte hash: V8 versions round the last bit
  of an exponential differently (Node 22 failed the hash on `expo.out`). The reference keeps its
  hashes and now stores its values.
- compose links a screens folder inside the project relatively, so a project can move.
- compose copies the studio's fonts and their licence into the video's `assets/fonts/` instead
  of linking to the studio's folder, so a video folder carries its own (a link an older compose
  made is replaced).
- A legacy `"approved": true` is a valid script that is not approved: render and make say
  "this script's approval predates its hash: run jhon-studio video script --approve".
- The tests run with a scratch HOME and XDG folders and without the environment's
  `JHON_STUDIO_*`/`JHON_MEDIA_*`, and the sample's narration cache is seeded whole, so `video
  make`'s tests no longer need Kokoro (CI, which has none, failed two of them).
- `doctor` starts Chrome for real (headless, on about:blank, for up to 20 s) instead of only
  checking that its file exists, and honours `capture.chrome_no_sandbox` in the current
  folder's `.jhon/studio.yaml` and `JHON_STUDIO_CHROME_NO_SANDBOX`.
- Environment names: `JHON_STUDIO_KOKORO` and `JHON_STUDIO_CHROME`, the cache in
  `~/.cache/jhon-studio`; the core's `JHON_MEDIA_KOKORO`, `JHON_MEDIA_CHROME` and
  `~/.cache/jhon-media` still work as fallbacks.
