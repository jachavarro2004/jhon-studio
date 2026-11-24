/**
 * src/cli.ts — the jhon-studio command line (bin/jhon-studio runs main()).
 *
 * Exit codes: 0 done, 1 refused or failed (the reason on stderr), 2 a usage error or a step that
 * is not there yet.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { compose } from "./compose.ts";
import { ConfigError, LANGUAGES, configFile, guessConfig, loadConfig } from "./config.ts";
import { doctor, formatReport } from "./doctor.ts";
import { narrate } from "./narrate.ts";
import { commandLine, renderJobs, runJobs } from "./render.ts";
import { loadScript, validateScript } from "./script.ts";
import { StudioError, projectDir, resolveVideo } from "./video.ts";
import { stringifyYaml } from "./yaml.ts";

const VIDEO_FLAGS = `  --project <dir>   the project (default: the current folder)
  --video <id>      the video, a folder in <project>/.jhon/studio/ (default: the only one)`;

const HELP: Record<string, string> = {
  "": `Usage: jhon-studio <command> [options]

Narrated presentation videos for any project, from its own palette, mark and screens.

Commands:
  init               write .jhon/studio.yaml with defaults guessed from the project
  video script       check or approve a video's script (script.json)
  video narrate      speak the script's lines with Kokoro (cached)
  video compose      write the HyperFrames composition and its subtitles
  video render       render the approved video to MP4, per language
  video brief        (not yet) draft a brief from the project
  video capture      (not yet) capture the project's screens
  doctor             check node, ffmpeg, Kokoro, HyperFrames and Chrome

Run \`jhon-studio <command> --help\` for a command's options.
`,
  init: `Usage: jhon-studio init [--project <dir>]

Writes <project>/.jhon/studio.yaml with the defaults guessed from the project: name and tagline
from its README's title and first sentence, url from its git remote, a neutral palette, the
name's initial as the mark, English and Spanish. Never overwrites an existing file.

  --project <dir>   the project (default: the current folder)
`,
  doctor: `Usage: jhon-studio doctor [--json]

Checks node (22 or newer), ffmpeg, Kokoro (its venv and model), the HyperFrames CLI (pinned,
in npx's cache) and chrome-headless-shell; prints the fix for each failure. Exits 1 if any fails.

  --json   one JSON object: { ok, checks: [{ id, ok, detail, fix }] }
`,
  video: `Usage: jhon-studio video <step> [options]

A video is a folder <project>/.jhon/studio/<id>/ with its script.json. Its steps, each run and
checked alone:
  script     check (--check) or approve (--approve) the script; render needs it approved
  narrate    speak each line with Kokoro into narration/ (only lines not spoken yet)
  compose    write index.html and captions.<lang>.json from the script and the narration
  render     render renders/<id>.mp4 and renders/<id>.<lang>.mp4 with HyperFrames
  brief      (not yet)
  capture    (not yet)

Run \`jhon-studio video <step> --help\` for a step's options.
`,
  "video script": `Usage: jhon-studio video script (--check | --approve) [--project <dir>] [--video <id>]

  --check     validate script.json: kinds, fields, marks in order, subtitles
  --approve   validate it, then set "approved": true (render refuses a script nobody approved)
${VIDEO_FLAGS}

Writing a script from a brief comes later; for now, write script.json by hand.
`,
  "video narrate": `Usage: jhon-studio video narrate [--project <dir>] [--video <id>]

Speaks each distinct line of the script with Kokoro (the project's voice) into the video's
narration/ cache as <key>.opus and <key>.json; a line already spoken is never spoken again.
${VIDEO_FLAGS}
`,
  "video compose": `Usage: jhon-studio video compose [--project <dir>] [--video <id>]

Writes the video's index.html (the HyperFrames composition) and captions.<lang>.json from its
script, its narration's seconds and the project's settings.
${VIDEO_FLAGS}
`,
  "video render": `Usage: jhon-studio video render [--project <dir>] [--video <id>] [--lang en,es] [--dry-run]

Renders the composed video with the HyperFrames CLI, once per language, into the video's
renders/. Refuses unless the script is approved (jhon-studio video script --approve).

  --lang <list>   the languages to render (default: the project's languages)
  --dry-run       print the commands instead of running them
${VIDEO_FLAGS}
`,
  "video brief": `Usage: jhon-studio video brief

Not yet: drafting a brief from a project's README, a change or a release's notes comes later.
`,
  "video capture": `Usage: jhon-studio video capture

Not yet: capturing a project's screens comes later; put PNG or SVG screens in the project's
screens folder (studio.yaml: screens) meanwhile.
`,
};

interface Args { cmd: string; flags: Record<string, string | true>; help: boolean }

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
  const cmd = words[0] === "video" && words.length > 1 ? `video ${words[1]}` : words.join(" ");
  if (words.length > (words[0] === "video" ? 2 : 1)) throw new UsageError(`unexpected argument "${words.at(-1)}"`, cmd.split(" ").slice(0, words[0] === "video" ? 2 : 1).join(" "));
  return { cmd, flags, help };
}

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
  "video script": ["project", "video", "check", "approve"],
  "video narrate": ["project", "video"],
  "video compose": ["project", "video"],
  "video render": ["project", "video", "lang", "dry-run"],
  "video brief": [],
  "video capture": [],
};

/** The project, its settings, the video and its script. */
function load(flags: Args["flags"]) {
  const project = projectDir(flags.project as string | undefined);
  const config = loadConfig(project);
  const video = resolveVideo(project, flags.video as string | undefined);
  const script = loadScript(video.script);
  return { project, config, video, script };
}

