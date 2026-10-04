import type { Detail } from '../lib/types';
import { Markdown } from './markdown';

// Image locations are authorized by the same bounded record/page as the body.
export function RecordMarkdown({
  text,
  detail,
  id,
}: {
  text: string;
  detail: Detail | null;
  id: string;
}) {
  const images = detail?.inline_images?.map(({ href, page }) => ({
    href,
    src:
      '/api/message-image?' +
      new URLSearchParams({
        id,
        ref: detail.event.ref,
        page: String(page),
        part: detail.part === 'output' ? 'output' : 'input',
        href,
      }),
  }));
  return <Markdown text={text} images={images} />;
}
