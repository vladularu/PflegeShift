import { describe, expect, it, vi } from "vitest";

import {
  createRuleCatalogHttpClient,
  RuleCatalogHttpError,
  ruleCatalogHttpConstants,
} from "@/infrastructure/rule-catalog-http-client";

const BASE_URL = "https://example.supabase.co/storage/v1/object/public/rules/preview";

function response(
  body: string | Uint8Array,
  options: {
    readonly status?: number;
    readonly url?: string;
    readonly contentType?: string | null;
    readonly contentLength?: string | null;
    readonly arrayBuffer?: () => Promise<ArrayBuffer>;
  } = {},
): Response {
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const headers = new Headers();
  if (options.contentType !== null) {
    headers.set("content-type", options.contentType ?? "application/json");
  }
  if (options.contentLength !== null) {
    headers.set("content-length", options.contentLength ?? String(bytes.byteLength));
  }
  return {
    status: options.status ?? 200,
    url: options.url ?? "",
    headers,
    arrayBuffer:
      options.arrayBuffer ??
      (async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  } as Response;
}

async function expectHttpError(
  operation: Promise<unknown>,
  code: RuleCatalogHttpError["code"],
): Promise<void> {
  await expect(operation).rejects.toMatchObject({ name: "RuleCatalogHttpError", code });
}

describe("rule catalog HTTP client", () => {
  it("downloads only the fixed current, versioned, and signed package paths", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) =>
      response(`{"url":"${String(input)}"}`, { url: String(input) }),
    ) as unknown as typeof fetch;
    const client = createRuleCatalogHttpClient({ baseUrl: `${BASE_URL}/`, fetchImplementation });

    await expect(client.fetchCurrentManifest()).resolves.toContain("current.json");
    await expect(client.fetchVersionedManifest(7)).resolves.toContain("manifests/7.json");
    await expect(client.fetchPackage("packages/de-arbzg-care/2026-01.json")).resolves.toContain(
      "packages/de-arbzg-care/2026-01.json",
    );

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(fetchImplementation).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/current.json`,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        redirect: "error",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("rejects unsafe configuration and artifact paths before a request", async () => {
    expect(() => createRuleCatalogHttpClient({ baseUrl: "http://example.com/preview" })).toThrow(
      RuleCatalogHttpError,
    );
    const fetchImplementation = vi.fn() as unknown as typeof fetch;
    const client = createRuleCatalogHttpClient({ baseUrl: BASE_URL, fetchImplementation });

    await expectHttpError(client.fetchVersionedManifest(0), "UNSAFE_ARTIFACT_PATH");
    await expectHttpError(client.fetchPackage("../current.json"), "UNSAFE_ARTIFACT_PATH");
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("requires HTTP 200, the exact response URL, and application/json", async () => {
    const rejected = createRuleCatalogHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: vi.fn(async () =>
        response("{}", { status: 503 }),
      ) as unknown as typeof fetch,
    });
    await expectHttpError(rejected.fetchCurrentManifest(), "REMOTE_REJECTED");

    const redirected = createRuleCatalogHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: vi.fn(async () =>
        response("{}", { url: "https://attacker.invalid/current.json" }),
      ) as unknown as typeof fetch,
    });
    await expectHttpError(redirected.fetchCurrentManifest(), "UNEXPECTED_RESPONSE_URL");

    const wrongType = createRuleCatalogHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: vi.fn(async () =>
        response("{}", { contentType: "text/plain" }),
      ) as unknown as typeof fetch,
    });
    await expectHttpError(wrongType.fetchCurrentManifest(), "UNSUPPORTED_CONTENT_TYPE");
  });

  it("rejects oversized declared and actual bodies plus invalid UTF-8", async () => {
    const declared = createRuleCatalogHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: vi.fn(async () =>
        response("{}", {
          contentLength: String(ruleCatalogHttpConstants.maximumArtifactBytes + 1),
        }),
      ) as unknown as typeof fetch,
    });
    await expectHttpError(declared.fetchCurrentManifest(), "ARTIFACT_TOO_LARGE");

    const oversized = new Uint8Array(ruleCatalogHttpConstants.maximumArtifactBytes + 1);
    const actual = createRuleCatalogHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: vi.fn(async () =>
        response(oversized, { contentLength: null }),
      ) as unknown as typeof fetch,
    });
    await expectHttpError(actual.fetchCurrentManifest(), "ARTIFACT_TOO_LARGE");

    const invalidUtf8 = createRuleCatalogHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation: vi.fn(async () =>
        response(Uint8Array.from([0xc3, 0x28])),
      ) as unknown as typeof fetch,
    });
    await expectHttpError(invalidUtf8.fetchCurrentManifest(), "INVALID_UTF8");
  });

  it("aborts a request that exceeds the bounded deadline", async () => {
    const fetchImplementation = vi.fn(
      (_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;
    const client = createRuleCatalogHttpClient({
      baseUrl: BASE_URL,
      fetchImplementation,
      requestTimeoutMilliseconds: 5,
    });

    await expectHttpError(client.fetchCurrentManifest(), "NETWORK_FAILURE");
  });
});
