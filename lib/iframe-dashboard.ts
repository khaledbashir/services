const TWENTY_BASE =
  process.env.TWENTY_API_URL || "https://abc-twenty.izcgmb.easypanel.host";
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || "";
const PAGE_SIZE = 100;
const CACHE_TTL_MS = 60_000;

const metricCache = new Map<string, { value: number; timestamp: number }>();

type RestListResult<T> = {
  records: T[];
  totalCount: number;
  pageInfo?: {
    hasNextPage?: boolean;
    endCursor?: string | null;
  };
};

function buildRestUrl(
  endpoint: string,
  options?: {
    filter?: string;
    limit?: number;
    cursor?: string | null;
  },
): string {
  const params = new URLSearchParams();
  params.set("limit", String(options?.limit ?? PAGE_SIZE));

  if (options?.filter) {
    params.set("filter", options.filter);
  }

  if (options?.cursor) {
    params.set("starting_after", options.cursor);
  }

  return `${TWENTY_BASE}/rest/${endpoint}?${params.toString()}`;
}

async function twentyFetchJson<T>(
  endpoint: string,
  options?: {
    filter?: string;
    limit?: number;
    cursor?: string | null;
  },
): Promise<RestListResult<T>> {
  if (!TWENTY_API_KEY) {
    throw new Error("TWENTY_API_KEY is not configured on this server.");
  }

  const response = await fetch(buildRestUrl(endpoint, options), {
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `Twenty request failed (${response.status})`;

    try {
      const body = await response.json();
      message =
        body?.messages?.[0] ||
        body?.error ||
        body?.message ||
        `Twenty request failed (${response.status})`;
    } catch {
      // Ignore JSON parsing failure and keep the generic message.
    }

    throw new Error(String(message));
  }

  const json = await response.json();

  return {
    records: json?.data?.[endpoint] || [],
    totalCount: Number(json?.totalCount ?? 0),
    pageInfo: json?.pageInfo,
  };
}

export async function fetchTotalCount(
  endpoint: string,
  filter?: string,
): Promise<number> {
  const cacheKey = `count:${endpoint}:${filter || "all"}`;
  const cached = metricCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  try {
    const result = await twentyFetchJson(endpoint, { filter, limit: 1 });
    metricCache.set(cacheKey, { value: result.totalCount, timestamp: Date.now() });
    return result.totalCount;
  } catch (error) {
    if (cached) {
      return cached.value;
    }

    throw error;
  }
}

export async function fetchSumForCurrentMonth(
  endpoint: string,
  field: string,
  dateField: string,
): Promise<number> {
  const cacheKey = `sum:${endpoint}:${field}:${dateField}`;
  const cached = metricCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.value;
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const filter = `${dateField}[gte]:"${monthStart.toISOString().slice(0, 10)}"`;

  let total = 0;
  let cursor: string | null = null;

  for (let page = 0; page < 20; page++) {
    const pageResult: RestListResult<Record<string, unknown>> =
      await twentyFetchJson<Record<string, unknown>>(endpoint, {
      filter,
      limit: PAGE_SIZE,
      cursor,
      });

    for (const record of pageResult.records) {
      const rawValue = record?.[field];
      if (typeof rawValue === "number") {
        total += rawValue;
      }
    }

    if (!pageResult.pageInfo?.hasNextPage || !pageResult.pageInfo.endCursor) {
      break;
    }

    cursor = pageResult.pageInfo.endCursor;
  }

  metricCache.set(cacheKey, { value: total, timestamp: Date.now() });
  return total;
}

export function formatMetricValue(
  value: number,
  options?: { decimals?: number },
): string {
  const decimals = options?.decimals ?? 0;

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function getCurrentMonthLabel(): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(new Date());
}
