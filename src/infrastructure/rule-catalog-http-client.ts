const MAXIMUM_RULE_ARTIFACT_BYTES = 524_288;
const JSON_CONTENT_TYPE = "application/json";
const PACKAGE_PATH = /^packages\/[a-z0-9.-]+\/[0-9A-Za-z._-]+\.json$/;
const decoder = new TextDecoder("utf-8", { fatal: true });

export type RuleCatalogHttpErrorCode =
  | "INVALID_CONFIGURATION"
  | "UNSAFE_ARTIFACT_PATH"
  | "NETWORK_FAILURE"
  | "REMOTE_REJECTED"
  | "UNEXPECTED_RESPONSE_URL"
  | "UNSUPPORTED_CONTENT_TYPE"
  | "ARTIFACT_TOO_LARGE"
  | "INVALID_UTF8";

export class RuleCatalogHttpError extends Error {
  readonly code: RuleCatalogHttpErrorCode;

  constructor(code: RuleCatalogHttpErrorCode, message: string) {
    super(message);
    this.name = "RuleCatalogHttpError";
    this.code = code;
  }
}

export interface RuleCatalogHttpClient {
  readonly fetchCurrentManifest: () => Promise<string>;
  readonly fetchVersionedManifest: (generation: number) => Promise<string>;
  readonly fetchPackage: (path: string) => Promise<string>;
}

interface RuleCatalogHttpClientOptions {
  readonly baseUrl: string;
  readonly fetchImplementation?: typeof fetch;
  readonly requestTimeoutMilliseconds?: number;
}

function fail(code: RuleCatalogHttpErrorCode, message: string): never {
  throw new RuleCatalogHttpError(code, message);
}

function normalizedBaseUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("INVALID_CONFIGURATION", "The rule catalog base URL must be absolute.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username !== "" ||
    parsed.password !== "" ||
    parsed.search !== "" ||
    parsed.hash !== ""
  ) {
    fail("INVALID_CONFIGURATION", "The rule catalog base URL must be credential-free HTTPS.");
  }
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function contentLength(response: Response): number | null {
  const value = response.headers.get("content-length");
  if (value === null) return null;
  if (!/^[0-9]+$/.test(value)) {
    fail("REMOTE_REJECTED", "The rule catalog response has an invalid content length.");
  }
  return Number(value);
}

export function createRuleCatalogHttpClient({
  baseUrl,
  fetchImplementation = globalThis.fetch,
  requestTimeoutMilliseconds = 15_000,
}: RuleCatalogHttpClientOptions): RuleCatalogHttpClient {
  const normalized = normalizedBaseUrl(baseUrl);
  if (typeof fetchImplementation !== "function") {
    fail("INVALID_CONFIGURATION", "A Fetch-compatible implementation is required.");
  }
  if (!Number.isSafeInteger(requestTimeoutMilliseconds) || requestTimeoutMilliseconds <= 0) {
    fail("INVALID_CONFIGURATION", "The rule catalog request timeout must be positive.");
  }

  async function fetchArtifact(relativePath: string, label: string): Promise<string> {
    const url = `${normalized}/${relativePath}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMilliseconds);
    try {
      let response: Response;
      try {
        response = await fetchImplementation(url, {
          method: "GET",
          headers: { Accept: JSON_CONTENT_TYPE },
          cache: "no-store",
          redirect: "error",
          signal: controller.signal,
        });
      } catch {
        throw new RuleCatalogHttpError(
          "NETWORK_FAILURE",
          `${label} could not be downloaded before the request deadline.`,
        );
      }

      if (response.status !== 200) {
        fail("REMOTE_REJECTED", `${label} returned HTTP ${response.status}.`);
      }
      if (response.url !== "" && response.url !== url) {
        fail("UNEXPECTED_RESPONSE_URL", `${label} was served from an unexpected URL.`);
      }
      if (response.headers.get("content-type")?.trim().toLowerCase() !== JSON_CONTENT_TYPE) {
        fail("UNSUPPORTED_CONTENT_TYPE", `${label} is not application/json.`);
      }
      const declaredLength = contentLength(response);
      if (declaredLength !== null && declaredLength > MAXIMUM_RULE_ARTIFACT_BYTES) {
        fail("ARTIFACT_TOO_LARGE", `${label} exceeds the maximum rule artifact size.`);
      }

      let bytes: Uint8Array;
      try {
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch {
        fail("NETWORK_FAILURE", `${label} could not be read completely.`);
      }
      if (bytes.byteLength > MAXIMUM_RULE_ARTIFACT_BYTES) {
        fail("ARTIFACT_TOO_LARGE", `${label} exceeds the maximum rule artifact size.`);
      }
      try {
        return decoder.decode(bytes);
      } catch {
        fail("INVALID_UTF8", `${label} is not valid UTF-8.`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({
    fetchCurrentManifest: () => fetchArtifact("current.json", "The current rule manifest"),
    fetchVersionedManifest: async (generation: number) => {
      if (!Number.isSafeInteger(generation) || generation <= 0) {
        fail("UNSAFE_ARTIFACT_PATH", "The rule manifest generation is invalid.");
      }
      return fetchArtifact(
        `manifests/${generation}.json`,
        `Rule manifest generation ${generation}`,
      );
    },
    fetchPackage: async (path: string) => {
      if (!PACKAGE_PATH.test(path)) {
        fail("UNSAFE_ARTIFACT_PATH", "The signed rule package path is unsupported.");
      }
      return fetchArtifact(path, `Rule package ${path}`);
    },
  });
}

export const ruleCatalogHttpConstants = Object.freeze({
  maximumArtifactBytes: MAXIMUM_RULE_ARTIFACT_BYTES,
  jsonContentType: JSON_CONTENT_TYPE,
});
