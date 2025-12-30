import dotenvFlow from "dotenv-flow";
dotenvFlow.config();

// Test messages in multiple languages
const testMessages = [
  {
    message: "Hello, this is a normal message. How are you?",
    locale: "en",
    expectedSeverity: "safe",
  },
  {
    message: "I can't access my account after payment. Please help!",
    locale: "en",
    expectedSeverity: "safe",
  },
  {
    message: "Buy cheap viagra now! Click here for amazing deals!",
    locale: "en",
    expectedSeverity: "warning",
  },
  {
    message: "Ich habe Probleme mit meinem Konto. Können Sie helfen?",
    locale: "de",
    expectedSeverity: "safe",
  },
  {
    message: "La función no funciona correctamente. ¿Hay algún problema?",
    locale: "es",
    expectedSeverity: "safe",
  },
  {
    message: "我需要帮助将您的API集成到我们现有的系统中。",
    locale: "zh",
    expectedSeverity: "safe",
  },
  {
    message: "企業向け料金プランについて、詳しい情報を提供していただけますか？",
    locale: "ja",
    expectedSeverity: "safe",
  },
  {
    message:
      "Ho difficoltà a cancellare il mio account. Per favore, puoi aiutarmi?",
    locale: "it",
    expectedSeverity: "safe",
  },
  {
    message:
      "URGENT: Your account will be deleted unless you click this link NOW!",
    locale: "en",
    expectedSeverity: "warning",
  },
  {
    message: "This is completely safe content with no issues whatsoever.",
    locale: "en",
    expectedSeverity: "safe",
  },
];

const API_URL = process.env.API_URL || "http://localhost:3000/api/moderation";

// Single request test
async function testSingleRequest(
  message: string,
  locale?: string,
  stream = false
) {
  const start = Date.now();
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message, locale, stream }),
    });

    const latency = Date.now() - start;

    if (stream) {
      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (!reader) {
        throw new Error("No reader available");
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
      }

      return {
        success: true,
        latency,
        data: buffer,
      };
    } else {
      const data = await response.json();
      return {
        success: response.ok,
        latency,
        data,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      latency: Date.now() - start,
      error: error.message,
    };
  }
}

