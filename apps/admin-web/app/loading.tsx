import { PageSkeleton } from "@flowstate/ui";
export default function Loading() {
  return (
    <main className="hl-standalone-loading">
      <PageSkeleton label="Loading HitLink" />
    </main>
  );
}
