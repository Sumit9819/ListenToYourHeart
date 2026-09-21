"use client";

import { Music2 } from "lucide-react";
import { useState } from "react";

interface ArtworkProps {
  src?: string;
  alt?: string;
  /** Tailwind size classes, e.g. "h-12 w-12". */
  className?: string;
  rounded?: string;
  priority?: boolean;
}

/**
 * Cover art with a graceful fallback.
 *
 * A plain `<img>` rather than `next/image`: thumbnails come from whichever
 * public provider instance answered, so the host set is not knowable at build
 * time and `remotePatterns` cannot cover it. Optimising them would also proxy
 * every thumbnail through the deployment, which is exactly the bandwidth this
 * app avoids.
 */
export function Artwork({ src, alt = "", className = "h-12 w-12", rounded = "rounded-lg", priority }: ArtworkProps) {
  // Remembering *which* URL failed, rather than a boolean, means a reused
  // component showing a new track recovers without an effect to reset it.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) {
    return (
      <div className={`art-fallback grid shrink-0 place-items-center ${className} ${rounded}`} aria-hidden="true">
        <Music2 className="h-1/3 w-1/3 text-ink-faint" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailedSrc(src)}
      className={`shrink-0 bg-surface-raised object-cover ${className} ${rounded}`}
    />
  );
}
