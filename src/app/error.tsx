"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Container, EmptyState } from "@/components/ui/misc";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="py-20">
      <EmptyState icon={AlertTriangle} title="This page didn't load" action={<Button onClick={reset}>Try again</Button>}>
        Something went wrong on our side. If it keeps happening, contact us and mention reference {error.digest ?? "unknown"}.
      </EmptyState>
    </Container>
  );
}
