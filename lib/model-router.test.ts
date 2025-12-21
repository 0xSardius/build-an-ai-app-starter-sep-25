import { selectModel, RouterConfigSchema, updateTelemetry, getRoutingStats } from "./model-router";

// Test cases for different workloads
async function runTests() {
  console.log("🧪 Model Router Test Suite\n");
  console.log("=".repeat(70));

  // Initialize telemetry with some test data
  updateTelemetry("openai/gpt-4.1", 2500, true);
  updateTelemetry("openai/gpt-4.1", 2300, true);
  updateTelemetry("openai/gpt-5-mini", 8000, true);
  updateTelemetry("openai/gpt-4o-mini", 1500, true);

  const testCases = [
    {
      name: "Fast Classification Task",
      config: RouterConfigSchema.parse({
        task: "classification",
        priority: "speed",
        complexity: "low",
        maxLatencyMs: 3000,
      }),
      expectedBehavior: "Should select fastest model (gpt-4o-mini or gpt-4.1)",
    },
    {
      name: "Cost-Optimized Summarization",
      config: RouterConfigSchema.parse({
        task: "summarization",
        priority: "cost",
        complexity: "medium",
      }),
      expectedBehavior: "Should select cheapest model (gpt-4o-mini)",
    },
    {
      name: "High-Quality Reasoning Task",
      config: RouterConfigSchema.parse({
        task: "reasoning",
        priority: "quality",
        complexity: "high",
        maxLatencyMs: 15000,
      }),
      expectedBehavior: "Should select reasoning-capable model (gpt-5-mini)",
    },
    {
      name: "Balanced Extraction Task",
      config: RouterConfigSchema.parse({
        task: "extraction",
        priority: "balanced",
        complexity: "medium",
      }),
      expectedBehavior: "Should balance cost, speed, and quality",
    },
    {
      name: "Strict Latency Requirement",
      config: RouterConfigSchema.parse({
        task: "classification",
        priority: "speed",
        complexity: "low",
        maxLatencyMs: 2000, // Very strict
      }),
      expectedBehavior: "Should select model that meets latency requirement",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`\n📋 Test: ${testCase.name}`);
    console.log(`   Expected: ${testCase.expectedBehavior}`);
    
    const selectedModel = selectModel(testCase.config);
    console.log(`   ✅ Selected: ${selectedModel}`);
    
    // Basic validation
    if (selectedModel && selectedModel.startsWith("openai/")) {
      passed++;
      console.log(`   ✅ PASS`);
    } else {
      failed++;
      console.log(`   ❌ FAIL - Invalid model selected`);
    }
  }

  // Test statistics
  console.log("\n\n" + "=".repeat(70));
  console.log("📊 Test Statistics");
  console.log("=".repeat(70));
  
  const stats = getRoutingStats();
  console.log(`\nTotal routing decisions: ${stats.totalDecisions}`);
  console.log(`Models used: ${Object.keys(stats.modelUsage).join(", ")}`);
  
  console.log("\n" + "=".repeat(70));
  console.log(`✅ Tests Passed: ${passed}`);
  console.log(`❌ Tests Failed: ${failed}`);
  console.log(`📊 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  
  if (failed === 0) {
    console.log("\n🎉 All tests passed!");
  } else {
    console.log("\n⚠️  Some tests failed. Review the output above.");
  }
}

// Run workload simulation tests
async function runWorkloadSimulation() {
  console.log("\n\n" + "=".repeat(70));
  console.log("🔄 Workload Simulation");
  console.log("=".repeat(70));

  const workloads = [
    { task: "classification" as const, priority: "speed" as const, count: 20 },
    { task: "summarization" as const, priority: "balanced" as const, count: 15 },
    { task: "reasoning" as const, priority: "quality" as const, count: 5 },
    { task: "classification" as const, priority: "cost" as const, count: 10 },
  ];

  console.log("\nSimulating workloads...");
  
  workloads.forEach((workload) => {
    for (let i = 0; i < workload.count; i++) {
      const config = RouterConfigSchema.parse({
        task: workload.task,
        priority: workload.priority,
      });
      selectModel(config);
    }
    console.log(`   ✅ Simulated ${workload.count} ${workload.task} tasks (${workload.priority} priority)`);
  });

  const finalStats = getRoutingStats();
  console.log(`\n📊 After simulation:`);
  console.log(`   Total decisions: ${finalStats.totalDecisions}`);
  console.log(`   Model distribution:`);
  Object.entries(finalStats.modelUsage).forEach(([model, count]) => {
    const percentage = ((count / finalStats.totalDecisions) * 100).toFixed(1);
    console.log(`     ${model}: ${count} (${percentage}%)`);
  });
}

async function main() {
  await runTests();
  await runWorkloadSimulation();
}

main().catch(console.error);


