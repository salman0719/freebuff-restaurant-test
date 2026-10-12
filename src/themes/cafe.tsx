import { Container, Eyebrow, Heading, Section, Stack, Text } from "@/components/ui";
import { formatPrice } from "./format";
import { HoursList } from "./hours";
import type { ThemeProps } from "./types";

/**
 * Café theme (foundation for Phase 2.3's full design). Warm, centred,
 * editorial: story first, then menu, then visit details.
 */
export function CafeTheme({ restaurant }: ThemeProps): React.ReactElement {
  return (
    <Container>
      <Section aria-label="Restaurant introduction">
        <Stack className="items-center text-center">
          <Eyebrow>{restaurant.theme === "cafe" ? "Café & Restaurant" : restaurant.slug}</Eyebrow>
          <Heading level={1}>{restaurant.name}</Heading>
          {restaurant.description ? <Text>{restaurant.description}</Text> : null}
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
                {category.description ? <Text>{category.description}</Text> : null}
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
      <Section aria-label="Visit us">
        <Stack>
          <Heading level={2}>Visit us</Heading>
          <HoursList hours={restaurant.hours} />
          <ContactBlock
            phone={restaurant.contact.phone}
            email={restaurant.contact.email}
            address={[restaurant.address.line1, restaurant.address.city, restaurant.address.country]
              .filter(Boolean)
              .join(", ")}
          />
        </Stack>
      </Section>
    </Container>
  );
}

function ContactBlock({
  phone,
  email,
  address,
}: {
  phone: string | null;
  email: string | null;
  address: string;
}): React.ReactElement {
  if (!phone && !email && !address) {
    return <Text>Contact details coming soon.</Text>;
  }
  return (
    <address>
      {phone ? <Text>{phone}</Text> : null}
      {email ? <Text>{email}</Text> : null}
      {address ? <Text>{address}</Text> : null}
    </address>
  );
}
