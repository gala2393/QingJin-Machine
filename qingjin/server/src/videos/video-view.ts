import { mediaUrl } from '../common/media-url';
import type { Video } from '../generated/prisma/client';

export const videoView = (v: Video) => ({
  id: v.id,
  originalName: v.originalName,
  status: v.status,
  error: v.error,
  sourceSize: v.sourceSize,
  chunkSize: v.chunkSize,
  width: v.width,
  height: v.height,
  duration: v.duration,
  hdUrl: v.hdPath ? mediaUrl(v.hdPath) : null,
  sdUrl: v.sdPath ? mediaUrl(v.sdPath) : null,
  posterUrl: v.posterPath ? mediaUrl(v.posterPath) : null,
  hdSize: v.hdSize,
  sdSize: v.sdSize,
  createdAt: v.createdAt,
});

export type VideoView = ReturnType<typeof videoView>;