// Concurrent requests test
async function testConcurrentRequests(concurrency: number = 5, stream = false) {
  console.log(
    `\n🚀 Testing ${concurrency} concurrent requests (streaming: ${stream})...\n`
  );

  const start = Date.now();
  const testCases = testMessages.slice(0, concurrency);

  // Create concurrent requests
  const promises = testCases.map((test, index) =>
    testSingleRequest(test.message, test.locale, stream).then((result) => ({
      index,
      test,
      result,
    }))
  );

  const results = await Promise.all(promises);
  const totalLatency = Date.now() - start;

  // Analyze results
  const successful = results.filter((r) => r.result.success);
  const failed = results.filter((r) => !r.result.success);
  const latencies = results.map((r) => r.result.latency);
  const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const minLatency = Math.min(...latencies);
  const maxLatency = Math.max(...latencies);

  console.log("=".repeat(70));
  console.log("📊 CONCURRENT REQUEST RESULTS");
  console.log("=".repeat(70));
  console.log(`Total Requests: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`\n⏱️  Latency Metrics:`);
  console.log(`   Total Time: ${totalLatency}ms`);
  console.log(`   Average: ${Math.round(avgLatency)}ms`);
  console.log(`   Min: ${minLatency}ms`);
  console.log(`   Max: ${maxLatency}ms`);
  console.log(
    `   Throughput: ${((results.length / totalLatency) * 1000).toFixed(
      2
    )} req/s`
  );

  // Show individual results
  console.log(`\n📋 Individual Results:`);
  results.forEach(({ index, test, result }) => {
    const status = result.success ? "✅" : "❌";
    const severity = result.data?.severity || "unknown";
    const language = result.data?.language || "unknown";
    console.log(
      `${status} [${
        index + 1
      }] ${language} | Severity: ${severity} | Latency: ${result.latency}ms`
    );
    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    }
  });

  // Show moderation insights
  if (successful.length > 0) {
    const severities = successful
      .map((r) => r.result.data?.severity)
      .filter(Boolean);
    const severityCounts: Record<string, number> = {};
    severities.forEach((s) => {
      severityCounts[s] = (severityCounts[s] || 0) + 1;
    });

    console.log(`\n🔍 Moderation Insights:`);
    Object.entries(severityCounts).forEach(([severity, count]) => {
      console.log(`   ${severity}: ${count}`);
    });
  }

  return {
    totalRequests: results.length,
    successful: successful.length,
    failed: failed.length,
    totalLatency,
    avgLatency,
    minLatency,
    maxLatency,
    throughput: (results.length / totalLatency) * 1000,
  };
}

// Load test with increasing concurrency
async function loadTest() {
  console.log("\n" + "=".repeat(70));
  console.log("🔥 LOAD TEST: Testing with increasing concurrency");
  console.log("=".repeat(70));

  const concurrencyLevels = [1, 3, 5, 10];
  const results: Array<{
    concurrency: number;
    avgLatency: number;
    throughput: number;
    successRate: number;
  }> = [];

  for (const concurrency of concurrencyLevels) {
    console.log(`\n📈 Testing with ${concurrency} concurrent requests...`);
    const result = await testConcurrentRequests(concurrency, false);
    results.push({
      concurrency,
      avgLatency: result.avgLatency,
      throughput: result.throughput,
      successRate: result.successful / result.totalRequests,
    });

    // Small delay between tests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Summary
  console.log("\n" + "=".repeat(70));
  console.log("📊 LOAD TEST SUMMARY");
  console.log("=".repeat(70));
  console.log("Concurrency | Avg Latency | Throughput | Success Rate");
  console.log("-".repeat(70));
  results.forEach((r) => {
    console.log(
      `${r.concurrency.toString().padStart(11)} | ${Math.round(r.avgLatency)
        .toString()
        .padStart(11)}ms | ${r.throughput.toFixed(2).padStart(10)} req/s | ${(
        r.successRate * 100
      ).toFixed(1)}%`
    );
  });
}

// Test streaming vs non-streaming
async function compareStreaming() {
  console.log("\n" + "=".repeat(70));
  console.log("🔄 STREAMING COMPARISON");
  console.log("=".repeat(70));

  const testMessage = testMessages[0].message;

  console.log("\n📤 Non-streaming request...");
  const nonStreamStart = Date.now();
  const nonStreamResult = await testSingleRequest(testMessage, "en", false);
  const nonStreamLatency = Date.now() - nonStreamStart;

  console.log(`✅ Completed in ${nonStreamLatency}ms`);
  console.log(`   Severity: ${nonStreamResult.data?.severity}`);
  console.log(`   Language: ${nonStreamResult.data?.language}`);

  console.log("\n📡 Streaming request...");
  const streamStart = Date.now();
  const streamResult = await testSingleRequest(testMessage, "en", true);
  const streamLatency = Date.now() - streamStart;

  console.log(`✅ Completed in ${streamLatency}ms`);
  console.log(`   First chunk received: ${streamResult.latency}ms`);
}

// Main test runner
async function main() {
  console.log("🧪 Moderation Pipeline - Concurrent Request Testing");
  console.log("=".repeat(70));
  console.log(`API URL: ${API_URL}`);

  try {
    // Test 1: Single request
    console.log("\n" + "=".repeat(70));
    console.log("TEST 1: Single Request");
    console.log("=".repeat(70));
    const singleResult = await testSingleRequest(
      testMessages[0].message,
      testMessages[0].locale
    );
    console.log(`✅ Single request completed`);
    console.log(`   Latency: ${singleResult.latency}ms`);
    console.log(`   Severity: ${singleResult.data?.severity}`);
    console.log(`   Language: ${singleResult.data?.language}`);

    // Test 2: Concurrent requests
    console.log("\n" + "=".repeat(70));
    console.log("TEST 2: Concurrent Requests (5)");
    console.log("=".repeat(70));
    await testConcurrentRequests(5, false);

    // Test 3: Streaming comparison
    await compareStreaming();

    // Test 4: Load test
    await loadTest();

    // Test 5: Get metrics
    console.log("\n" + "=".repeat(70));
    console.log("TEST 5: Fetching Metrics");
    console.log("=".repeat(70));
    try {
      const metricsResponse = await fetch(`${API_URL}`);
      const metrics = await metricsResponse.json();
      console.log("📊 Current Metrics:");
      console.log(JSON.stringify(metrics, null, 2));
    } catch (error: any) {
      console.log(`❌ Failed to fetch metrics: ${error.message}`);
    }

    console.log("\n" + "=".repeat(70));
    console.log("✅ All tests completed!");
    console.log("=".repeat(70));
  } catch (error: any) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);
