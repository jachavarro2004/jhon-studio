/**
 * src/video.ts — a project's videos: each is a folder .jhon/studio/<id>/ holding its brief.md
 * and script.json (either makes it a video), its screens, its narration cache and what compose
 * and render write.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** A failure the CLI reports as `jhon-studio: <message>` with its exit code (1: refused or failed, 2: usage). */
export class StudioError extends Error {
  code: number;
  constructor(message: string, code = 1) {
    super(message);
    this.code = code;
  }
}

export interface Video { project: string; id: string; dir: string; script: string }

/** The folder that holds a project's videos. */
export const studioDir = (project: string) => join(project, ".jhon", "studio");

/** A project folder that exists, absolute. */
export function projectDir(dir: string | undefined): string {
  const p = resolve(dir ?? process.cwd());
  if (!existsSync(p) || !statSync(p).isDirectory()) throw new StudioError(`no such project folder: ${p}`);
  return p;
}

const isVideo = (dir: string) => existsSync(join(dir, "script.json")) || existsSync(join(dir, "brief.md"));

/** The project's videos: the folders in .jhon/studio/ with a script.json or a brief.md. */
export function videoIds(project: string): string[] {
  const root = studioDir(project);
  return existsSync(root) ? readdirSync(root).filter((n) => isVideo(join(root, n))).sort() : [];
}

/** The video named, or the project's only one. */
export function resolveVideo(project: string, id?: string): Video {
  const root = studioDir(project);
  if (id !== undefined) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) throw new StudioError(`--video: "${id}" is not a folder name`, 2);
    const dir = join(root, id);
    if (!isVideo(dir)) throw new StudioError(`no video "${id}": ${join(dir, "script.json")} does not exist`);
    return { project, id, dir, script: join(dir, "script.json") };
  }
  const ids = videoIds(project);
  if (ids.length === 0) throw new StudioError(`no video in ${root}: a video is a folder there with its script.json (jhon-studio video brief readme starts one)`);
  if (ids.length > 1) throw new StudioError(`several videos (${ids.join(", ")}): name one with --video`, 2);
  return resolveVideo(project, ids[0]);
}

/** Writes a file only when its bytes change (so what depends on it stays up to date); true when it wrote. */
export function writeIfChanged(file: string, data: string | Buffer): boolean {
  const b = typeof data === "string" ? Buffer.from(data) : data;
  if (existsSync(file) && readFileSync(file).equals(b)) return false;
  writeFileSync(file, b);
  return true;
}
