import { Container } from "@/components/ui/misc";

export default function Loading() {
  return (
    <Container className="py-14" >
      <div role="status" aria-label="Loading" className="space-y-6">
        <div className="skeleton h-12 w-2/3" />
        <div className="skeleton h-5 w-1/2" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-48" />
          ))}
        </div>
      </div>
    </Container>
  );
}
