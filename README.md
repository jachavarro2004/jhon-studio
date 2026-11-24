# jhon-studio

Narrated presentation videos for any project, made by code: the project's own name, palette,
logo and screens; a flat animated intro; real screens held close as proof; narration spoken
locally by Kokoro; English captions and Spanish subtitles; rendered to MP4 by
[HyperFrames](https://github.com/heygen-com/hyperframes) on the studio's own motion engine.

It works on its own, in any project folder. It is also an opt-in integration of
[Jhon](https://github.com/jachavarro2004/jhon-agent): with the integration on, Jhon runs it
through `/jhon:video` (coming in a later version); with it off, Jhon shows and loads nothing
about video.

Status: the first version is in progress. The steps from a written `script.json` to the MP4
(narrate, compose, render) work; drafting a brief, capturing screens and writing the script from
a brief come next.

## Install

Needs Node 22 or newer (it runs the TypeScript sources with Node's type stripping: no build step,
no dependencies), ffmpeg, and for narration and renders Kokoro and the HyperFrames CLI
(`jhon-studio doctor` says what is missing and how to add it).

```sh
git clone https://github.com/jachavarro2004/jhon-studio
ln -s "$PWD/jhon-studio/bin/jhon-studio" ~/.local/bin/jhon-studio   # any folder on PATH
jhon-studio doctor
```

## The steps

Each step runs, and can be checked, on its own. A video lives in its project, in
`.jhon/studio/<video>/`.

```sh
cd my-project
jhon-studio init                      # .jhon/studio.yaml with guessed defaults; edit it
mkdir -p .jhon/studio/tour            # a video: write its script.json (below)
jhon-studio video script --check      # kinds, fields, marks in order, subtitles
jhon-studio video narrate             # Kokoro speaks each new line into narration/
jhon-studio video compose             # index.html + captions.es.json
jhon-studio video script --approve    # you read the script and approve it
jhon-studio video render              # renders/tour.mp4 and renders/tour.es.mp4
```

`--project <dir>` points at another folder; `--video <id>` names the video when the project
has more than one; `video render --lang en` renders one language; `--dry-run` prints the
HyperFrames commands instead. Every command has `--help`. Exit codes: 0 done, 1 refused or
failed, 2 a usage error or a step that is not there yet (`video brief`, `video capture`,
writing a script).

`render` refuses until the script is approved (`"approved": true` in `script.json`, which
`video script --approve` sets after validating it).

What a video folder holds:

```
.jhon/studio/<video>/
  script.json          the source: you write it (and approve it)
  narration/           <key>.opus and <key>.json per spoken line (cached; a line is spoken once)
  index.html           GENERATED: the HyperFrames composition
  captions.es.json     GENERATED: the Spanish subtitles
  assets/              GENERATED links: the studio's fonts, the project's screens, the narration; the logo
  vendor/              GENERATED link to three.js (only for `intro: seal`)
  renders/             the MP4s
```

## .jhon/studio.yaml

Every key is optional; a missing one takes its default. The file is a small subset of YAML
(mappings, lists, quoted or plain scalars, comments), read by the studio's own parser; anything
outside the subset is refused with its line number. Quote colours: `"#1a2b3c"`.

| Key | Default | Meaning |
| --- | --- | --- |
| `name` | the README's H1, else the folder's name | the wordmark |
| `tagline` | the first sentence of the README's first paragraph | the intro's and the close's line |
| `url` | the git remote as a web address (only when the project is the repository's root) | shown on the close |
| `palette` | neutral ink: `accent: "#d2d6dc"`, `accent_fill: "#373b41"`, `ink: "#eef0f2"`, `page: "#18191c"` | four colours; every other tone is derived from them |
| `mark` | `glyph:` the name's initial | `glyph: X` (one character, set on a square) or `path: assets/logo.svg` (SVG, PNG, JPEG or WebP) |
| `intro` | `flat` | `flat`: the mark stamps down and the name inks beside it; `seal`: a 3D seal with the glyph (glyph marks only) |
| `voice` | `af_heart` | the Kokoro voice of the narration |
| `languages` | `[en, es]` | the videos rendered: English, and English narration with Spanish subtitles |
| `screens` | the first of `docs/screens`, `docs/assets`, `screens`, `assets` that exists | the folder a proof's `src` is in |

```yaml
name: Larder
tagline: Cook from what you already have.
url: https://example.com/larder
palette:
  accent: "#7fd1b9"
  accent_fill: "#1f4a40"
  ink: "#eef4f1"
  page: "#141a19"
mark:
  path: assets/logo.svg
languages: [en, es]
screens: screens
```

## script.json

```json
{
  "approved": false,
  "say": { "CLI": "C L I" },
  "shots": [
    { "id": "intro", "kind": "intro", "en": "Larder. Cook from what you already have.", "es": "Larder. Cocina con lo que ya tienes." },
    { "id": "pantry", "kind": "proof", "src": "pantry.png",
      "marks": [{ "at": "what is in stock", "r": [48, 136, 920, 716] }, { "at": "use soon", "r": [1008, 136, 544, 420] }],
      "en": "Larder keeps the list: what is in stock, and what to use soon.",
      "es": "Larder lleva la lista: lo que hay y lo que conviene usar pronto." },
    { "id": "close", "kind": "close", "en": "Larder. Cook from what you already have.", "es": "Larder. Cocina con lo que ya tienes." }
  ]
}
```

Every shot has an `id` (lowercase letters, digits, dashes), a `kind`, its one narration line
`en` and its Spanish subtitle `es` (neutral Spanish in the tú form, two rows at most). A shot
with a `chapter` opens under the band; `capEn: true` also captions the English line. The first
shot is the `intro`, the last the `close`.

| Kind | Fields |
| --- | --- |
| `intro` | `tags` (one or two lines; default: the tagline), `kicker`, `wordmark` (the name with `*emphasis*`) |
| `head` | `chapter`, `lead`, `lines`: one or two `[text, phrase]` |
| `card` | `kicker`, `title` (lines), `body`: `[text, phrase]`, `size` (the title's px) |
| `list` | `kicker` (or `chapter`), `rows`: `[left, right, phrase]` |
| `numbers` | `kicker`, `figures`: `[figure, label, phrase]` |
| `proof` | `src`, `crop` `[x, y, w, h]` (default: the whole screen), `marks`: `{ at, r, delay }`, `pan`: `{ by, at }` |
| `close` | `lines` (default: the tagline), `install` (a command shown above the url) |

A `phrase` (and a mark's `at`) is words of the shot's `en`: the element lands when they are
said. A proof's marks follow the line in order; only the first may be a time in seconds. Text
may carry `*emphasis*` and `` `code` ``. `say` spells words as they should be heard (whole
words; backticks are always dropped). `timing` may set `TAIL`, `PROOF_TAIL`, `PROOF_MIN` and
`CLOSE_TAIL` in seconds.

The sample project, [examples/sample-project](examples/sample-project) (a fictional app), has a
full eight-shot script.

## doctor

`jhon-studio doctor` checks node (22 or newer), ffmpeg on PATH, Kokoro (its venv's Python and
`kokoro-v1.0.onnx` and `voices-v1.0.bin`), the HyperFrames CLI (`hyperframes@0.9.58` in npx's
cache) and chrome-headless-shell, and prints the fix under each failure. It runs and downloads
nothing. `--json` prints `{ "ok": bool, "checks": [{ "id", "ok", "detail", "fix" }] }` for
Jhon's own doctor; it exits 1 when a check fails.

Where the tools are looked for:

- Kokoro: `$JHON_STUDIO_KOKORO`, else `~/.cache/jhon-studio/kokoro` (`venv/`, `model/`). Set it up:

  ```sh
  K=~/.cache/jhon-studio/kokoro
  uv venv --python 3.12 $K/venv && VIRTUAL_ENV=$K/venv uv pip install kokoro-onnx
  mkdir -p $K/model && cd $K/model
  R=https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0
  curl -LO $R/kokoro-v1.0.onnx -LO $R/voices-v1.0.bin
  ```

- Chrome: `$JHON_STUDIO_CHROME`, else the chrome-headless-shell the HyperFrames CLI keeps
  (`npx --yes hyperframes@0.9.58 browser ensure`).
- The older names `JHON_MEDIA_KOKORO`, `JHON_MEDIA_CHROME` and `~/.cache/jhon-media/kokoro` still
  work as fallbacks.

Renders run the CLI with npx from the home folder (no `package.json` or `node_modules` in the
project), telemetry and update checks off, `--no-browser-gpu` (WebGL in software: reproducible
renders) and `--crf 32`.

## Development

```sh
node --experimental-strip-types --no-warnings --test test/*.test.ts
```

The tests need no model, GPU or network: compose runs on the sample project with fixture
narration (`test/fixtures/sample-narration`, each line's seconds), doctor on a fake PATH. A
hygiene test keeps the repository generic. CI runs them on Node 22. The sample's screens are
drawn by `node test/fixtures/sample-screens.mjs` (ffmpeg).

| Path | What |
| --- | --- |
| `bin/jhon-studio` | the entry |
| `src/` | the CLI, settings, script, narrate, compose, render, doctor, the YAML subset |
| `engine/motion.js` | the motion engine: deterministic timelines HyperFrames seeks frame by frame |
| `templates/presentation/` | the style, the timeline and the 3D seal's stage |
| `voice/kokoro.py` | speaks lines with Kokoro (run by narrate in the Kokoro venv) |
| `fonts/`, `vendor/three-0.187.0/` | bundled third parties |

## Licences

jhon-studio is licensed under the Apache License 2.0 ([LICENSE](LICENSE)).

Bundled:

- three.js 0.187.0 (`vendor/three-0.187.0`): MIT, [its licence](vendor/three-0.187.0/LICENSE).
- Fonts (`fonts/`): Fraunces, Space Grotesk and Fira Code (its Nerd Font Mono build), WOFF
  subsets, under the SIL Open Font License 1.1 ([fonts/OFL.txt](fonts/OFL.txt),
  [fonts/README.md](fonts/README.md)).

Not bundled; fetched or installed by you, under their own terms:

- HyperFrames CLI 0.9.58: Apache-2.0 (its package metadata).
- kokoro-onnx 0.6.1: MIT (its package's licence file).
- Kokoro-82M weights (`kokoro-v1.0.onnx`, `voices-v1.0.bin`): Apache 2.0, as kokoro-onnx's
  README states; the model card itself was not checked.
- kokoro-onnx's dependencies in the Kokoro venv: onnxruntime (MIT), phonemizer 3.6.0
  (GPL-3.0-or-later), espeakng-loader 0.2.4 (licence not checked).
- chrome-headless-shell (downloaded by the HyperFrames CLI): licence not checked.
