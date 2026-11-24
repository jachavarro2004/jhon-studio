/**
 * src/cli.ts — the jhon-studio command line (bin/jhon-studio runs main()).
 *
 * Exit codes: 0 done, 1 refused or failed (the reason on stderr), 2 a usage error (or web
 * screens with no Chrome), 3 `video make` stopped before a step that needs the user.
 */
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { compose } from "./compose.ts";
import { ConfigError, LANGUAGES, STUDIO, configFile, guessConfig, loadConfig, type Config } from "./config.ts";
import { doctor, formatReport } from "./doctor.ts";
import { narrate } from "./narrate.ts";
import { commandLine, renderJobs, runJobs } from "./render.ts";
import { approval, loadScript, scriptHash, validateScript } from "./script.ts";
import { screenLines, writeBrief } from "./brief.ts";
import { capture } from "./capture.ts";
import { make } from "./make.ts";
import { briefFile, reference } from "./reference.ts";
import { StudioError, projectDir, resolveVideo, studioDir, videoIds } from "./video.ts";
import { VERSION } from "./version.ts";
import { stringifyYaml } from "./yaml.ts";

const VIDEO_FLAGS = `  --project <dir>   the project (default: the current folder)
  --video <id>      the video, a folder in <project>/.jhon/studio/ (default: the only one)`;

