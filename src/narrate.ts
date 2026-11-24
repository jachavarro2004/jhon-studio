/**
 * src/narrate.ts — speak a video's narration with local Kokoro.
 *
 * Each distinct line of the script (src/script.ts lines(): its line in the narration's language,
 * spoken through `say`) is spoken on its own by voice/kokoro.py (Kokoro-82M through kokoro-onnx;
 * the project's voice, en-us or es phonemes, speed 1) with the venv under the Kokoro folder
 * (src/config.ts kokoroDir), then cached
 * in the video's narration/ as <key>.opus (mono Opus 32 kb/s, bit-exact flags) and <key>.json
 * (its text and seconds). The key hashes everything that shapes the sound, so a changed line is
 * spoken again and a cached line never twice (a line another video of the project already has
 * is copied from it); files no line uses any more are removed. compose reads the seconds.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { STUDIO, kokoroDir, type Config } from "./config.ts";
import { lines, type Script } from "./script.ts";
import { StudioError, studioDir, type Video } from "./video.ts";

/** The phonemes' language (espeak-ng's) for each narration language. */
const PHONEMES: Record<string, string> = { en: "en-us", es: "es" };

/** What shapes a line's sound besides its text: the model's weights, the voice, the phonemes' language, the speed. */
export const voiceOf = (voice: string, lang = "en") => ({ model: "kokoro-v1.0", voice, lang: PHONEMES[lang] ?? lang, speed: 1 });

/** The cache key of one spoken line in one voice and language. */
export const key = (text: string, voice: string, lang = "en") =>
  createHash("sha256").update(JSON.stringify({ ...voiceOf(voice, lang), gap: 0, cues: [text] })).digest("hex").slice(0, 16);

/** A video's narration cache. */
export const narrationDir = (dir: string) => join(dir, "narration");

const cached = (dir: string, k: string) => existsSync(join(dir, `${k}.opus`)) && existsSync(join(dir, `${k}.json`));

/** Speaks what is missing, prunes what is unused; returns each line's key and seconds by shot id. */
export function narrate(video: Video, script: Script, config: Config, env: NodeJS.ProcessEnv = process.env): Record<string, { key: string; seconds: number }> {
  const DIR = narrationDir(video.dir);
  mkdirSync(DIR, { recursive: true });
  const plan = lines(script, config.narration).map((l) => ({ ...l, key: key(l.text, config.voice, config.narration) }));
  // The project's other videos: a line one of them already says is copied, not spoken again.
  const root = studioDir(video.project);
  const shared = readdirSync(root).map((n) => narrationDir(join(root, n))).filter((d) => resolve(d) !== resolve(DIR) && existsSync(d));
  for (const p of plan) {
    const from = !cached(DIR, p.key) && shared.find((d) => cached(d, p.key));
    if (from) for (const ext of ["opus", "json"]) copyFileSync(join(from, `${p.key}.${ext}`), join(DIR, `${p.key}.${ext}`));
  }
  const missing = plan.filter((p) => !cached(DIR, p.key));
  if (missing.length) {
    const K = kokoroDir(env);
    const py = join(K, "venv", "bin", "python");
    const model = join(K, "model", "kokoro-v1.0.onnx"), voices = join(K, "model", "voices-v1.0.bin");
    for (const f of [py, model, voices]) if (!existsSync(f)) throw new StudioError(`Kokoro is not set up: ${f} is missing (run \`jhon-studio doctor\` for the fix)`);
    const scratch = mkdtempSync(join(tmpdir(), "jhon-studio-narrate-"));
    try {
      const v = voiceOf(config.voice, config.narration);
      const items = missing.map((p) => ({ voice: v.voice, lang: v.lang, speed: v.speed, gap: 0, cues: [p.text], wav: join(scratch, `${p.key}.wav`) }));
      const job = join(scratch, "job.json");
      writeFileSync(job, JSON.stringify({ model, voices, items }));
      const out = execFileSync(py, ["-I", join(STUDIO, "voice", "kokoro.py"), job], { encoding: "utf8", maxBuffer: 1 << 24 });
      const made = JSON.parse(out.trim().split("\n").pop()!);
      missing.forEach((p, i) => {
        execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-threads", "1", "-i", items[i]!.wav, "-c:a", "libopus", "-b:a", "32k", "-ac", "1",
          "-fflags", "+bitexact", "-flags:a", "+bitexact", "-map_metadata", "-1", join(DIR, `${p.key}.opus`)]);
        writeFileSync(join(DIR, `${p.key}.json`), JSON.stringify({ text: p.text, seconds: Math.round(made[i].seconds * 1000) / 1000 }) + "\n");
      });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  const keep = new Set(plan.flatMap((p) => [`${p.key}.opus`, `${p.key}.json`]));
  for (const f of readdirSync(DIR)) if (!keep.has(f)) rmSync(join(DIR, f));
  return Object.fromEntries(plan.map((p) => [p.id, { key: p.key, seconds: JSON.parse(readFileSync(join(DIR, `${p.key}.json`), "utf8")).seconds }]));
}
