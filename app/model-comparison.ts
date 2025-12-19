import { generateText } from "ai";
import "dotenv/config";
import { updateTelemetry } from "../lib/model-router";

const complexProblem = `
A company has 150 employees. They want to organize them into teams where:
- Each team has between 8-12 people
- No team should have exactly 10 people
- Teams should be as equal in size as possible
How should they organize the teams?
`;

async function compareFastVsReasoning() {
  console.log("🚀 Starting model comparison...\n");
  console.log("=".repeat(60));

  // Test fast model (gpt-4.1)
  console.log("\n⚡ Testing fast model (gpt-4.1)...");
  const fastStart = Date.now();
  const fastResult = await generateText({
    model: "openai/gpt-4.1",
    prompt: complexProblem,
  });
  const fastEnd = Date.now();
  const fastResponseTime = fastEnd - fastStart;
  console.log(`✅ Fast model response time: ${fastResponseTime}ms`);
  console.log(`First 200 characters: ${fastResult.text.substring(0, 200)}...`);

  // Log telemetry
  updateTelemetry("openai/gpt-4.1", fastResponseTime, true);

  // Test reasoning model (gpt-5-mini)
  console.log("\n🧠 Testing reasoning model (gpt-5-mini)...");
  const reasoningStart = Date.now();
  const reasoningResult = await generateText({
    model: "openai/gpt-5-mini",
    prompt: complexProblem,
  });
  const reasoningEnd = Date.now();
  const reasoningResponseTime = reasoningEnd - reasoningStart;
  console.log(`✅ Reasoning model response time: ${reasoningResponseTime}ms`);
  console.log(
    `First 200 characters: ${reasoningResult.text.substring(0, 200)}...`
  );

  // Log telemetry
  updateTelemetry("openai/gpt-5-mini", reasoningResponseTime, true);

  // Compare the results
  console.log("\n" + "=".repeat(60));
  console.log("📊 COMPARISON RESULTS");
  console.log("=".repeat(60));
  console.log(`Fast model (gpt-4.1):     ${fastResponseTime}ms`);
  console.log(`Reasoning model (gpt-5-mini): ${reasoningResponseTime}ms`);

  const timeDifference = Math.abs(fastResponseTime - reasoningResponseTime);
  const fasterModel =
    fastResponseTime < reasoningResponseTime
      ? "Fast model (gpt-4.1)"
      : "Reasoning model (gpt-5-mini)";
  const speedup =
    fastResponseTime < reasoningResponseTime
      ? (reasoningResponseTime / fastResponseTime).toFixed(2)
      : (fastResponseTime / reasoningResponseTime).toFixed(2);

  console.log(`\n🏆 Faster model: ${fasterModel}`);
  console.log(`⏱️  Time difference: ${timeDifference}ms`);
  console.log(`📈 Speedup: ${speedup}x`);

  // Compare response quality (length as a proxy)
  console.log(`\n📝 Response length comparison:`);
  console.log(`   Fast model: ${fastResult.text.length} characters`);
  console.log(`   Reasoning model: ${reasoningResult.text.length} characters`);
}

compareFastVsReasoning().catch(console.error);