const HELP: Record<string, string> = {
  "": `Usage: jhon-studio <command> [options]

Narrated presentation videos for any project, from its own palette, mark and screens.

Commands:
  init               write .jhon/studio.yaml with defaults guessed from the project
  video brief        draft a video's brief from the README, a change, a release or a file
  video script       print the shot model and the brief; check or approve script.json
  video capture      make the screens studio.yaml lists (files, commands, web pages)
  video narrate      speak the script's lines with Kokoro (cached)
  video compose      write the HyperFrames composition and its subtitles
  video render       render the approved video to MP4, per language
  video make         run the remaining steps, stopping where the user is needed
  doctor             check node, ffmpeg, Kokoro, HyperFrames and Chrome
  integration        where Jhon finds the studio's agent plugin and video skill

The flow: init, video brief readme, write script.json (video script shows how), video script
--approve, video make. Run \`jhon-studio <command> --help\` for a command's options;
\`jhon-studio --version\` prints the version.
`,
  integration: `Usage: jhon-studio integration [--json]

For Jhon's studio integration (and any agent runtime): the studio's version, its Claude Code
plugin folder (plugin/claude-code, which holds the video skill, /jhon-studio:video) and the
skill's SKILL.md, as absolute paths in the studio's real folder (a link to bin/jhon-studio on
PATH is followed).

  --json   one JSON object: { "version", "plugin_dir", "skill" }
`,
  init: `Usage: jhon-studio init [--project <dir>]

Writes <project>/.jhon/studio.yaml with the defaults guessed from the project: name and tagline
from its README's title and first sentence, url from its git remote, a neutral palette, the
name's initial as the mark, English narration with Spanish subtitles. Never overwrites an
existing file.

  --project <dir>   the project (default: the current folder)
`,
  doctor: `Usage: jhon-studio doctor [--json]

Checks node (22 or newer), ffmpeg, Kokoro (its venv and model), the HyperFrames CLI (pinned,
in npx's cache) and chrome-headless-shell; prints the fix for each failure. Exits 1 if any fails.

  --json   one JSON object: { ok, checks: [{ id, ok, detail, fix }] }
`,
  video: `Usage: jhon-studio video <step> [options]

A video is a folder <project>/.jhon/studio/<id>/ with its brief.md and script.json. Its steps,
each run and checked alone:
  brief      draft brief.md from the README, a change, a release's notes or a file
  script     print the shot model and the brief (to write script.json); --check; --approve
  capture    make the screens studio.yaml lists into screens/
  narrate    speak each line with Kokoro into narration/ (only lines not spoken yet)
  compose    write index.html and captions.<lang>.json from the script and the narration
  render     render renders/<id>.mp4 and renders/<id>.<lang>.mp4 with HyperFrames
  make       capture, narrate, compose and render, stopping where the user is needed

Run \`jhon-studio video <step> --help\` for a step's options.
`,
  "video script": `Usage: jhon-studio video script [--check | --approve] [--project <dir>] [--video <id>]

With neither option: prints the shot model (the kinds, the rules, one example of each kind in
the project's narration language), the screens a proof may show and the video's brief, to write
script.json from (by hand or with an agent).

  --check     validate script.json: kinds, fields, marks in order, subtitles
  --approve   validate it, then store its hash as its approval ("approved": { "sha256": ... });
              render refuses a script never approved, or changed after its approval
${VIDEO_FLAGS}
`,
  "video narrate": `Usage: jhon-studio video narrate [--project <dir>] [--video <id>]

Speaks each distinct line of the script in the narration's language (studio.yaml narration)
with Kokoro (the project's voice) into the video's narration/ cache as <key>.opus and
<key>.json; a line already spoken is never spoken again.
${VIDEO_FLAGS}
`,
  "video compose": `Usage: jhon-studio video compose [--project <dir>] [--video <id>]

Writes the video's index.html (the HyperFrames composition) and captions.<lang>.json (one per
subtitle language) from its script, its narration's seconds and the project's settings.
${VIDEO_FLAGS}
`,
  "video render": `Usage: jhon-studio video render [--project <dir>] [--video <id>] [--lang en,es] [--dry-run]

Renders the composed video with the HyperFrames CLI, once per language, into the video's
renders/: <id>.mp4 in the narration's language, <id>.<lang>.mp4 subtitled in each other one.
Refuses unless the script is approved as it is now (jhon-studio video script --approve).

  --lang <list>   the languages to render (default: the narration's and the subtitles')
  --dry-run       print the commands instead of running them
${VIDEO_FLAGS}
`,
  "video make": `Usage: jhon-studio video make [--project <dir>] [--video <id>] [--dry-run]

Runs the video's remaining steps in order: capture, narrate, compose, render. Each skips what is
done (screens and the composition are rewritten only when they change, lines are spoken once,
a render newer than what it is made of is kept). Stops with exit 3 where the user is needed:
no script.json yet (write it from the brief), or a script not approved as it is now (it is
composed first, so it can be previewed; the owner approves it with video script --approve).

  --dry-run   print the render commands instead of running them
${VIDEO_FLAGS}
`,
  "video brief": `Usage: jhon-studio video brief <source> [--project <dir>] [--video <id>]

Drafts <project>/.jhon/studio/<id>/brief.md from the project's own text, by extraction alone (no
model): the project's name, tagline and url, what it is, who it is for, the facts to show
(figures, features, decisions) and the screens there are. Read it and correct it; the script is
written from it (\`jhon-studio video script\` prints the shot model and the brief).

Sources:
  readme           the project's README                                 (video id: tour)
  ldd:<change>     openspec/changes/<change>/ or ldd/changes/<change>/:
                   proposal.md, design.md, tasks.md                       (video id: <change>)
  release:<tag>    the tag's CHANGELOG.md section, else the subjects of
                   git log <previous tag>..<tag>                          (video id: release-<tag>)
  <file>           any Markdown or text file                              (video id: its name)

  --project <dir>   the project (default: the current folder)
  --video <id>      the video's folder name (default: the source's, above)
`,
  "video capture": `Usage: jhon-studio video capture [--project <dir>] [--video <id>]

Makes the screens .jhon/studio.yaml lists under screens into the video's screens/ folder, where
a proof's src names them:
  - file: docs/home.png              copied (PNG or SVG)
  - cli:                             run in the project as an argv list, never a shell line,
      command: [mytool, --help]      with colour forced on; drawn as a terminal in the
      name: help                     project's palette (help.svg); cols (100), timeout (30 s)
  - web:                             loaded in a headless Chrome and captured (home.png):
      url: http://localhost:3000/    http, https, file, or a path in the project
      name: home                     viewport [1600, 900], scale 1, and steps:
      steps:                         click: <selector>, fill: [<selector>, <text>],
        - click: "#login"            wait: <ms or selector>, goto: <url>, scroll: <px or selector>
Web pages need chrome-headless-shell (npx --yes hyperframes@0.9.58 browser ensure) or
JHON_STUDIO_CHROME; without one they are refused (exit 2) after every other screen is made.
With screens a folder, there is nothing to capture.
${VIDEO_FLAGS}
`,
};

interface Args { cmd: string; flags: Record<string, string | true>; help: boolean; args: string[] }

/** The commands that take words after them, and how many at most. */
const POSITIONAL: Record<string, number> = { "video brief": 1 };

/** Splits argv into the command (one or two words), its flags (--name value, --name=value, --switch) and --help. */
function parse(argv: string[]): Args {
  const words: string[] = [];
  const flags: Record<string, string | true> = {};
  let help = false;
  const VALUED = new Set(["project", "video", "lang"]);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--help" || a === "-h") { help = true; continue; }
    if (a.startsWith("--")) {
      const [name, inline] = a.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
      if (VALUED.has(name)) {
        const v = inline ?? argv[++i];
        if (v === undefined || v.startsWith("--")) throw new StudioError(`--${name} needs a value`, 2);
        flags[name] = v;
      } else flags[name] = inline ?? true;
      continue;
    }
    words.push(a);
  }
  const n = words[0] === "video" ? 2 : 1;
  const cmd = words.slice(0, n).join(" ");
  const args = words.slice(n);
  if (args.length > (POSITIONAL[cmd] ?? 0)) throw new UsageError(`unexpected argument "${args.at(-1)}"`, cmd);
  return { cmd, flags, help, args };
}

