import { Compass } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Container, EmptyState } from "@/components/ui/misc";

export default function NotFound() {
  return (
    <Container className="py-20">
      <EmptyState icon={Compass} title="We couldn't find that page" action={<LinkButton href="/search">Search the network</LinkButton>}>
        It may have been removed, made private, or the link may be mistyped.
      </EmptyState>
    </Container>
  );
}
