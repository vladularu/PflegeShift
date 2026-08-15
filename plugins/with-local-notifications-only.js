const { withEntitlementsPlist } = require("expo/config-plugins");

/**
 * PflegeShift currently schedules reminders locally on the device and does not
 * receive remote notifications through APNs. expo-notifications is auto-
 * configured by Expo and otherwise adds the APNs entitlement, which would make
 * the preview build depend on push-enabled Apple credentials unnecessarily.
 */
module.exports = function withLocalNotificationsOnly(config) {
  return withEntitlementsPlist(config, (configWithEntitlements) => {
    delete configWithEntitlements.modResults["aps-environment"];
    return configWithEntitlements;
  });
};
