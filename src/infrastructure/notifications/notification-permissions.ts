export type NotificationPermissionState = "AUTHORIZED" | "DENIED" | "NOT_DETERMINED" | "UNKNOWN";

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  return "AUTHORIZED";
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  return "AUTHORIZED";
}