const VIDEO_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

class UsageError extends StudioError {
  usage: string;
  constructor(message: string, usage: string) {
    super(message, 2);
    this.usage = usage;
  }
}

const ALLOWED: Record<string, string[]> = {
  init: ["project"],
  doctor: ["json"],
  integration: ["json"],
  "video script": ["project", "video", "check", "approve"],
  "video narrate": ["project", "video"],
  "video compose": ["project", "video"],
  "video render": ["project", "video", "lang", "dry-run"],
  "video make": ["project", "video", "dry-run"],
  "video brief": ["project", "video"],
  "video capture": ["project", "video"],
};

/** The project, its settings, the video and its script. */
function load(flags: Args["flags"]) {
  const project = projectDir(flags.project as string | undefined);
  const config = loadConfig(project);
  const video = resolveVideo(project, flags.video as string | undefined);
  if (!existsSync(video.script)) throw new StudioError(`no script yet: write ${video.script} (jhon-studio video script prints the shot model and the brief)`);
  const script = loadScript(video.script);
  return { project, config, video, script };
}

function checked(script: unknown, config: Config, file: string) {
  const errs = validateScript(script, { languages: config.languages, narration: config.narration });
  if (errs.length) throw new StudioError(`${file} is not valid:\n  ${errs.join("\n  ")}`);
}

