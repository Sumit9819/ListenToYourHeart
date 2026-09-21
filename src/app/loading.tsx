import { TrackRowSkeleton } from "@/components/ui/States";

export default function Loading() {
  return (
    <div className="space-y-8">
      <div className="skeleton h-9 w-56 rounded-lg" aria-hidden="true" />
      <TrackRowSkeleton count={8} />
    </div>
  );
}
