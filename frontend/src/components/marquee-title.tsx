import { useRef, useState, type CSSProperties, type ReactNode } from 'react';

export function MarqueeTitle({
  text,
  className,
  prefix,
}: {
  text: string;
  className: string;
  prefix?: ReactNode;
}) {
  const viewport = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [motion, setMotion] = useState<CSSProperties>();
  const start = () => {
    const distance =
      content.current!.scrollWidth - viewport.current!.clientWidth;
    // Measure only the hovered title; large session lists need no observers.
    setMotion(
      distance > 1
        ? ({
            '--marquee-distance': `${-distance}px`,
            '--marquee-duration': `${Math.max(3, distance / 32 + 1.8)}s`,
          } as CSSProperties)
        : undefined,
    );
  };
  return (
    <span
      ref={viewport}
      className={`${className} marquee-title`}
      data-tooltip={text}
      data-scrolling={!!motion}
      style={motion}
      onPointerEnter={start}
      onPointerLeave={() => setMotion(undefined)}
    >
      <span ref={content} className="marquee-content">
        {prefix}
        {text}
      </span>
    </span>
  );
}
