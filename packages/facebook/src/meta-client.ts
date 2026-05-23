/**
 * Meta Graph API client for VFOS.
 *
 * Reads credentials from environment variables:
 *   - FACEBOOK_PAGE_ID
 *   - FACEBOOK_PAGE_ACCESS_TOKEN
 *
 * Security: tokens are NEVER logged. Only masked hints are shown on error.
 */

const META_GRAPH_API_BASE = "https://graph.facebook.com/v22.0";

export interface MetaClientConfig {
  /** Facebook Page ID */
  pageId: string;
  /** Page Access Token (never log this) */
  pageAccessToken: string;
}

export interface MetaClient {
  /** The Page ID this client is configured for */
  readonly pageId: string;
  /** Make a GET request to the Graph API */
  get<T = unknown>(path: string, params?: Record<string, string>): Promise<MetaApiResult<T>>;
}

export interface MetaApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: MetaApiError;
}

export interface MetaApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number | undefined;
  fbtrace_id?: string | undefined;
}

/**
 * Create a Meta Graph API client from environment variables.
 * Throws immediately if required env vars are missing.
 */
export function createMetaClientFromEnv(): MetaClient {
  const pageId = process.env["FACEBOOK_PAGE_ID"];
  const pageAccessToken = process.env["FACEBOOK_PAGE_ACCESS_TOKEN"];

  if (!pageId || pageId.trim() === "") {
    throw new Error(
      "[VFOS/Facebook] FACEBOOK_PAGE_ID is not set.\n" +
      "  → Set it in your .env file. See .env.example for reference."
    );
  }

  if (!pageAccessToken || pageAccessToken.trim() === "") {
    throw new Error(
      "[VFOS/Facebook] FACEBOOK_PAGE_ACCESS_TOKEN is not set.\n" +
      "  → Set it in your .env file. See .env.example for reference.\n" +
      "  → Get a Page Access Token from: https://developers.facebook.com/tools/explorer/"
    );
  }

  return createMetaClient({ pageId: pageId.trim(), pageAccessToken: pageAccessToken.trim() });
}

/**
 * Create a Meta Graph API client with explicit config.
 */
export function createMetaClient(config: MetaClientConfig): MetaClient {
  const { pageId, pageAccessToken } = config;

  return {
    pageId,

    async get<T = unknown>(
      path: string,
      params: Record<string, string> = {}
    ): Promise<MetaApiResult<T>> {
      const url = new URL(`${META_GRAPH_API_BASE}${path}`);
      url.searchParams.set("access_token", pageAccessToken);
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }

      try {
        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "User-Agent": "VFOS/0.1.0",
          },
        });

        const body = (await response.json()) as Record<string, unknown>;

        if (!response.ok) {
          const fbError = (body["error"] ?? {}) as Record<string, unknown>;
          return {
            ok: false,
            status: response.status,
            error: {
              message: String(fbError["message"] ?? "Unknown error"),
              type: String(fbError["type"] ?? "UnknownError"),
              code: Number(fbError["code"] ?? 0),
              error_subcode: fbError["error_subcode"] != null
                ? Number(fbError["error_subcode"])
                : undefined,
              fbtrace_id: fbError["fbtrace_id"] != null
                ? String(fbError["fbtrace_id"])
                : undefined,
            },
          };
        }

        return {
          ok: true,
          status: response.status,
          data: body as T,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          status: 0,
          error: {
            message: `Network error: ${message}`,
            type: "NetworkError",
            code: 0,
          },
        };
      }
    },
  };
}

/**
 * Mask a token for safe display: show first 8 + last 4 chars.
 * NEVER log the full token.
 */
export function maskToken(token: string): string {
  if (token.length <= 16) return "****";
  return `${token.slice(0, 8)}...${token.slice(-4)}`;
}
