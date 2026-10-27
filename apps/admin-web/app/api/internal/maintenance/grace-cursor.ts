/** Internal worker continuation only. Existing workers forward nextCursor opaquely. */
export type ReminderPosition = { afterId: string; highWaterId: string; settingsVersion: number };
export type MaintenancePosition = { afterWorkspaceId?: string; grace?: { workspaceId: string; afterBookingId: string; throughBookingId: string }; reminders?: { workspaceId: string; cursor?: ReminderPosition } };
const id = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9:_-]{1,150}$/.test(value);
export function encodeGraceMaintenanceCursor(workspaceId: string, afterBookingId: string, throughBookingId: string) {
  if (!id(workspaceId) || !id(afterBookingId) || !id(throughBookingId)) throw Error("Invalid grace cursor identity.");
  return `mg1.${Buffer.from(JSON.stringify([workspaceId, afterBookingId, throughBookingId])).toString("base64url")}`;
}
export function parseMaintenanceCursor(value: string | null): MaintenancePosition | null {
  if (!value) return {};
  if (value.length > 700) return null;
  if (value.startsWith("mr1.")) return parseReminderCursor(value);
  if (!value.startsWith("mg1.")) return /^[A-Za-z0-9_-]{1,150}$/.test(value) ? { afterWorkspaceId: value } : null;
  const encoded = value.slice(4);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded) return null;
    const data: unknown = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(data) || data.length !== 3 || !id(data[0]) || !id(data[1]) || !id(data[2])) return null;
    return { grace: { workspaceId: data[0], afterBookingId: data[1], throughBookingId: data[2] } };
  } catch { return null; }
}

export function encodeReminderMaintenanceCursor(workspaceId: string, cursor?: ReminderPosition) {
  if (!id(workspaceId) || (cursor && (!id(cursor.afterId) || !id(cursor.highWaterId) || cursor.afterId === cursor.highWaterId || !Number.isSafeInteger(cursor.settingsVersion) || cursor.settingsVersion < 1))) throw Error("Invalid reminder cursor identity.");
  return `mr1.${Buffer.from(JSON.stringify([workspaceId, cursor?.afterId ?? null, cursor?.highWaterId ?? null, cursor?.settingsVersion ?? null])).toString("base64url")}`;
}
function parseReminderCursor(value: string): MaintenancePosition | null {
  const encoded = value.slice(4);
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return null;
  try {
    const bytes = Buffer.from(encoded, "base64url");
    if (bytes.toString("base64url") !== encoded) return null;
    const data: unknown = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(data) || data.length !== 4 || !id(data[0])) return null;
    if (data[1] === null && data[2] === null && data[3] === null) return { reminders: { workspaceId: data[0] } };
    if (!id(data[1]) || !id(data[2]) || data[1] === data[2] || !Number.isSafeInteger(data[3]) || data[3] < 1) return null;
    return { reminders: { workspaceId: data[0], cursor: { afterId: data[1], highWaterId: data[2], settingsVersion: data[3] } } };
  } catch { return null; }
}
