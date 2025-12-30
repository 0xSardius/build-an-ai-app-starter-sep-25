import crypto from "crypto";

// Lightweight cache interface - works with or without Redis
interface CacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

// In-memory cache adapter (fallback when Redis not available)
class MemoryCache implements CacheAdapter {
  private cache: Map<string, { value: string; expires: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Cleanup expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (entry.expires < now) {
          this.cache.delete(key);
        }
      }
    }, 5 * 60 * 1000);
  }

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds = 3600): Promise<void> {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.cache.clear();
  }
}

// Redis cache adapter (optional, requires @upstash/redis)
class RedisCache implements CacheAdapter {
  private client: any;

  constructor(redisUrl?: string, redisToken?: string) {
    // Lazy load Redis only if configured
    if (redisUrl && redisToken) {
      try {
        // Dynamic import to avoid requiring Redis if not configured
        const { Redis } = require("@upstash/redis");
        this.client = new Redis({
          url: redisUrl,
          token: redisToken,
        });
      } catch (error) {
        console.warn("Redis not available, falling back to memory cache");
        this.client = null;
      }
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      console.warn("Redis get error:", error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds = 3600): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.set(key, value, { ex: ttlSeconds });
    } catch (error) {
      console.warn("Redis set error:", error);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch (error) {
      console.warn("Redis del error:", error);
    }
  }
}

// Initialize cache adapter (Redis if configured, otherwise memory)
let cacheAdapter: CacheAdapter;

function initCache() {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    cacheAdapter = new RedisCache(redisUrl, redisToken);
    console.log("✅ Using Redis cache");
  } else {
    cacheAdapter = new MemoryCache();
    console.log("✅ Using in-memory cache (set UPSTASH_REDIS_* env vars for Redis)");
  }
}

// Initialize on module load
if (typeof cacheAdapter === "undefined") {
  initCache();
}

// Generate cache key from message
export function getCacheKey(message: string, locale?: string): string {
  const normalized = message.trim().toLowerCase();
  const hash = crypto.createHash("sha256").update(normalized + (locale || "")).digest("hex");
  return `moderation:${hash}`;
}

// Cache TTL (1 hour for moderation results)
const CACHE_TTL_SECONDS = 3600;

// Get cached moderation result
export async function getCachedResult<T>(key: string): Promise<T | null> {
  try {
    const cached = await cacheAdapter.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }
  } catch (error) {
    console.warn("Cache get error:", error);
  }
  return null;
}

// Cache moderation result
export async function setCachedResult<T>(key: string, result: T): Promise<void> {
  try {
    await cacheAdapter.set(key, JSON.stringify(result), CACHE_TTL_SECONDS);
  } catch (error) {
    console.warn("Cache set error:", error);
  }
}

// Clear cache entry
export async function clearCache(key: string): Promise<void> {
  try {
    await cacheAdapter.del(key);
  } catch (error) {
    console.warn("Cache del error:", error);
  }
}

// Cache stats (for in-memory cache only)
export function getCacheStats() {
  if (cacheAdapter instanceof MemoryCache) {
    // Access private cache for stats
    const cache = (cacheAdapter as any).cache;
    return {
      type: "memory",
      size: cache.size,
    };
  }
  return {
    type: "redis",
    size: "unknown",
  };
}

