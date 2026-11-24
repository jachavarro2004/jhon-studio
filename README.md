<p align="center">
  <img src="docs/assets/brand/jhon-banner.gif" alt="Jhon" width="760">
</p>

<h1 align="center">jhon-studio — presentation videos for any project</h1>

<p align="center">
  <b>Let the agent run. Deliver only what is proven.</b><br>
  An agent framework for Claude Code and pi.
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/github/license/jachavarro2004/jhon-studio?style=flat&color=e7bbc8&labelColor=1f1f28" alt="License: Apache-2.0"></a>
  <a href="https://github.com/jachavarro2004/jhon-studio/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/jachavarro2004/jhon-studio/ci.yml?branch=main&label=CI&style=flat&color=e7bbc8&labelColor=1f1f28" alt="CI"></a>
  <a href="https://github.com/sponsors/jachavarro2004"><img src="https://img.shields.io/github/sponsors/jachavarro2004?label=Sponsor&logo=githubsponsors&style=flat&color=e7bbc8&labelColor=1f1f28" alt="GitHub Sponsors"></a>
  <a href="https://github.com/jachavarro2004/jhon-studio/stargazers"><img src="https://img.shields.io/github/stars/jachavarro2004/jhon-studio?style=flat&color=e7bbc8&labelColor=1f1f28" alt="Stars"></a>
</p>

