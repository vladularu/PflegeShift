import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { NotificationPermissionState } from "@/infrastructure/notifications/notification-permissions";

function permissionState(
  permission: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  if (Platform.OS === "ios" && permission.ios) {
    switch (permission.ios.status) {
      case Notifications.IosAuthorizationStatus.AUTHORIZED:
      case Notifications.IosAuthorizationStatus.PROVISIONAL:
      case Notifications.IosAuthorizationStatus.EPHEMERAL:
        return "AUTHORIZED";
      case Notifications.IosAuthorizationStatus.DENIED:
        return "DENIED";
      case Notifications.IosAuthorizationStatus.NOT_DETERMINED:
        return "NOT_DETERMINED";
    }
  }

  if (permission.granted) return "AUTHORIZED";
  return permission.canAskAgain === false ? "DENIED" : "NOT_DETERMINED";
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  return permissionState(await Notifications.getPermissionsAsync());
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  return permissionState(await Notifications.requestPermissionsAsync());
}