function checked(script: unknown, languages: string[], file: string) {
  const errs = validateScript(script, { languages });
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
  const { cmd, flags, help } = args;
  if (!(cmd in HELP)) {
    err.write(`${cmd ? `jhon-studio: unknown command "${cmd}"\n\n` : ""}${HELP[cmd.startsWith("video") ? "video" : ""]}`);
    return 2;
  }
  if (help) { out.write(HELP[cmd]!); return 0; }
  if (cmd === "" || cmd === "video") { err.write(HELP[cmd]!); return 2; }
  const unknown = Object.keys(flags).filter((f) => !ALLOWED[cmd]!.includes(f));
  if (unknown.length) { err.write(`jhon-studio: ${cmd}: unknown option --${unknown[0]}\n\n${HELP[cmd]}`); return 2; }

  try {
    switch (cmd) {
      case "init": {
        const project = projectDir(flags.project as string | undefined);
        const file = configFile(project);
        if (existsSync(file)) throw new StudioError(`${file} already exists; edit it, or remove it to start again`);
        const c = guessConfig(project);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, "# jhon-studio settings for this project; every key is optional (see jhon-studio's README).\n"
          + "# palette: #rrggbb colours, quoted. mark: glyph (one character) or path (an SVG or PNG logo).\n"
          + "# intro: flat (the default) or seal (a 3D seal; a glyph mark only). languages: en, es.\n"
          + stringifyYaml(c as unknown as Record<string, never>));
        out.write(`wrote ${file}\n`);
        return 0;
      }
      case "doctor": {
        const r = doctor(process.env);
        out.write(flags.json ? JSON.stringify(r, null, 2) + "\n" : formatReport(r));
        return r.ok ? 0 : 1;
      }
      case "video brief":
      case "video capture":
        err.write(`jhon-studio ${cmd}: not yet (it comes in a later version)\n`);
        return 2;
      case "video script": {
        if (!flags.check && !flags.approve) {
          err.write(`jhon-studio video script: not yet (writing a script from a brief comes in a later version); use --check or --approve\n`);
          return 2;
        }
        const { config, video, script } = load(flags);
        checked(script, config.languages, video.script);
        if (flags.approve) {
          const text = readFileSync(video.script, "utf8");
          const next = /"approved"\s*:\s*(true|false)/.test(text)
            ? text.replace(/"approved"\s*:\s*(true|false)/, '"approved": true')
            : text.replace(/^\s*\{/, '{\n  "approved": true,');
          if (JSON.parse(next).approved !== true) throw new StudioError(`${video.script}: could not set "approved": true`);
          writeFileSync(video.script, next);
          out.write(`approved ${video.script} (${script.shots.length} shots)\n`);
        } else out.write(`ok ${video.script} (${script.shots.length} shots)\n`);
        return 0;
      }
      case "video narrate": {
        const { config, video, script } = load(flags);
        checked(script, config.languages, video.script);
        out.write(JSON.stringify(narrate(video, script, config), null, 2) + "\n");
        return 0;
      }
      case "video compose": {
        const { config, video, script } = load(flags);
        const r = compose(video, script, config);
        out.write(`${r.total} s, ${r.shots} shots\n${r.list}\n`);
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
        const jobs = renderJobs(video, script, langs ?? config.languages);
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
