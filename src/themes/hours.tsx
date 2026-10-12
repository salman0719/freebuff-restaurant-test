import { Text } from "@/components/ui";
import type { PublicOpeningHours } from "@/lib/restaurant";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Shared opening-hours list. Themes choose placement, not content. */
export function HoursList({ hours }: { hours: PublicOpeningHours[] }): React.ReactElement {
  if (hours.length === 0) {
    return <Text>Opening hours coming soon.</Text>;
  }
  const ordered = [...hours].sort((a, b) => a.weekday - b.weekday);
  return (
    <ul>
      {ordered.map((hour) => (
        <li key={hour.weekday}>
          <Text>
            {WEEKDAYS[hour.weekday] ?? `Day ${hour.weekday}`}:{" "}
            {hour.isClosed || !hour.openTime || !hour.closeTime
              ? "Closed"
              : `${hour.openTime}–${hour.closeTime}`}
          </Text>
        </li>
      ))}
    </ul>
  );
}
