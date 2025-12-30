import { NextRequest, NextResponse } from "next/server";
import {
  getCacheKey,
  getCachedResult,
  setCachedResult,
} from "./moderation-cache";

// Rate limit configuration
export interface RateLimitConfig {
  maxRequests: number; // Max requests per window
  windowSeconds: number; // Time window in seconds
  identifier?: string; // Custom identifier (defaults to IP)
}

// Default rate limit: 100 requests per minute
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
};

// Rate limit entry
interface RateLimitEntry {
  count: number;
  resetAt: number; // Timestamp when window resets
}

// Get client identifier (IP address or custom)
function getClientId(request: NextRequest, customId?: string): string {
  if (customId) return customId;

  // Try to get IP from various headers (for proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const ip = forwarded?.split(",")[0] || realIp || request.ip || "unknown";

  return `rate-limit:${ip}`;
}

// Check rate limit
export async function checkRateLimit(
  request: NextRequest,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const clientId = getClientId(request);
  const key = `${clientId}:${config.windowSeconds}`;
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;

  try {
    // Get current rate limit entry
    const entry = await getCachedResult<RateLimitEntry>(key);

    if (!entry || entry.resetAt < now) {
      // New window or expired, reset
      const newEntry: RateLimitEntry = {
        count: 1,
        resetAt: now + windowMs,
      };
      await setCachedResult(key, newEntry, config.windowSeconds);
      return {
        allowed: true,
        remaining: config.maxRequests - 1,
        resetAt: newEntry.resetAt,
      };
    }

    // Check if limit exceeded
    if (entry.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.resetAt,
      };
    }

    // Increment count
    entry.count += 1;
    await setCachedResult(key, entry, Math.ceil((entry.resetAt - now) / 1000));

    return {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  } catch (error) {
    // On error, allow request (fail open)
    console.warn("Rate limit check error:", error);
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: now + windowMs,
    };
  }
}

// Rate limit middleware
export async function rateLimitMiddleware(
  request: NextRequest,
  config?: RateLimitConfig
): Promise<NextResponse | null> {
  const result = await checkRateLimit(request, config);

  if (!result.allowed) {
    const resetSeconds = Math.ceil((result.resetAt - Date.now()) / 1000);
    return NextResponse.json(
      {
        error: "Rate limit exceeded",
        message: `Too many requests. Please try again in ${resetSeconds} seconds.`,
        retryAfter: resetSeconds,
      },
      {
        status: 429,
        headers: {
          "Retry-After": resetSeconds.toString(),
          "X-RateLimit-Limit": (
            config?.maxRequests || DEFAULT_RATE_LIMIT.maxRequests
          ).toString(),
          "X-RateLimit-Remaining": result.remaining.toString(),
          "X-RateLimit-Reset": new Date(result.resetAt).toISOString(),
        },
      }
    );
  }

  // Add rate limit headers to successful requests
  return null; // null means continue
}

// Helper to add rate limit headers to response
export function addRateLimitHeaders(
  response: NextResponse,
  remaining: number,
  resetAt: number,
  limit: number
): NextResponse {
  response.headers.set("X-RateLimit-Limit", limit.toString());
  response.headers.set("X-RateLimit-Remaining", remaining.toString());
  response.headers.set("X-RateLimit-Reset", new Date(resetAt).toISOString());
  return response;
}
