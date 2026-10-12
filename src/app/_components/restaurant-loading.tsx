import { Container, Section, Skeleton, Spinner, Stack } from "@/components/ui";

/**
 * Soothing loading shell streamed while the tenant page resolves. A single
 * calm status announcement for assistive tech plus soft skeleton lines
 * suggesting the page shape — no layout-shift drama, no bare text.
 * Everything decorative is `aria-hidden`; the spinner owns `role="status"`.
 */
export function RestaurantLoading(): React.ReactElement {
  return (
    <Container>
      <Section aria-label="Loading restaurant">
        <Stack className="items-center text-center">
          <Spinner label="Loading restaurant" size="lg" />
          <Skeleton className="h-8 w-56 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
          <Skeleton className="h-4 w-64 max-w-full" />
          <div aria-hidden="true" className="flex w-full max-w-md flex-col gap-3 pt-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </Stack>
      </Section>
    </Container>
  );
}
