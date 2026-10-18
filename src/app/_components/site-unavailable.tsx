import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Container, Section, Stack } from "@/components/ui/container";
import { ErrorState } from "@/components/ui/feedback";

/**
 * Honest dependency-failure state for the public restaurant page (Phase
 * 6.2). Rendered — never thrown past — when the hostname lookup or the
 * published-content load fails: a database outage must read as
 * "unavailable, try again", never as the not-found page's "isn't
 * published yet".
 *
 * Deliberately identical for every hostname: whether the host names a
 * real tenant cannot be told while the lookup itself is broken, so all
 * hosts get the same answer (no oracle, no misleading publish state).
 */
export function SiteUnavailable(): React.ReactElement {
  return (
    <Container className="flex min-h-[70vh] max-w-xl flex-col justify-center">
      <Section>
        <Stack className="items-center text-center">
          <ErrorState
            title="This restaurant site is temporarily unavailable"
            message="Something went wrong on our side — this is not about the address you typed. Please try again shortly."
            action={
              <Link href="/" className={buttonClasses({ variant: "outline" })}>
                Try again
              </Link>
            }
          />
        </Stack>
      </Section>
    </Container>
  );
}
