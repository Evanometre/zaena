// lib/locationTimezone.ts
export function resolveTimezone(
  locationTimezone?: string | null,
  orgTimezone?: string | null
): string {
  return locationTimezone ?? orgTimezone ?? 'Africa/Lagos';
}