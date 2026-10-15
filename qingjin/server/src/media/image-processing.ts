import { BadRequestException } from '@nestjs/common';
import sharp from 'sharp';

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProcessOptions {
  crop?: CropBox;
  square: boolean;
}

export const MAX_EDGE = 1600;
const ACCEPTED = new Set(['jpeg', 'png', 'webp']);
// Rejects decompression bombs: a small file that decodes to an enormous bitmap.
const MAX_INPUT_PIXELS = 60_000_000;

/**
 * Normalises an uploaded photo into the format the showcase site uses:
 * EXIF-oriented, optionally cropped, at most MAX_EDGE px, optionally centred on a white square, WebP.
 * Crop coordinates are in pixels of the oriented image (what a browser displays).
 */
export async function processImage(input: Buffer, opts: ProcessOptions) {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()).format;
  } catch {
    throw new BadRequestException('无法识别的图片文件，或图片尺寸过大');
  }
  if (!format || !ACCEPTED.has(format)) throw new BadRequestException('只支持 JPG、PNG、WebP 图片');

  const oriented = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate().toBuffer({ resolveWithObject: true });
  let img = sharp(oriented.data);

  if (opts.crop) {
    const W = oriented.info.width;
    const H = oriented.info.height;
    // The cropper reports fractional pixels; round and clamp to the image instead of rejecting tiny overshoots.
    const left = Math.max(0, Math.min(W - 1, Math.round(opts.crop.x)));
    const top = Math.max(0, Math.min(H - 1, Math.round(opts.crop.y)));
    const width = Math.min(W - left, Math.round(opts.crop.width));
    const height = Math.min(H - top, Math.round(opts.crop.height));
    if (width < 16 || height < 16) throw new BadRequestException('裁剪区域太小');
    img = img.extract({ left, top, width, height });
  }

  img = img.resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
  if (opts.square) img = img.flatten({ background: '#ffffff' });
  const resized = await img.toBuffer({ resolveWithObject: true });

  let out = sharp(resized.data);
  if (opts.square) {
    const { width: w, height: h } = resized.info;
    const side = Math.max(w, h);
    const padX = side - w;
    const padY = side - h;
    out = out.extend({
      left: Math.floor(padX / 2),
      right: Math.ceil(padX / 2),
      top: Math.floor(padY / 2),
      bottom: Math.ceil(padY / 2),
      background: '#ffffff',
    });
  }

  const { data, info } = await out.webp({ quality: 86 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}