Narrated presentation videos for any project, made by code: the project's own name, palette,
logo and screens; a flat animated intro; real screens held close as proof (images, command
output, web pages); narration spoken locally by Kokoro in English or Spanish, subtitled in the
other; rendered to MP4 by
[HyperFrames](https://github.com/heygen-com/hyperframes) on the studio's own motion engine.

It works on its own, in any project folder. It is also an opt-in integration of
[Jhon](https://github.com/jachavarro2004/jhon-agent): with the integration on, Jhon runs it
through `/jhon:video` ([With Jhon](#with-jhon)); with it off, Jhon shows and loads nothing
about video.

Status: the first version is in progress. The whole flow works on any project (a web app, a
command-line tool, a library): a brief drafted from its own text, a script written from it (by
you or an agent) and approved, its screens captured, the narration spoken, the MP4s rendered.

## Install

Needs Node 22 or newer (it runs the TypeScript sources with Node's type stripping: no build step,
no dependencies), ffmpeg, and for narration and renders Kokoro and the HyperFrames CLI; web
screens are captured with the chrome-headless-shell HyperFrames keeps (`jhon-studio doctor` says
what is missing and how to add it).

```sh
git clone https://github.com/jachavarro2004/jhon-studio ~/.local/share/jhon-studio && ln -s ~/.local/share/jhon-studio/bin/jhon-studio ~/.local/bin/jhon-studio
jhon-studio doctor
```

Any folder on PATH does instead of `~/.local/bin`: the link is followed to the clone, where the
studio finds its templates, fonts and agent plugin. `jhon-studio --version` prints the version;
`git -C ~/.local/share/jhon-studio pull` updates it.

## With Jhon

The studio is an opt-in integration of Jhon, off by default: with it off, Jhon shows and loads
nothing about video. Turn it on with `jhon setup` (choose jhon-studio) or the setting
`integrations.studio = true`. Then:

- in pi, `/jhon:video` makes a video of the project you are in;
- in Claude Code, the studio's own plugin (`plugin/claude-code`, loaded by Jhon with a second
  `--plugin-dir`) adds `/jhon-studio:video`: Claude Code names a plugin's skills
  `<plugin>:<skill>`.

Both run the same skill ([plugin/claude-code/skills/video/SKILL.md](plugin/claude-code/skills/video/SKILL.md)):
`jhon-studio doctor`, `init` (and what to change in it), `video brief`, the script drafted from
it and checked, `video make` to a preview, your approval (the agent never approves for you),
then the MP4s. Jhon's `jhon doctor` checks the studio through `jhon-studio doctor --json`, and
finds the plugin and the skill with `jhon-studio integration --json`:

```json
{ "version": "0.1.0", "plugin_dir": "/…/jhon-studio/plugin/claude-code", "skill": "/…/jhon-studio/plugin/claude-code/skills/video/SKILL.md" }
```

Without Jhon, the plugin works on its own: `claude --plugin-dir ~/.local/share/jhon-studio/plugin/claude-code`.

## The flow

A video lives in its project, in `.jhon/studio/<video>/`.

```sh
cd my-project
jhon-studio init                       # .jhon/studio.yaml with guessed defaults; edit it
jhon-studio video brief readme         # .jhon/studio/tour/brief.md: what the video is made from
jhon-studio video script               # the shot model, an example of each kind, the screens, the brief
$EDITOR .jhon/studio/tour/script.json  # write the script (or have an agent write it)
jhon-studio video script --check       # kinds, fields, marks in order, subtitles
jhon-studio video make                 # capture, narrate, compose; stops for the approval (exit 3)
jhon-studio video script --approve     # you read the script and approve it
jhon-studio video make                 # renders/tour.mp4 and renders/tour.es.mp4
```

`video make` runs what is left, in order (capture, narrate, compose, render), and stops where
you are needed, with exit 3 and what to do: no `script.json` yet, or a script not approved as
it is now. It composes before it stops, so the video can be previewed (`npx hyperframes
preview` in the video folder) before the approval. Each step also runs alone:

| Step | What it does |
| --- | --- |
| `video brief <source>` | drafts `brief.md` from `readme`, `ldd:<change>` (`openspec/changes/<change>/` or `ldd/changes/<change>/`: proposal, design, tasks), `release:<tag>` (its CHANGELOG section, else `git log <previous tag>..<tag>`) or a file; text extraction only, no model |
| `video script` | prints the shot model, a valid example of each kind in the narration's language, the screens and the brief; `--check` validates; `--approve` stores the script's hash |
| `video capture` | makes the screens `studio.yaml` lists into `screens/` (files, commands, web pages) |
| `video narrate` | speaks each new line with Kokoro into `narration/` (a line is spoken once) |
| `video compose` | writes `index.html` and `captions.<lang>.json` |
| `video render` | renders the MP4s with HyperFrames; refuses a script not approved as it is now |

The approval is the script's hash (`"approved": { "sha256": ... }`, the SHA-256 of the script
without that field): any change after it, a word or a mark, needs a new approval, and render
says so: "the script changed after its approval: run jhon-studio video script --approve". An
older script's `"approved": true` is read as not approved: "this script's approval predates its
hash: run jhon-studio video script --approve".

`--project <dir>` points at another folder; `--video <id>` names the video when the project
has more than one (`video brief` names it after its source: `tour`, the change, `release-<tag>`,
the file's name); `video render --lang en` renders one language; `--dry-run` (render, make)
prints the HyperFrames commands instead. Every command has `--help`. Exit codes: 0 done, 1
refused or failed, 2 a usage error (or web screens with no Chrome), 3 `video make` stopped where
you are needed.

What a video folder holds:

```
.jhon/studio/<video>/
  brief.md             what the script is written from (video brief drafts it; edit it)
  script.json          the source: you write it, and approve it
  screens/             GENERATED by capture, when studio.yaml lists screens
  narration/           <key>.opus and <key>.json per spoken line (cached; a line is spoken once)
  index.html           GENERATED: the HyperFrames composition
  captions.<lang>.json GENERATED: the subtitles, one file per subtitle language
  assets/              GENERATED: a copy of the studio's fonts and their licence (fonts/, so the
                       folder carries its own); links to the screens and the narration; the logo
  vendor/              GENERATED link to three.js (only for `intro: seal`)
  renders/             the MP4s: <video>.mp4 in the narration's language, <video>.<lang>.mp4 subtitled
```

## From an agent

The studio has no model of its own: the brief is extracted, and the script is written by you or
by an agent (Claude Code, pi; Jhon exposes it as `/jhon:video` when its studio integration is
on, and the skill it runs is [plugin/claude-code/skills/video/SKILL.md](plugin/claude-code/skills/video/SKILL.md)).
An agent's loop:

1. `jhon-studio video brief readme` (or the change, the release, a file the user names), then
   read `brief.md` and correct what the extraction got wrong with the user.
2. `jhon-studio video script`: everything needed to write `script.json` (the kinds, the rules,
   an example, the screens with their sizes, the brief). Write it; `--check` until it is valid.
   Use only what the brief or the project shows: no invented figures.
3. `jhon-studio video make`: exit 3 means the owner must read and approve the script; show it,
   and let the owner run `jhon-studio video script --approve` (an agent never approves for them).
4. `jhon-studio video make` again: the MP4s, in `renders/`.

## .jhon/studio.yaml

Every key is optional; a missing one takes its default. The file is a small subset of YAML
(mappings, lists of scalars or of mappings, quoted or plain scalars, comments), read by the studio's own parser; anything
outside the subset is refused with its line number. Quote colours: `"#1a2b3c"`.

| Key | Default | Meaning |
| --- | --- | --- |
| `name` | the README's H1, else the folder's name | the wordmark |
| `tagline` | the first sentence of the README's first paragraph | the intro's and the close's line |
| `url` | the git remote as a web address (only when the project is the repository's root) | shown on the close |
| `palette` | neutral ink: `accent: "#d2d6dc"`, `accent_fill: "#373b41"`, `ink: "#eef0f2"`, `page: "#18191c"` | four colours; every other tone is derived from them |
| `mark` | `glyph:` the name's initial | `glyph: X` (one character, set on a square) or `path: assets/logo.svg` (SVG, PNG, JPEG or WebP) |
| `intro` | `flat` | `flat`: the mark stamps down and the name inks beside it; `seal`: a 3D seal with the glyph (glyph marks only) |
| `narration` | `en` | the language the lines are spoken in: `en` or `es` |
| `subtitles` | the other language | the languages the lines are subtitled in (a render each); `[]` for none |
| `voice` | `af_heart` for `en`, `ef_dora` for `es` | the Kokoro voice of the narration (any in `voices-v1.0.bin`) |
| `screens` | the first of `docs/screens`, `docs/assets`, `screens`, `assets` that exists | the folder a proof's `src` is in, or a list of what `video capture` makes (below) |

`languages: [en, es]`, the older spelling, still reads as the narration's language (`en` unless
`narration` says otherwise) and the others as subtitles.

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
narration: en
subtitles: [es]
screens: screens
```

### Screens to capture

`screens` may list the screens instead of naming a folder; `video capture` (and `video make`)
makes them into the video's `screens/`, and a proof's `src` is the name:

```yaml
screens:
  - file: docs/pantry.png            # a PNG or SVG of the project, copied (name: to rename it)
  - cli:                             # a command: plan.svg, a terminal in the project's palette
      command: [larder, plan, --week]  # an argv list, run in the project; never a shell line
      name: plan
      cols: 72                       # the terminal's width (default 100); timeout: 30 (seconds)
  - web:                             # a page in a headless Chrome: list.png
      url: http://localhost:3000/list  # http, https, file, or a path in the project
      name: list
      viewport: [1600, 900]          # the default; scale: 2 for twice the pixels
      steps:                         # run in order before the capture
        - fill: ["#item", "Chickpeas"]
        - click: "#add"
        - wait: ".added"             # a selector to appear, or milliseconds
        - scroll: 400                # pixels, or a selector to scroll to
        - goto: /week                # another address (relative to the page's)
```

A command runs with colour forced on (`FORCE_COLOR`, `CLICOLOR_FORCE`, `COLUMNS`); one that
fails or outlives its timeout is refused with its last lines. Web pages are driven over the
Chrome DevTools Protocol with Node's own WebSocket (no npm dependency, no browser download):
the chrome-headless-shell the HyperFrames CLI keeps (`npx --yes hyperframes@0.9.58 browser
ensure`) or `$JHON_STUDIO_CHROME`; without one, web screens are refused with that fix and
capture exits 2, after making every other screen. The app must be running for an http address.

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

Every shot has an `id` (lowercase letters, digits, dashes), a `kind`, and its line in each
language: `en` and `es`. The narration's language (`narration` in studio.yaml) is spoken and
times what lands; the others are its subtitles (two rows at most). Spanish is neutral, in the
tú form. A shot with a `chapter` opens under the band; `capEn: true` also captions the spoken
line. The first shot is the `intro`, the last the `close`. `video script` prints this model with
an example of each kind.

| Kind | Fields |
| --- | --- |
| `intro` | `tags` (one or two lines; default: the tagline), `kicker`, `wordmark` (the name with `*emphasis*`) |
| `head` | `chapter`, `lead`, `lines`: one or two `[text, phrase]` |
| `card` | `kicker`, `title` (lines), `body`: `[text, phrase]`, `size` (the title's px) |
| `list` | `kicker` (or `chapter`), `rows`: `[left, right, phrase]` |
| `numbers` | `kicker`, `figures`: `[figure, label, phrase]` |
| `proof` | `src`, `crop` `[x, y, w, h]` (default: the whole screen), `marks`: `{ at, r, delay }`, `pan`: `{ by, at }` |
| `close` | `lines` (default: the tagline), `install` (a command shown above the url) |

A `phrase` (and a mark's `at`) is words of the shot's spoken line (its `en`, or its `es` when
the narration is Spanish): the element lands when they are said. A proof's marks follow the line in order; only the first may be a time in seconds. Text
may carry `*emphasis*` and `` `code` ``. `say` spells words as they should be heard (whole
words; backticks are always dropped). `timing` may set `TAIL`, `PROOF_TAIL`, `PROOF_MIN` and
`CLOSE_TAIL` in seconds.

The sample project, [examples/sample-project](examples/sample-project) (a fictional app), has a
full eight-shot script, a command (`bin/larder.mjs`) and a page (`web/index.html`) to capture.

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
narration (`test/fixtures/sample-narration`, each line's seconds), doctor on a fake PATH, web
capture against a page the test serves with `node:http` (skipped, with the reason, when no
chrome-headless-shell is found). Every test runs with a scratch HOME and XDG folders and
without the `JHON_STUDIO_*` and `JHON_MEDIA_*` variables of your environment, so a run passes
here only if it passes on a machine with no Kokoro (the web capture tests alone are handed the
machine's Chrome, when it has one). A hygiene test keeps the repository generic and free of
the owner's private projects. CI runs them on
Node 22, 24 and the current LTS. The sample's screens are
drawn by `node test/fixtures/sample-screens.mjs` (ffmpeg).

| Path | What |
| --- | --- |
| `bin/jhon-studio` | the entry |
| `plugin/claude-code/` | the Claude Code plugin (`jhon-studio`) and its video skill, `/jhon-studio:video`; pi runs the same `SKILL.md` |
| `src/` | the CLI and its version, settings, brief, script and its reference, capture (ANSI to SVG, Chrome over CDP), narrate, compose, render, make, doctor, the YAML subset |
| `engine/motion.js` | the motion engine: deterministic timelines HyperFrames seeks frame by frame |
| `templates/presentation/` | the style, the timeline and the 3D seal's stage |
| `voice/kokoro.py` | speaks lines with Kokoro (run by narrate in the Kokoro venv) |
| `fonts/`, `vendor/three-0.187.0/` | bundled third parties |

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md); questions and help: [SUPPORT.md](SUPPORT.md);
security problems, privately: [SECURITY.md](SECURITY.md).

## The Jhon family

- **[jhon-agent](https://github.com/jachavarro2004/jhon-agent)**: the framework.
- **jhon-studio**: presentation videos for any project (you are here).
- **[The landing](https://jachavarro2004.github.io/jhon-site/)**: Jhon's site, jachavarro2004.github.io/jhon-site.
- **[The profile](https://github.com/jachavarro2004)**: the author's GitHub profile, github.com/jachavarro2004.
- **YouTube**: Jhon's films, a video for every release.

## Support Jhon

Jhon is free and open source.
If it helps you, donate any amount you choose,
once or monthly, on GitHub Sponsors.
If you can't donate, a ⭐ on the repo helps
keep the project maintained.

[♥ Sponsor on GitHub](https://github.com/sponsors/jachavarro2004)

## License

jhon-studio is licensed under the Apache License 2.0 ([LICENSE](LICENSE)).

### Third-party licences

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
