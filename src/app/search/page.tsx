import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchResults } from "@/app/search/SearchResults";
import { TrackRowSkeleton } from "@/components/ui/States";

export const metadata: Metadata = {
  title: "Search",
  description: "Search millions of songs and play them instantly.",
};

export default function SearchPage() {
  // SearchResults reads useSearchParams, so it needs a Suspense boundary.
  return (
    <Suspense fallback={<TrackRowSkeleton count={8} />}>
      <SearchResults />
    </Suspense>
  );
}
