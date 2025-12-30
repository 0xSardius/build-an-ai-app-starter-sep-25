import { NextRequest, NextResponse } from "next/server";
import { generateObject, streamObject } from "ai";
import { z } from "zod";
import { updateTelemetry, selectModel } from "@/lib/model-router";
import {
  getCacheKey,
  getCachedResult,
  setCachedResult,
  getCacheStats,
} from "@/lib/moderation-cache";
import {
  rateLimitMiddleware,
  checkRateLimit,
  addRateLimitHeaders,
} from "@/lib/rate-limit";
import dotenvFlow from "dotenv-flow";

dotenvFlow.config();

// Moderation schema with language detection and severity classification
const moderationSchema = z.object({
  language: z
    .string()
    .describe(
      "The detected language name (e.g., 'English', 'Spanish', 'German', 'Chinese', 'Japanese', 'Italian')"
    ),
  languageCode: z
    .string()
    .length(2)
    .describe(
      "ISO 639-1 language code (e.g., 'en', 'es', 'de', 'zh', 'ja', 'it')"
    ),
  severity: z
    .enum(["safe", "warning", "critical"])
    .describe(
      "Severity level: 'safe' = no issues, 'warning' = minor concerns, 'critical' = requires immediate action"
    ),
  categories: z
    .array(
      z.enum([
        "spam",
        "violence",
        "hate_speech",
        "harassment",
        "pii",
        "explicit_content",
        "misinformation",
        "self_harm",
        "other",
      ])
    )
    .min(0)
    .max(3)
    .describe("Content categories that apply. Empty array if content is safe."),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score for the moderation decision (0-1)"),
  riskScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Overall risk score from 0 (safe) to 100 (highest risk)"),
  flagged: z
    .boolean()
    .describe("Whether this content should be flagged for review"),
  reasoning: z
    .string()
    .describe(
      "Brief explanation of the moderation decision in the detected language"
    ),
});

type ModerationResult = z.infer<typeof moderationSchema>;

// Telemetry for moderation metrics
interface ModerationMetrics {
  totalRequests: number;
  flaggedCount: number;
  cacheHits: number;
  cacheMisses: number;
  severityDistribution: Record<string, number>;
  languageDistribution: Record<string, number>;
  avgLatencyMs: number;
  avgRiskScore: number;
}

let metrics: ModerationMetrics = {
  totalRequests: 0,
  flaggedCount: 0,
  cacheHits: 0,
  cacheMisses: 0,
  severityDistribution: {},
  languageDistribution: {},
  avgLatencyMs: 0,
  avgRiskScore: 0,
};

// Alert routing for flagged content
async function sendAlert(message: string, result: ModerationResult) {
  const alert = {
    timestamp: new Date().toISOString(),
    severity: result.severity,
    riskScore: result.riskScore,
    categories: result.categories,
    language: result.language,
    message: message.substring(0, 500), // Truncate for logging
    reasoning: result.reasoning,
  };

  // Route to console.error for now (can be extended to webhooks, queues, etc.)
  console.error("🚨 MODERATION ALERT:", JSON.stringify(alert, null, 2));
}

// Process a single message with moderation (with caching)
async function moderateMessage(
  message: string,
  locale?: string,
  skipCache = false
): Promise<ModerationResult & { cached?: boolean; latency?: number }> {
  const startTime = Date.now();
  const cacheKey = getCacheKey(message, locale);

  // Check cache first (unless streaming or skipCache is true)
  if (!skipCache) {
    const cached = await getCachedResult<ModerationResult>(cacheKey);
    if (cached) {
      metrics.cacheHits++;
      const latency = Date.now() - startTime;
      return { ...cached, cached: true, latency };
    }
    metrics.cacheMisses++;
  }

  // Select appropriate model for classification task
  const model = selectModel({
    task: "classification",
    priority: "speed",
    complexity: "low",
    maxLatencyMs: 2000, // Low latency requirement for moderation
    requiredCapabilities: ["structured_output"],
  });

  // Build prompt with locale awareness
  const localeContext = locale
    ? `The user's preferred locale is: ${locale}.`
    : "Auto-detect the language of the content.";

  const prompt = `You are a content moderation system. Analyze the following message for inappropriate content, safety concerns, and policy violations.

${localeContext}
Classify the content and provide moderation results in the detected language.

Message to moderate: "${message}"

Analyze for:
- Spam or promotional content
- Violence or threats
- Hate speech or discrimination
- Harassment or bullying
- Personally Identifiable Information (PII)
- Explicit or adult content
- Misinformation or false claims
- Self-harm or suicide references
- Other policy violations

Provide a severity assessment and detailed reasoning.`;

  try {
    const { object: result } = await generateObject({
      model: model as any,
      schema: moderationSchema,
      prompt,
    });

    const latency = Date.now() - startTime;

    // Update telemetry
    updateTelemetry(model, latency, true);

    // Update moderation metrics
    metrics.totalRequests++;
    if (result.flagged) {
      metrics.flaggedCount++;
    }
    metrics.severityDistribution[result.severity] =
      (metrics.severityDistribution[result.severity] || 0) + 1;
    metrics.languageDistribution[result.language] =
      (metrics.languageDistribution[result.language] || 0) + 1;
    metrics.avgLatencyMs =
      (metrics.avgLatencyMs * (metrics.totalRequests - 1) + latency) /
      metrics.totalRequests;
    metrics.avgRiskScore =
      (metrics.avgRiskScore * (metrics.totalRequests - 1) + result.riskScore) /
      metrics.totalRequests;

    // Route flagged content to alerts
    if (result.flagged || result.severity === "critical") {
      await sendAlert(message, result);
    }

    // Cache the result (unless it's critical - we might want fresh checks)
    if (result.severity !== "critical") {
      await setCachedResult(cacheKey, result);
    }

    return { ...result, cached: false, latency };
  } catch (error: any) {
    const latency = Date.now() - startTime;
    updateTelemetry(model, latency, false);

    // Return safe default on error
    return {
      language: "Unknown",
      languageCode: "en",
      severity: "safe",
      categories: [],
      confidence: 0,
      riskScore: 0,
      flagged: false,
      reasoning: `Error during moderation: ${error.message}`,
    };
  }
}

