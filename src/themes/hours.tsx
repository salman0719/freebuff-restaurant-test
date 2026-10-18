import { Text } from "@/components/ui";
import type { PublicOpeningHours } from "@/lib/restaurant";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday] ?? `Day ${weekday}`;
}

export function formatHours(hour: PublicOpeningHours): string {
  return hour.isClosed || !hour.openTime || !hour.closeTime
    ? "Closed"
    : `${hour.openTime}–${hour.closeTime}`;
}

/** Shared opening-hours list. Themes choose placement, not content. */
export function HoursList({
  hours,
  className,
}: {
  hours: PublicOpeningHours[];
  className?: string;
}): React.ReactElement {
  if (hours.length === 0) {
    return <Text>Opening hours coming soon.</Text>;
  }
  const ordered = [...hours].sort((a, b) => a.weekday - b.weekday);
  return (
    <ul>
      {ordered.map((hour) => (
        <li key={hour.weekday}>
          <Text className={className}>
            {weekdayName(hour.weekday)}: {formatHours(hour)}
          </Text>
        </li>
      ))}
    </ul>
  );
}
