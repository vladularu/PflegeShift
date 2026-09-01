const previewRemote = Object.freeze({ bucket: "rule-catalog" });

const channels = Object.freeze([
  Object.freeze({
    channel: "PREVIEW",
    pathSegment: "preview",
    keyIdPrefix: "preview-",
    remote: previewRemote,
  }),
  Object.freeze({
    channel: "PRODUCTION",
    pathSegment: "production",
    keyIdPrefix: "production-",
    remote: null,
  }),
]);

export const RULE_CATALOG_DELIVERY_CHANNELS = channels;

export function ruleCatalogDeliveryChannel(channel) {
  return channels.find((candidate) => candidate.channel === channel) ?? null;
}

export function ruleCatalogDeliveryChannelFromPathSegment(pathSegment) {
  return channels.find((candidate) => candidate.pathSegment === pathSegment) ?? null;
}
