import type { ImgHTMLAttributes } from "react";

type FixtureImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | { src: string };
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number;
};

export default function FixtureImage({
  src,
  alt = "",
  fill,
  priority,
  unoptimized,
  quality,
  style,
  ...props
}: FixtureImageProps) {
  void priority;
  void unoptimized;
  void quality;
  // The product layout stays real; this fixture bypasses Next's optimizer only.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={alt} src={typeof src === "string" ? src : src.src} style={{
    ...(fill ? { position: "absolute", width: "100%", height: "100%", inset: 0 } as const : {}),
    ...style,
  }} />;
}
