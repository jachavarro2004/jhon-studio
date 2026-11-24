# Larder

Larder plans a week of dinners from what is already in your pantry. It is a fictional project:
jhon-studio's tests and examples make a video of it.

## What it does

- Keeps the pantry: every item, its amount, and what to use soon.
- Plans seven dinners that use what is about to spoil first.
- Writes a shopping list of only what is missing.

## The video

`.jhon/studio.yaml` holds Larder's name, palette, logo and screens; `.jhon/studio/tour/script.json`
is the video's script. `bin/larder.mjs` (`node bin/larder.mjs plan --week`) and `web/index.html`
are a command and a page to capture: list them under `screens` (see jhon-studio's README) to
show them as proofs. From the jhon-studio repository:

```sh
bin/jhon-studio video brief readme --project examples/sample-project
bin/jhon-studio video script --check --project examples/sample-project
bin/jhon-studio video make --project examples/sample-project    # needs Kokoro and HyperFrames (jhon-studio doctor)
```
