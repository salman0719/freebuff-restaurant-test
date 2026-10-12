import { Container, Eyebrow, Heading, Section, Stack, Text } from "@/components/ui";
import { formatPrice } from "./format";
import { HoursList } from "./hours";
import type { ThemeProps } from "./types";

/**
 * Takeaway theme (foundation for Phase 2.4's full design). Bold,
 * left-aligned, order-first: menu leads, details follow in one pass.
 */
export function TakeawayTheme({ restaurant }: ThemeProps): React.ReactElement {
  return (
    <Container>
      <Section aria-label="Restaurant introduction">
        <Stack>
          <Eyebrow>Takeaway</Eyebrow>
          <Heading level={1}>{restaurant.name}</Heading>
          {restaurant.description ? <Text>{restaurant.description}</Text> : null}
          <ContactLine
            phone={restaurant.contact.phone}
            address={[restaurant.address.line1, restaurant.address.city].filter(Boolean).join(", ")}
          />
        </Stack>
      </Section>
      <Section aria-label="Menu">
        <Stack>
          <Heading level={2}>Menu</Heading>
          {restaurant.menu.length === 0 ? (
            <Text>Our menu is coming soon — please check back later.</Text>
          ) : (
            restaurant.menu.map((category) => (
              <section key={category.id} aria-label={category.name}>
                <Heading level={3}>{category.name}</Heading>
                <ul>
                  {category.items.map((item) => (
                    <li key={item.id}>
                      <Text>
                        {item.name} — {formatPrice(item.priceCents)}
                      </Text>
                      {item.description ? <Text>{item.description}</Text> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </Stack>
      </Section>
      <Section aria-label="Opening hours">
        <Stack>
          <Heading level={2}>Opening hours</Heading>
          <HoursList hours={restaurant.hours} />
        </Stack>
      </Section>
    </Container>
  );
}

function ContactLine({
  phone,
  address,
}: {
  phone: string | null;
  address: string;
}): React.ReactElement {
  if (!phone && !address) {
    return <Text>Contact details coming soon.</Text>;
  }
  return <Text>{[phone, address].filter(Boolean).join(" · ")}</Text>;
}
