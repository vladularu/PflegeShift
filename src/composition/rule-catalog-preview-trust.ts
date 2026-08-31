export interface PreviewRuleCatalogTrustedPublicKey {
  readonly keyId: string;
  readonly publicKey: readonly number[];
}

const trustedPublicKeys = Object.freeze<readonly PreviewRuleCatalogTrustedPublicKey[]>([
  Object.freeze({
    keyId: "preview-2026",
    publicKey: Object.freeze([
      23, 51, 245, 81, 88, 150, 83, 204, 65, 85, 65, 47, 145, 96, 44, 208, 182, 0, 112, 233, 156,
      127, 221, 227, 56, 215, 81, 71, 154, 146, 246, 59,
    ]),
  }),
  Object.freeze({
    keyId: "preview-2026-r2",
    publicKey: Object.freeze([
      193, 247, 8, 29, 120, 239, 53, 58, 10, 15, 59, 154, 26, 48, 218, 192, 203, 148, 12, 50, 39,
      145, 254, 254, 42, 217, 3, 200, 244, 244, 240, 17,
    ]),
  }),
  Object.freeze({
    keyId: "preview-2026-r3",
    publicKey: Object.freeze([
      192, 246, 25, 13, 196, 21, 140, 223, 56, 179, 155, 40, 135, 2, 163, 245, 53, 84, 97, 69, 203,
      237, 144, 212, 14, 174, 87, 39, 209, 101, 224, 193,
    ]),
  }),
]);

export const PREVIEW_RULE_CATALOG_TRUST = Object.freeze({
  channel: "PREVIEW" as const,
  baseUrl: "https://okcxmmekwyuuiqthmydo.supabase.co/storage/v1/object/public/rule-catalog/preview",
  trustedPublicKeys,
});
