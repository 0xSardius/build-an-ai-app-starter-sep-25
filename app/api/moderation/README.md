# Streaming Moderation Pipeline

Enterprise-scale content moderation API with streaming support, language detection, and real-time alerting.

## Features

- ✅ **Multi-language Support**: Auto-detects language and provides locale-aware moderation
- ✅ **Streaming Responses**: Real-time streaming for low-latency processing
- ✅ **Concurrent Processing**: Handles multiple requests simultaneously
- ✅ **Severity Classification**: Categorizes content as safe, warning, or critical
- ✅ **Alert Routing**: Automatically routes flagged content to alerts (console.error)
- ✅ **Telemetry Integration**: Tracks metrics via model-router telemetry system
- ✅ **Risk Scoring**: Provides 0-100 risk score for each message
- ✅ **Redis Caching**: Optional Redis caching for repeated messages (falls back to in-memory)
- ✅ **Rate Limiting**: Built-in rate limiting with configurable limits

## API Endpoints

### POST `/api/moderation`

Moderate a message for inappropriate content.

**Request Body:**

```json
{
  "message": "The message to moderate",
  "locale": "en", // Optional: preferred locale
  "stream": false // Optional: enable streaming response
}
```

**Response (Non-streaming):**

```json
{
  "language": "English",
  "languageCode": "en",
  "severity": "safe",
  "categories": [],
  "confidence": 0.95,
  "riskScore": 5,
  "flagged": false,
  "reasoning": "Content appears safe and appropriate.",
  "cached": false,
  "metrics": {
    "totalRequests": 42,
    "flaggedRate": "0.12",
    "avgLatencyMs": 850,
    "avgRiskScore": 12.5,
    "cacheHitRate": "0.35"
  }
}
```

**Response (Streaming):**
Returns a text stream with incremental moderation results.

### GET `/api/moderation`

Get current moderation metrics.

**Response:**

```json
{
  "metrics": {
    "totalRequests": 100,
    "flaggedCount": 12,
    "severityDistribution": {
      "safe": 88,
      "warning": 10,
      "critical": 2
    },
    "languageDistribution": {
      "English": 60,
      "Spanish": 20,
      "German": 10,
      "Chinese": 5,
      "Japanese": 3,
      "Italian": 2
    },
    "avgLatencyMs": 850,
    "avgRiskScore": 12.5,
    "flaggedRate": "0.12",
    "cacheHitRate": "0.35",
    "cacheHits": 35,
    "cacheMisses": 65,
    "cache": {
      "type": "memory",
      "size": 42
    }
  }
}
```

## Usage Examples

### Basic Moderation

```typescript
const response = await fetch("/api/moderation", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "Hello, this is a normal message.",
  }),
});

const result = await response.json();
console.log(`Severity: ${result.severity}`);
console.log(`Language: ${result.language}`);
```

### Streaming Moderation

```typescript
const response = await fetch("/api/moderation", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: "Content to moderate",
    stream: true,
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value);
  console.log("Stream chunk:", chunk);
}
```

### Multi-language Support

```typescript
// Auto-detect language
await fetch("/api/moderation", {
  method: "POST",
  body: JSON.stringify({
    message: "Hola, ¿cómo estás?",
  }),
});

// Specify locale
await fetch("/api/moderation", {
  method: "POST",
  body: JSON.stringify({
    message: "Hello, how are you?",
    locale: "en",
  }),
});
```

## Testing

Run the concurrent request test suite:

```bash
# Start the Next.js dev server first
pnpm dev

# In another terminal, run tests
pnpm moderation:test
```

The test suite includes:

- Single request testing
- Concurrent request testing (1, 3, 5, 10 concurrent requests)
- Streaming vs non-streaming comparison
- Load testing with increasing concurrency
- Metrics verification

## Moderation Categories

The API detects and categorizes:

- `spam`: Promotional or spam content
- `violence`: Threats or violent content
- `hate_speech`: Discriminatory or hateful content
- `harassment`: Bullying or harassment
- `pii`: Personally Identifiable Information
- `explicit_content`: Adult or explicit content
- `misinformation`: False or misleading claims
- `self_harm`: Self-harm or suicide references
- `other`: Other policy violations

## Severity Levels

- **safe**: No issues detected
- **warning**: Minor concerns, may need review
- **critical**: Requires immediate action, automatically routed to alerts

## Alert Routing

Flagged content (severity: "critical" or flagged: true) is automatically routed to:

- `console.error()` for immediate visibility
- Can be extended to webhooks, queues, or external alerting systems

## Telemetry

The moderation pipeline integrates with the model-router telemetry system to track:

- Request latency
- Success rates
- Model selection
- Cost estimates

Metrics are aggregated and available via the GET endpoint.

## Caching & Rate Limiting

### Redis Caching (Optional)

The API includes intelligent caching for repeated messages:

- **Automatic**: Identical messages are cached for 1 hour
- **Zero Config**: Works out-of-the-box with in-memory cache
- **Redis Support**: Optional Redis for distributed caching

**Setup Redis (Optional):**

```bash
# Add to .env
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

**Without Redis**: Uses in-memory cache (perfect for single-instance deployments)

**Cache Behavior**:

- Cache key is based on message hash + locale
- Critical severity messages are NOT cached (always fresh check)
- Cache TTL: 1 hour (configurable)

### Rate Limiting

Built-in rate limiting protects against abuse:

- **Default**: 100 requests per minute per IP
- **Configurable**: Via environment variables
- **Headers**: Rate limit info in response headers

**Configuration:**

```bash
# .env
RATE_LIMIT_MAX_REQUESTS=100    # Max requests per window
RATE_LIMIT_WINDOW_SECONDS=60   # Time window in seconds
```

**Rate Limit Headers:**

- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Remaining requests in window
- `X-RateLimit-Reset`: When the limit resets (ISO timestamp)
- `Retry-After`: Seconds until retry (on 429 responses)

**Response on Rate Limit Exceeded:**

```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again in 45 seconds.",
  "retryAfter": 45
}
```

## Performance

Designed for enterprise-scale with:

- Low latency (< 2s target, < 50ms with cache hits)
- High throughput (tested with 10+ concurrent requests)
- Streaming support for real-time processing
- Automatic model selection based on performance metrics
- Cache hit rates typically 30-70% for repeated content