// Streaming moderation handler
export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await rateLimitMiddleware(request, {
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
      windowSeconds: parseInt(process.env.RATE_LIMIT_WINDOW_SECONDS || "60"),
    });

    if (rateLimitResponse) {
      return rateLimitResponse; // Rate limit exceeded
    }

    const body = await request.json();
    const { message, locale, stream = false } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message is required and must be a string" },
        { status: 400 }
      );
    }

    // If streaming is requested, use streamObject
    if (stream) {
      const model = selectModel({
        task: "classification",
        priority: "speed",
        complexity: "low",
        maxLatencyMs: 2000,
        requiredCapabilities: ["structured_output", "streaming"],
      });

      const localeContext = locale
        ? `The user's preferred locale is: ${locale}.`
        : "Auto-detect the language of the content.";

      const prompt = `You are a content moderation system. Analyze the following message for inappropriate content, safety concerns, and policy violations.

${localeContext}
Classify the content and provide moderation results in the detected language.

Message to moderate: "${message}"

Analyze for:
- Spam or promotional content
- Violence or threats
- Hate speech or discrimination
- Harassment or bullying
- Personally Identifiable Information (PII)
- Explicit or adult content
- Misinformation or false claims
- Self-harm or suicide references
- Other policy violations

Provide a severity assessment and detailed reasoning.`;

      const result = streamObject({
        model: model as any,
        schema: moderationSchema,
        prompt,
      });

      // Return streaming response
      return result.toTextStreamResponse();
    }

    // Non-streaming: process immediately (with caching)
    const result = await moderateMessage(message, locale);
    const { cached, latency, ...moderationResult } = result;

    // Get rate limit info for headers
    const rateLimitInfo = await checkRateLimit(request);
    const response = NextResponse.json({
      ...moderationResult,
      cached: cached || false,
      metrics: {
        totalRequests: metrics.totalRequests,
        flaggedRate:
          metrics.totalRequests > 0
            ? (metrics.flaggedCount / metrics.totalRequests).toFixed(2)
            : "0",
        avgLatencyMs: Math.round(metrics.avgLatencyMs),
        avgRiskScore: Math.round(metrics.avgRiskScore * 10) / 10,
        cacheHitRate:
          metrics.cacheHits + metrics.cacheMisses > 0
            ? (
                metrics.cacheHits /
                (metrics.cacheHits + metrics.cacheMisses)
              ).toFixed(2)
            : "0",
      },
    });

    // Add rate limit headers
    return addRateLimitHeaders(
      response,
      rateLimitInfo.remaining,
      rateLimitInfo.resetAt,
      parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100")
    );
  } catch (error: any) {
    console.error("Moderation API error:", error);
    return NextResponse.json(
      { error: "Failed to moderate message", message: error.message },
      { status: 500 }
    );
  }
}

// GET handler for metrics
export async function GET() {
  const cacheStats = getCacheStats();
  return NextResponse.json({
    metrics: {
      ...metrics,
      flaggedRate:
        metrics.totalRequests > 0
          ? (metrics.flaggedCount / metrics.totalRequests).toFixed(2)
          : "0",
      cacheHitRate:
        metrics.cacheHits + metrics.cacheMisses > 0
          ? (
              metrics.cacheHits /
              (metrics.cacheHits + metrics.cacheMisses)
            ).toFixed(2)
          : "0",
      cache: cacheStats,
    },
  });
}
