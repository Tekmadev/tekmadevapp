import {
  File,
  FileArchive,
  FileImage,
  FileMusic,
  FilePlay,
  FileSpreadsheet,
  FileText,
  Presentation,
  type LucideIcon,
} from 'lucide-react-native';

import type { Asset } from '@/api/schemas/clients';

/** What a file is, for its tile icon and for how it opens. */
export type FileFamily = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'sheet' | 'slides' | 'archive' | 'other';

const ARCHIVE = /(zip|x-7z|rar|x-tar|gzip|x-bzip|compressed)/;
const SHEET = /(spreadsheet|excel|csv|numbers)/;
const SLIDES = /(presentation|powerpoint|keynote)/;
const TEXT = /(msword|wordprocessing|opendocument\.text|rtf|^text\/|pages)/;

const EXT_FAMILY: Record<string, FileFamily> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  heic: 'image',
  avif: 'image',
  svg: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  pdf: 'pdf',
  doc: 'text',
  docx: 'text',
  txt: 'text',
  rtf: 'text',
  xls: 'sheet',
  xlsx: 'sheet',
  csv: 'sheet',
  ppt: 'slides',
  pptx: 'slides',
  key: 'slides',
  zip: 'archive',
  rar: 'archive',
  '7z': 'archive',
};

/** "PDF" from "price-list.pdf"; "" when the name has no extension. */
export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return '';
  const ext = fileName.slice(dot + 1);
  return ext.length <= 5 ? ext.toUpperCase() : '';
}

/** The mime type decides; the extension only helps when the mime is generic. */
export function fileFamily(mime: string, fileName: string): FileFamily {
  const m = mime.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  if (ARCHIVE.test(m)) return 'archive';
  if (SHEET.test(m)) return 'sheet';
  if (SLIDES.test(m)) return 'slides';
  if (TEXT.test(m)) return 'text';
  return EXT_FAMILY[extensionOf(fileName).toLowerCase()] ?? 'other';
}

const FAMILY_ICON: Record<FileFamily, LucideIcon> = {
  image: FileImage,
  video: FilePlay,
  audio: FileMusic,
  pdf: FileText,
  text: FileText,
  sheet: FileSpreadsheet,
  slides: Presentation,
  archive: FileArchive,
  other: File,
};

export function fileIcon(family: FileFamily): LucideIcon {
  return FAMILY_ICON[family];
}

/** Images open in the in-app viewer; everything else opens in a Custom Tab. */
export function opensInViewer(asset: Pick<Asset, 'mime' | 'fileName'>): boolean {
  return fileFamily(asset.mime, asset.fileName) === 'image';
}
