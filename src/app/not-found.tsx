/**
 * Root not-found page. `notFound()` is reached by unknown hosts on the
 * public site, unpublished or missing tenants, and non-members hitting a
 * dashboard they cannot access, so the copy stays deliberately generic.
 */
import Link from "next/link";
import { Compass } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { Container, Section, Stack } from "@/components/ui/container";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";

export default function NotFound(): React.ReactElement {
  return (
    <Container className="flex min-h-[70vh] max-w-xl flex-col justify-center">
      <Section>
        <Stack className="animate-rise items-center text-center">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300"
          >
            <Compass className="size-7" />
          </span>
          <Eyebrow>Page not found</Eyebrow>
          <Heading level={1}>We couldn&apos;t find that page</Heading>
          <Text muted>
            The address may be mistyped, or this restaurant&apos;s site isn&apos;t published yet.
          </Text>
          <div className="mt-2 flex flex-wrap justify-center gap-3">
            <Link href="/dashboard" className={buttonClasses()}>
              Go to dashboard
            </Link>
            <Link href="/login" className={buttonClasses({ variant: "outline" })}>
              Sign in
            </Link>
          </div>
        </Stack>
      </Section>
    </Container>
  );
}