/** Runs one command; returns its exit code. */
export async function main(argv: string[], out = process.stdout, err = process.stderr): Promise<number> {
  let args: Args;
  try {
    args = parse(argv);
  } catch (e) {
    const u = e instanceof UsageError ? e.usage : "";
    err.write(`jhon-studio: ${(e as Error).message}\n\n${HELP[u] ?? HELP[""]}`);
    return 2;
  }
  const { cmd, flags, help, args: words } = args;
  if (!(cmd in HELP)) {
    err.write(`${cmd ? `jhon-studio: unknown command "${cmd}"\n\n` : ""}${HELP[cmd.startsWith("video") ? "video" : ""]}`);
    return 2;
  }
  if (help) { out.write(HELP[cmd]!); return 0; }
  if (cmd === "" && flags.version === true && Object.keys(flags).length === 1) { out.write(`${VERSION}\n`); return 0; }
  if (cmd === "" || cmd === "video") { err.write(HELP[cmd]!); return 2; }
  const unknown = Object.keys(flags).filter((f) => !ALLOWED[cmd]!.includes(f));
  if (unknown.length) { err.write(`jhon-studio: ${cmd}: unknown option --${unknown[0]}\n\n${HELP[cmd]}`); return 2; }

  try {
    switch (cmd) {
      case "init": {
        const project = projectDir(flags.project as string | undefined);
        const file = configFile(project);
        if (existsSync(file)) throw new StudioError(`${file} already exists; edit it, or remove it to start again`);
        const { languages: _l, captures: _c, ...c } = guessConfig(project);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, "# jhon-studio settings for this project; every key is optional (see jhon-studio's README).\n"
          + "# palette: #rrggbb colours, quoted. mark: glyph (one character) or path (an SVG or PNG logo).\n"
          + "# intro: flat (the default) or seal (a 3D seal; a glyph mark only).\n"
          + "# narration: en or es (spoken); subtitles: the other languages. voice: a Kokoro voice (en: af_heart, es: ef_dora).\n"
          + "# screens: a folder of PNG or SVG screens, or a list of what video capture makes (- file:, - cli:, - web:).\n"
          + stringifyYaml(c as unknown as Record<string, never>));
        out.write(`wrote ${file}\n`);
        return 0;
      }
      case "integration": {
        // STUDIO is this file's real folder's parent: Node follows a link to bin/jhon-studio.
        const plugin = realpathSync(join(STUDIO, "plugin", "claude-code"));
        const info = { version: VERSION, plugin_dir: plugin, skill: join(plugin, "skills", "video", "SKILL.md") };
        if (!existsSync(info.skill)) throw new StudioError(`${info.skill} is missing: the studio's folder is incomplete`);
        out.write(flags.json ? JSON.stringify(info, null, 2) + "\n" : Object.entries(info).map(([k, v]) => `${k} ${v}`).join("\n") + "\n");
        return 0;
      }
      case "doctor": {
        const r = doctor(process.env);
        out.write(flags.json ? JSON.stringify(r, null, 2) + "\n" : formatReport(r));
        return r.ok ? 0 : 1;
      }
      case "video brief": {
        if (!words.length) throw new UsageError("video brief: which source? readme, ldd:<change>, release:<tag> or a file", "video brief");
        const project = projectDir(flags.project as string | undefined);
        const id = flags.video as string | undefined;
        if (id !== undefined && !VIDEO_ID.test(id)) throw new StudioError(`--video: "${id}" is not a folder name`, 2);
        out.write(`wrote ${writeBrief(project, loadConfig(project), words[0]!, id)}\n`);
        return 0;
      }
      case "video capture": {
        const project = projectDir(flags.project as string | undefined);
        const config = loadConfig(project);
        const video = resolveVideo(project, flags.video as string | undefined);
        if (!config.captures) {
          out.write(`nothing to capture: screens in .jhon/studio.yaml is the folder ${config.screens}; list files, web pages or commands there to capture them\n`);
          return 0;
        }
        const r = await capture(video, config);
        if (r.made.length) out.write(r.made.join("\n") + "\n");
        for (const f of r.failed) err.write(`jhon-studio: ${f}\n`);
        return r.failed.length > (r.needChrome ? config.captures.filter((c) => c.kind === "web").length : 0) ? 1 : r.needChrome ? 2 : 0;
      }
      case "video script": {
        if (!flags.check && !flags.approve) {
          const project = projectDir(flags.project as string | undefined);
          const config = loadConfig(project);
          const id = flags.video as string | undefined;
          const video = id !== undefined || videoIds(project).length ? resolveVideo(project, id) : null;
          const dir = video?.dir ?? join(studioDir(project), "<video>");
          out.write(reference(config, join(dir, "script.json"), screenLines(config, project, dir), video ? briefFile(video.dir) : null));
          return 0;
        }
        const { config, video, script } = load(flags);
        checked(script, config, video.script);
        if (flags.approve) {
          const hash = scriptHash(script);
          const text = readFileSync(video.script, "utf8");
          const value = `"approved": { "sha256": "${hash}" }`;
          const APPROVED = /"approved"\s*:\s*(true|false|null|\{[^{}]*\})/;
          const next = APPROVED.test(text) ? text.replace(APPROVED, value) : text.replace(/^\s*\{/, `{\n  ${value},`);
          let ok = false;
          try { ok = approval(JSON.parse(next)) === "approved"; } catch { /* below */ }
          if (!ok) throw new StudioError(`${video.script}: could not store its approval`);
          writeFileSync(video.script, next);
          out.write(`approved ${video.script} (${script.shots.length} shots, sha256 ${hash.slice(0, 12)})\n`);
        } else out.write(`ok ${video.script} (${script.shots.length} shots)\n`);
        return 0;
      }
      case "video narrate": {
        const { config, video, script } = load(flags);
        checked(script, config, video.script);
        out.write(JSON.stringify(narrate(video, script, config), null, 2) + "\n");
        return 0;
      }
      case "video compose": {
        const { config, video, script } = load(flags);
        const r = compose(video, script, config);
        out.write(`${r.total} s, ${r.shots} shots\n${r.list}\n`);
        return 0;
      }
      case "video make": {
        const project = projectDir(flags.project as string | undefined);
        const config = loadConfig(project);
        const video = resolveVideo(project, flags.video as string | undefined);
        await make(video, config, (l) => out.write(l + "\n"), { dryRun: !!flags["dry-run"] });
        return 0;
      }
      case "video render": {
        let langs: string[] | undefined;
        if (typeof flags.lang === "string") {
          langs = flags.lang.split(",").map((l) => l.trim()).filter(Boolean);
          const bad = langs.find((l) => !(LANGUAGES as readonly string[]).includes(l));
          if (bad !== undefined || !langs.length) throw new StudioError(`--lang: "${bad ?? flags.lang}" is not one of ${LANGUAGES.join(", ")}`, 2);
        }
        const { config, video, script } = load(flags);
        const jobs = renderJobs(video, script, langs ?? config.languages, config.narration);
        if (flags["dry-run"]) { out.write(jobs.map(commandLine).join("\n") + "\n"); return 0; }
        runJobs(jobs);
        out.write(jobs.map((j) => `rendered ${j.out}`).join("\n") + "\n");
        return 0;
      }
    }
  } catch (e) {
    if (e instanceof StudioError || e instanceof ConfigError) {
      err.write(`jhon-studio: ${e.message}\n`);
      return e instanceof StudioError ? e.code : 1;
    }
    err.write(`jhon-studio: ${(e as Error).stack ?? e}\n`);
    return 1;
  }
  return 2;
}
