import { spawn } from 'node:child_process';
import { setPriority } from 'node:os';

export interface ProbeInfo {
  /** Display size, i.e. after applying the phone's rotation flag. */
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
}

export interface Rendition {
  name: 'hd' | 'sd';
  shortEdge: number;
  crf: number;
  maxrate: string;
  bufsize: string;
  audio: string;
}

/** HD for desktop / Wi-Fi, SD for phones on mobile data. Capped bitrates keep progressive playback smooth. */
export const RENDITIONS: Rendition[] = [
  { name: 'hd', shortEdge: 1080, crf: 22, maxrate: '5M', bufsize: '10M', audio: '128k' },
  { name: 'sd', shortEdge: 720, crf: 24, maxrate: '2500k', bufsize: '5M', audio: '96k' },
];

const TIMEOUT_MS = 60 * 60_000;

export function run(cmd: string, args: string[], timeoutMs = TIMEOUT_MS): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.on('spawn', () => {
      // Transcoding must not starve the API and nginx on a small server.
      try {
        if (child.pid) setPriority(child.pid, 10);
      } catch {
        // Lowering priority is best effort.
      }
    });
    child.stdout.on('data', (b: Buffer) => {
      if (stdout.length < 2_000_000) stdout += b.toString();
    });
    child.stderr.on('data', (b: Buffer) => {
      stderr = (stderr + b.toString()).slice(-4000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(err.code === 'ENOENT' ? new Error(`找不到 ${cmd}，请在服务器上安装 ffmpeg`) : err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} 失败（${signal ?? `退出码 ${code}`}）：${stderr.trim().slice(-800)}`));
    });
  });
}

interface ProbeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  duration?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
}

export async function probe(ffprobe: string, file: string): Promise<ProbeInfo> {
  const out = await run(ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], 120_000);
  const data = JSON.parse(out) as { streams?: ProbeStream[]; format?: { duration?: string } };
  const streams = data.streams ?? [];
  const v = streams.find((s) => s.codec_type === 'video');
  if (!v?.width || !v.height) throw new Error('文件中没有可识别的视频画面');
  const rotation = Number(v.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? v.tags?.rotate ?? 0);
  const sideways = Math.abs(Math.round(rotation / 90)) % 2 === 1;
  return {
    width: sideways ? v.height : v.width,
    height: sideways ? v.width : v.height,
    duration: Number(data.format?.duration ?? v.duration ?? 0) || 0,
    hasAudio: streams.some((s) => s.codec_type === 'audio'),
  };
}

/** Scales so the short edge is at most `shortEdge` (never upscales); H.264 needs even dimensions. */
export function fitShortEdge(width: number, height: number, shortEdge: number) {
  const f = Math.min(1, shortEdge / Math.min(width, height));
  const even = (n: number) => Math.max(2, Math.round((n * f) / 2) * 2);
  return { width: even(width), height: even(height) };
}

export function encodeArgs(src: string, out: string, r: Rendition, size: { width: number; height: number }, hasAudio: boolean, threads: number) {
  return [
    '-hide_banner', '-nostdin', '-y',
    '-i', src,
    '-map', '0:v:0',
    ...(hasAudio ? ['-map', '0:a:0'] : []),
    '-map_metadata', '-1',
    '-vf', `scale=${size.width}:${size.height}:flags=lanczos,format=yuv420p`,
    '-fpsmax', '30',
    '-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high',
    '-crf', String(r.crf), '-maxrate', r.maxrate, '-bufsize', r.bufsize, '-g', '60',
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', r.audio, '-ac', '2'] : ['-an']),
    // Moves the index to the start so playback begins after the first few hundred KB.
    '-movflags', '+faststart',
    '-threads', String(threads),
    out,
  ];
}

export function posterArgs(src: string, out: string, atSeconds: number) {
  return ['-hide_banner', '-nostdin', '-y', '-ss', atSeconds.toFixed(2), '-i', src, '-frames:v', '1', '-q:v', '3', out];
}
