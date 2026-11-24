# Security policy

jhon-studio runs in your project folder: it runs the commands `studio.yaml`
lists, drives a headless Chrome, runs Kokoro in its own Python venv and
writes into `.jhon/studio/`, often on an agent's behalf. A security problem in
it matters. Thank you for reporting one privately.

## Supported versions

Only the latest release gets security fixes. Install the newest release
(README, Install) before you report, and say which version you ran
(`jhon-studio --version`).

## Reporting a vulnerability

Please do not open a public issue, discussion or pull request for a
vulnerability.

- **Preferred:** open a private report from the repository's Security tab
  (Report a vulnerability). It reaches the maintainer only.
- **If you cannot use GitHub:** write to jhon87195@outlook.com.

Include what you can:

- what an attacker, a crafted project or a misbehaving agent can do, and
  what it needs first;
- the steps or the command that shows it (a `studio.yaml` or `script.json`
  that triggers it, with any private data removed), and the jhon-studio
  version and Node version;
- which step it is in: brief, script, capture, narrate, compose, render or
  make, or the Claude Code plugin and its video skill.

## What to expect

- An acknowledgement within 7 days.
- An assessment, and a fix or a mitigation plan, as soon as the problem is
  understood. You are kept informed along the way.
- Credit in the release notes and the advisory, unless you ask not to be
  named.

## Scope

In scope: the `jhon-studio` command and its sources (`bin/`, `src/`), the
motion engine (`engine/`), the templates, the Kokoro script (`voice/`), the
Claude Code plugin and its skill (`plugin/claude-code/`), and the approval of
a script by its hash.

Out of scope: problems in the HyperFrames CLI, Kokoro or kokoro-onnx,
chrome-headless-shell, ffmpeg, Claude Code, pi, Jhon itself or another
upstream project; report those to them. A command that `studio.yaml` lists
runs in your project by design, as you would run it yourself; a report that
shows it running something the file does not list is welcome.
