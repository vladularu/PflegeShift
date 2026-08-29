import type { RuleManifest } from "@/rules/contracts.generated";
import type {
  UntrustedRuleCatalogArtifacts,
  VerifiedRuleCatalogArtifacts,
} from "@/rules/rule-catalog-verification";

export type RuleCatalogSyncActivationResult =
  | {
      readonly status: "ACTIVATED";
      readonly generation: number;
      readonly previousGeneration: number | null;
    }
  | { readonly status: "ALREADY_ACTIVE"; readonly generation: number };

export interface RuleCatalogRemotePort {
  readonly fetchCurrentManifest: () => Promise<string>;
  readonly fetchVersionedManifest: (generation: number) => Promise<string>;
  readonly fetchPackage: (path: string) => Promise<string>;
}

export type RuleCatalogSyncResult =
  | { readonly status: "DISABLED" }
  | { readonly status: "THROTTLED" }
  | { readonly status: "UP_TO_DATE"; readonly generation: number }
  | RuleCatalogSyncActivationResult;

export interface SynchronizeRuleCatalogOptions {
  readonly force?: boolean;
}

export type SynchronizeRuleCatalog = (
  activeGeneration: number | null,
  options?: SynchronizeRuleCatalogOptions,
) => Promise<RuleCatalogSyncResult>;

export type RuleCatalogSyncErrorCode = "VERSIONED_MANIFEST_MISMATCH" | "REMOTE_GENERATION_ROLLBACK";

export class RuleCatalogSyncError extends Error {
  readonly code: RuleCatalogSyncErrorCode;

  constructor(code: RuleCatalogSyncErrorCode, message: string) {
    super(message);
    this.name = "RuleCatalogSyncError";
    this.code = code;
  }
}

export interface RuleCatalogSyncDependencies {
  readonly remote: RuleCatalogRemotePort;
  readonly claimCheck: () => Promise<boolean>;
  readonly completeCheck: (generation: number) => Promise<void>;
  readonly verifyManifest: (manifestJson: string) => Promise<RuleManifest>;
  readonly verifyArtifacts: (
    artifacts: UntrustedRuleCatalogArtifacts,
  ) => Promise<VerifiedRuleCatalogArtifacts>;
  readonly activate: (
    artifacts: VerifiedRuleCatalogArtifacts,
  ) => Promise<RuleCatalogSyncActivationResult>;
}

export async function synchronizePreviewRuleCatalog(
  activeGeneration: number | null,
  dependencies: RuleCatalogSyncDependencies,
): Promise<RuleCatalogSyncResult> {
  if (!(await dependencies.claimCheck())) return Object.freeze({ status: "THROTTLED" });

  const manifestJson = await dependencies.remote.fetchCurrentManifest();
  const manifest = await dependencies.verifyManifest(manifestJson);
  const versionedManifestJson = await dependencies.remote.fetchVersionedManifest(
    manifest.generation,
  );
  if (versionedManifestJson !== manifestJson) {
    throw new RuleCatalogSyncError(
      "VERSIONED_MANIFEST_MISMATCH",
      "The current rule manifest does not match its immutable generation.",
    );
  }
  if (activeGeneration !== null && manifest.generation < activeGeneration) {
    throw new RuleCatalogSyncError(
      "REMOTE_GENERATION_ROLLBACK",
      "The remote rule manifest is older than the active on-device generation.",
    );
  }
  if (activeGeneration === manifest.generation) {
    await dependencies.completeCheck(manifest.generation);
    return Object.freeze({ status: "UP_TO_DATE", generation: manifest.generation });
  }

  const packageJson: string[] = [];
  for (const descriptor of manifest.packages) {
    packageJson.push(await dependencies.remote.fetchPackage(descriptor.path));
  }
  const verified = await dependencies.verifyArtifacts({ manifestJson, packageJson });
  const activation = await dependencies.activate(verified);
  await dependencies.completeCheck(manifest.generation);
  return activation;
}
