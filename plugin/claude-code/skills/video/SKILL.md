---
name: video
description: Make a narrated presentation video (MP4, English and Spanish) of the user's project with jhon-studio, from its README, a change or a release. Use when the user asks for a video, demo or presentation of their project.
---

# Make a video of the project with jhon-studio

Run every command in the user's project folder. jhon-studio writes only in `.jhon/` there.
If the user named a source (a change, a release, a file), use it in step 3; otherwise use the
README.

## 1. Check the tools

Run `jhon-studio doctor`. If it exits non-zero, show the user each `FAIL` line with its `fix:`
line and stop. Do not install anything yourself unless the user asks.

## 2. Settings

If `.jhon/studio.yaml` does not exist, run `jhon-studio init`. Show the user the file and ask
what to change:

- `palette` (four quoted `#rrggbb` colours) and `mark` (`glyph: X`, or `path:` to a logo);
- `screens`: which pages to capture (`web:` with `url`, and `steps`: click, fill, wait, goto,
  scroll), which commands to run (`cli:` with `command` as an argv list) or which image files;
- `narration`: `en` or `es` (the other language becomes the subtitles).

Edit the file as the user says. A web page must be running when it is captured.

## 3. Brief

Run `jhon-studio video brief readme` (or `ldd:<change>`, `release:<tag>`, or the file the user
named). It prints the path of `brief.md`. Read it; fix with the user what the extraction got
wrong. Note the video's id: the folder name in `.jhon/studio/<id>/`.

## 4. Script

Run bare `jhon-studio video script` (add `--video <id>` when the project has several videos).
It prints the shot model, an example of each kind, the screens and the brief. Write
`.jhon/studio/<id>/script.json` from the brief:

- the spoken line in the narration language, the subtitle in the other;
- Spanish in the neutral tú form, no voseo;
- short lines, one idea each; only facts the brief or the project shows, no invented figures;
- leave `"approved": false`.

Run `jhon-studio video script --check` and fix every problem it lists until it prints `ok`.

## 5. Preview and approval

Run `jhon-studio video make`. Exit 3 means it captured, narrated and composed a preview and
waits for the user's approval. Then:

1. Show the user the whole script: every shot's line in both languages.
2. Give the preview's path, `.jhon/studio/<id>/index.html` (`npx hyperframes preview` in that
   folder plays it).
3. Ask the user to approve it or say what to change. On changes, edit `script.json`, run
   `--check` and `video make` again, and ask again.

NEVER run `jhon-studio video script --approve` yourself unless the user explicitly approves the
script in this conversation. When they do, run `jhon-studio video script --approve`, then
`jhon-studio video make`.

## 6. Report

Report each MP4 in `.jhon/studio/<id>/renders/` with its duration and size
(`ffprobe -v error -show_entries format=duration,size -of csv=p=0 <file>`).

## When something fails

- Exit 1: show the message; it names the problem and the fix.
- Exit 2 at capture: no Chrome for web screens; show the fix it prints.
- Rendering needs the network only the first time, for `npx hyperframes` (the pinned
  `hyperframes@` package and its browser). If a sandbox blocks it, say so and give the user the
  command to run outside it.
