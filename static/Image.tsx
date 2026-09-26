interface StaticImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  unoptimized?: boolean;
  className?: string;
}

export default function StaticImage({ src, alt, width, height, priority, className }: StaticImageProps) {
  const relativeSource = src.startsWith("/") && !src.startsWith("//") ? `.${src}` : src;
  // eslint-disable-next-line @next/next/no-img-element -- Static hosts do not run the Next.js image optimizer.
  return <img src={relativeSource} alt={alt} width={width} height={height} className={className}
    loading={priority ? "eager" : "lazy"} decoding="async" fetchPriority={priority ? "high" : "auto"} />;
}
