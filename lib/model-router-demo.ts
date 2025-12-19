import dotenvFlow from "dotenv-flow";
dotenvFlow.config();
import { generateText } from "ai";
import {
  selectModel,
  updateTelemetry,
  getRoutingStats,
  RouterConfigSchema,
} from "./model-router";

// Demo workloads
const workloads = [
  {
    name: "Simple Classification",
    prompt:
      "Classify this text as positive, negative, or neutral: 'I love this product!'",
    config: RouterConfigSchema.parse({
      task: "classification",
      priority: "speed",
      complexity: "low",
    }),
  },
  {
    name: "Text Summarization",
    prompt: `Summarize this article in 3 sentences:
    
    Artificial intelligence has revolutionized many industries, from healthcare to finance. 
    Machine learning algorithms can now diagnose diseases with high accuracy, predict market 
    trends, and even create art. However, concerns about job displacement and ethical AI 
    usage continue to be debated. The future of AI depends on responsible development and 
    thoughtful regulation.`,
    config: RouterConfigSchema.parse({
      task: "summarization",
      priority: "balanced",
      complexity: "medium",
    }),
  },
  {
    name: "Complex Reasoning",
    prompt: `A company has 150 employees. They want to organize them into teams where:
- Each team has between 8-12 people
- No team should have exactly 10 people
- Teams should be as equal in size as possible
How should they organize the teams?`,
    config: RouterConfigSchema.parse({
      task: "reasoning",
      priority: "quality",
      complexity: "high",
      maxLatencyMs: 15000,
    }),
  },
  {
    name: "Cost-Optimized Classification",
    prompt: "Is this email spam? 'Win a free iPhone now!'",
    config: RouterConfigSchema.parse({
      task: "classification",
      priority: "cost",
      complexity: "low",
    }),
  },
];

async function runDemo() {
  console.log("🚀 Model Router Demo\n");
  console.log("=".repeat(70));

  // Run each workload
  for (let i = 0; i < workloads.length; i++) {
    const workload = workloads[i];
    console.log(`\n📋 Workload ${i + 1}: ${workload.name}`);
    console.log("-".repeat(70));
    console.log(`Task: ${workload.config.task}`);
    console.log(`Priority: ${workload.config.priority}`);
    console.log(`Complexity: ${workload.config.complexity}`);

    // Select model using router
    const selectedModel = selectModel(workload.config);
    console.log(`\n🎯 Selected Model: ${selectedModel}`);

    // Execute the request
    console.log(`\n⏳ Executing request...`);
    const start = Date.now();
    try {
      const result = await generateText({
        model: selectedModel,
        prompt: workload.prompt,
      });
      const end = Date.now();
      const latency = end - start;

      // Update telemetry
      updateTelemetry(selectedModel, latency, true);

      console.log(`✅ Success! Latency: ${latency}ms`);
      console.log(`📝 Response preview: ${result.text.substring(0, 150)}...`);
    } catch (error: any) {
      const end = Date.now();
      const latency = end - start;
      updateTelemetry(selectedModel, latency, false);
      console.log(`❌ Error: ${error.message}`);
    }
  }

  // Show statistics
  console.log("\n\n" + "=".repeat(70));
  console.log("📊 ROUTING STATISTICS");
  console.log("=".repeat(70));

  const stats = getRoutingStats();
  console.log(`\nTotal Routing Decisions: ${stats.totalDecisions}`);

  console.log(`\n📈 Model Usage:`);
  Object.entries(stats.modelUsage)
    .sort(([, a], [, b]) => b - a)
    .forEach(([model, count]) => {
      console.log(`   ${model}: ${count} times`);
    });

  console.log(`\n📋 Task Distribution:`);
  Object.entries(stats.taskDistribution).forEach(([task, count]) => {
    console.log(`   ${task}: ${count} times`);
  });

  console.log(`\n⚡ Average Latency by Model:`);
  Object.entries(stats.avgLatencyByModel).forEach(([model, latency]) => {
    console.log(`   ${model}: ${latency.toFixed(0)}ms`);
  });

  console.log(`\n💰 Estimated Cost by Model:`);
  Object.entries(stats.estimatedCostByModel).forEach(([model, cost]) => {
    console.log(`   ${model}: $${cost.toFixed(4)}`);
  });

  console.log("\n✅ Demo complete!");
}

runDemo().catch(console.error);
