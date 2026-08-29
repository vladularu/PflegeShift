import * as ed25519 from "@noble/ed25519";
import { CryptoDigestAlgorithm, digest } from "expo-crypto";

import type { RuleManifest } from "@/rules/contracts.generated";
import {
  RuleCatalogVerificationError,
  verifyRuleCatalogArtifacts,
  verifyRuleManifest,
  type RuleCatalogCryptography,
  type RuleCatalogVerificationPolicy,
  type UntrustedRuleCatalogArtifacts,
  type VerifiedRuleCatalogArtifacts,
} from "@/rules/rule-catalog-verification";

async function digestBytes(
  algorithm: CryptoDigestAlgorithm,
  bytes: Uint8Array,
): Promise<Uint8Array> {
  try {
    return new Uint8Array(await digest(algorithm, Uint8Array.from(bytes)));
  } catch {
    throw new RuleCatalogVerificationError(
      "CRYPTO_UNAVAILABLE",
      "The platform cryptography provider could not verify the rule catalog.",
    );
  }
}

const expoRuleCatalogCryptography: RuleCatalogCryptography = {
  sha256: (bytes) => digestBytes(CryptoDigestAlgorithm.SHA256, bytes),
  verifyEd25519: async (signature, message, publicKey) => {
    ed25519.hashes.sha512Async = (bytes) => digestBytes(CryptoDigestAlgorithm.SHA512, bytes);
    return ed25519.verifyAsync(signature, message, publicKey, { zip215: false });
  },
};

export function verifyRuleManifestOnDevice(
  manifestJson: string,
  policy: RuleCatalogVerificationPolicy,
): Promise<RuleManifest> {
  return verifyRuleManifest(manifestJson, policy, expoRuleCatalogCryptography);
}

export function verifyRuleCatalogArtifactsOnDevice(
  artifacts: UntrustedRuleCatalogArtifacts,
  policy: RuleCatalogVerificationPolicy,
): Promise<VerifiedRuleCatalogArtifacts> {
  return verifyRuleCatalogArtifacts(artifacts, policy, expoRuleCatalogCryptography);
}
