import { FileIcon, FileImage, FileVideo } from 'lucide-react';
import type { Attachment, Detail } from '../../lib/types';
import { ImagePreview } from '../image-preview';

function metadata(item: Attachment) {
  const bytes = item.bytes;
  const size =
    typeof bytes === 'number' && Number.isFinite(bytes)
      ? bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
          ? `${(bytes / 1024).toFixed(1)} KB`
          : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : '';
  return [
    item.mediaType || item.name?.split('.').slice(1).at(-1)?.toUpperCase(),
    size,
    item.width && item.height ? `${item.width} × ${item.height}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

function FileGlyph({ item, image }: { item: Attachment; image: boolean }) {
  const video =
    item.mediaType?.startsWith('video/') ||
    /\.(mp4|mov|m4v|webm|mkv|avi|mpg|mpeg)$/i.test(item.name || '');
  const Glyph = video ? FileVideo : image ? FileImage : FileIcon;
  return (
    <Glyph
      className={
        'record-attachment-icon' +
        (video || image ? ' record-attachment-media-icon' : '')
      }
      aria-hidden="true"
    />
  );
}

function AttachmentImage({ name, src }: { name: string; src: string }) {
  return (
    <ImagePreview
      key={src}
      src={src}
      alt={name}
      fallback={
        <span className="metadata-note" role="status">
          图片附件无法读取：{name}
        </span>
      }
    />
  );
}

export function AttachmentList({
  detail,
  id,
  presentation = 'detail',
}: {
  detail: Detail;
  id: string;
  presentation?: 'detail' | 'chat';
}) {
  if (!detail.attachments?.length) return null;
  const toolOutput =
    ['tool', 'subtool'].includes(detail.event.kind) && detail.part === 'output';
  return (
    <ul
      className={
        'record-attachments' +
        (presentation === 'chat' ? ' chat-attachments' : '')
      }
      aria-label="附件"
    >
      {detail.attachments.map((item, index) => {
        const image =
          item.kind === 'image' ||
          (item.kind !== 'file' && item.mediaType?.startsWith('image/'));
        const previewImage = image && item.available !== false;
        const name = item.name || (image ? `图片 ${index + 1}` : '文件');
        const query = new URLSearchParams({
          id,
          ref: detail.event.ref,
          index: String(item.index),
          part: detail.part || 'input',
        });
        return (
          <li
            key={`${detail.event.ref}:${item.index}:${item.attachmentId}`}
            className={
              previewImage && (toolOutput || presentation === 'chat')
                ? 'record-image'
                : 'record-attachment-row'
            }
          >
            {previewImage ? (
              <AttachmentImage name={name} src={'/api/attachment?' + query} />
            ) : (
              <FileGlyph item={item} image={!!image} />
            )}
            <div className="record-attachment-info">
              <span className="record-attachment-name" data-tooltip={name}>
                {name}
              </span>
              <span className="record-attachment-metadata">
                {metadata(item)}
              </span>
              {item.unavailable_reason && (
                <span className="record-attachment-unavailable">
                  {item.unavailable_reason}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
