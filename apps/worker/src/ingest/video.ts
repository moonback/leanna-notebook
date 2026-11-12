import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { PermanentError } from "../worker.ts";

const execFile = promisify(execFileCallback);
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
const TIKTOK_HOSTS = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);

export function isTikTokUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && TIKTOK_HOSTS.has(url.hostname.toLowerCase()) && !url.username && !url.password && !url.port;
  } catch { return false; }
}

async function run(binary: string, args: string[], timeout: number): Promise<void> {
  try { await execFile(binary, args, { timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true }); }
  catch (error) {
    const e = error as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === "ENOENT") throw new PermanentError("video_tools_not_configured", `Binaire introuvable : ${binary}`);
    throw new PermanentError("video_processing_failed", (e.stderr ?? e.message ?? "erreur outil vidéo").slice(0, 240));
  }
}

async function downloadTikTok(url: string, directory: string): Promise<string> {
  if (!isTikTokUrl(url)) throw new PermanentError("url_refused", "Seules les URL TikTok HTTPS sont acceptées.");
  await run(process.env.YTDLP_PATH || "yt-dlp", [
    "--no-playlist", "--no-warnings", "--no-progress", "--max-filesize", String(MAX_VIDEO_BYTES),
    "--format", "best[ext=mp4]/best", "--output", join(directory, "tiktok.%(ext)s"), url,
  ], 5 * 60 * 1000);
  const files = await readdir(directory);
  const video = files.find((name) => name.startsWith("tiktok.") && !name.endsWith(".mp3"));
  if (!video) throw new PermanentError("video_download_failed", "TikTok n'a fourni aucun fichier vidéo téléchargeable.");
  const path = join(directory, video);
  if ((await stat(path)).size > MAX_VIDEO_BYTES) throw new PermanentError("file_too_large");
  return path;
}

/** Convert an uploaded video or TikTok download to a small mono MP3 for Groq. */
export async function extractVideoAudio(input: { file?: Uint8Array; url?: string }): Promise<Uint8Array> {
  const directory = await mkdtemp(join(tmpdir(), "notebook-video-"));
  try {
    let videoPath: string;
    if (input.file) {
      if (input.file.byteLength > MAX_VIDEO_BYTES) throw new PermanentError("file_too_large");
      const ext = input.url ? extname(new URL(input.url).pathname) : ".mp4";
      videoPath = join(directory, `upload${/^\.[a-z0-9]{1,8}$/i.test(ext) ? ext : ".mp4"}`);
      await writeFile(videoPath, input.file);
    } else if (input.url) videoPath = await downloadTikTok(input.url, directory);
    else throw new PermanentError("file_missing");

    const audioPath = join(directory, "audio.mp3");
    await run(process.env.FFMPEG_PATH || "ffmpeg", [
      "-nostdin", "-y", "-i", videoPath, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", "-f", "mp3", audioPath,
    ], 10 * 60 * 1000);
    const audioStat = await stat(audioPath);
    if (!audioStat.size) throw new PermanentError("no_audio_track", "Aucune piste audio exploitable dans cette vidéo.");
    if (audioStat.size > MAX_AUDIO_BYTES) throw new PermanentError("transcription_file_too_large", "La piste audio dépasse la limite Groq de 25 Mo.");
    return new Uint8Array(await readFile(audioPath));
  } finally { await rm(directory, { recursive: true, force: true }).catch(() => undefined); }
}
