import { ArrowUpRight, BookOpen } from 'lucide-react';

export function GuideLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description?: string;
}) {
  return (
    <a
      className="ui-guide-link"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      <BookOpen size={16} aria-hidden="true" />
      <span>
        <strong>{title}</strong>
        {description && <span>{description}</span>}
      </span>
      <ArrowUpRight size={15} aria-hidden="true" />
    </a>
  );
}
