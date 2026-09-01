export interface ProductionRuleCatalogTrustedPublicKey {
  readonly keyId: string;
  readonly publicKey: readonly number[];
}

const trustedPublicKeys = Object.freeze<readonly ProductionRuleCatalogTrustedPublicKey[]>([
  Object.freeze({
    keyId: "production-2026-r1",
    publicKey: Object.freeze([
      252, 52, 185, 146, 151, 39, 236, 107, 191, 75, 232, 174, 195, 38, 41, 86, 68, 225, 76, 94,
      115, 255, 228, 149, 243, 240, 38, 110, 80, 136, 225, 161,
    ]),
  }),
]);

export const PRODUCTION_RULE_CATALOG_TRUST = Object.freeze({
  channel: "PRODUCTION" as const,
  trustedPublicKeys,
});
