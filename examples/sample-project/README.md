# Larder

Larder plans a week of dinners from what is already in your pantry. It is a fictional project:
jhon-studio's tests and examples make a video of it.

## What it does

- Keeps the pantry: every item, its amount, and what to use soon.
- Plans seven dinners that use what is about to spoil first.
- Writes a shopping list of only what is missing.

## The video

`.jhon/studio.yaml` holds Larder's name, palette, logo and screens; `.jhon/studio/tour/script.json`
is the video's script. From the jhon-studio repository:

```sh
bin/jhon-studio video script --check --project examples/sample-project
bin/jhon-studio video narrate --project examples/sample-project    # needs Kokoro (jhon-studio doctor)
bin/jhon-studio video compose --project examples/sample-project
```
