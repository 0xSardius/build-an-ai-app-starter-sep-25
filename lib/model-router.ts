import { z } from "zod";
import fs from "fs";
import path from "path";

// Router configuration schema
export const RouterConfigSchema = z.object({
  task: z.enum([
    "classification",
    "summarization",
    "reasoning",
    "extraction",
    "chat",
    "other",
  ]),
  maxLatencyMs: z
    .number()
    .optional()
    .describe("Maximum acceptable latency in milliseconds"),
  priority: z
    .enum(["cost", "quality", "speed", "balanced"])
    .default("balanced"),
  complexity: z
    .enum(["low", "medium", "high"])
    .default("medium")
    .describe("Task complexity level"),
  requiredCapabilities: z
    .array(z.string())
    .optional()
    .describe("Required capabilities (e.g., 'structured_output', 'streaming')"),
});

export type RouterConfig = z.infer<typeof RouterConfigSchema>;

// Model capability tiers
export enum CapabilityTier {
  BASIC = "basic", // Simple tasks, fast responses
  STANDARD = "standard", // Most common tasks
  ADVANCED = "advanced", // Complex reasoning, structured output
  REASONING = "reasoning", // Deep reasoning, multi-step problems
}

// Model telemetry data
export interface ModelTelemetry {
  model: string;
  latencyMs: number;
  costPer1kTokens: number; // Cost per 1000 tokens (input + output average)
  successRate: number; // 0-1, success rate of requests
  capabilityTier: CapabilityTier;
  lastUpdated: number; // Timestamp
  callCount: number; // Total number of calls
  avgLatencyMs: number; // Running average latency
}

// Routing decision record
export interface RoutingDecision {
  timestamp: number;
  config: RouterConfig;
  selectedModel: string;
  reason: string;
  alternatives: Array<{ model: string; score: number; reason: string }>;
}

// Static model capabilities and base costs (from provider docs)
const MODEL_CAPABILITIES: Record<
  string,
  {
    capabilityTier: CapabilityTier;
    baseCostPer1kTokens: number; // Approximate cost per 1k tokens
    maxLatencyMs: number; // Typical max latency
    supportsStructuredOutput: boolean;
    supportsStreaming: boolean;
  }
> = {
  "openai/gpt-4.1": {
    capabilityTier: CapabilityTier.STANDARD,
    baseCostPer1kTokens: 0.03, // Approximate
    maxLatencyMs: 3000,
    supportsStructuredOutput: true,
    supportsStreaming: true,
  },
  "openai/gpt-5-mini": {
    capabilityTier: CapabilityTier.REASONING,
    baseCostPer1kTokens: 0.05, // Higher cost for reasoning models
    maxLatencyMs: 10000, // Reasoning takes longer
    supportsStructuredOutput: true,
    supportsStreaming: true,
  },
  "openai/gpt-4o-mini": {
    capabilityTier: CapabilityTier.BASIC,
    baseCostPer1kTokens: 0.01, // Cheaper, faster
    maxLatencyMs: 2000,
    supportsStructuredOutput: true,
    supportsStreaming: true,
  },
};

// Telemetry storage file
const getTelemetryPath = () => {
  const libPath = path.join(process.cwd(), "lib");
  // Ensure lib directory exists
  if (!fs.existsSync(libPath)) {
    fs.mkdirSync(libPath, { recursive: true });
  }
  return path.join(libPath, ".model-telemetry.json");
};

const getHistoryPath = () => {
  const libPath = path.join(process.cwd(), "lib");
  if (!fs.existsSync(libPath)) {
    fs.mkdirSync(libPath, { recursive: true });
  }
  return path.join(libPath, ".routing-history.json");
};

// Load telemetry data
function loadTelemetry(): Record<string, ModelTelemetry> {
  try {
    const telemetryFile = getTelemetryPath();
    if (fs.existsSync(telemetryFile)) {
      return JSON.parse(fs.readFileSync(telemetryFile, "utf-8"));
    }
  } catch (error) {
    console.warn("Failed to load telemetry:", error);
  }

  // Initialize with base data
  const initial: Record<string, ModelTelemetry> = {};
  Object.keys(MODEL_CAPABILITIES).forEach((model) => {
    initial[model] = {
      model,
      latencyMs: MODEL_CAPABILITIES[model].maxLatencyMs,
      costPer1kTokens: MODEL_CAPABILITIES[model].baseCostPer1kTokens,
      successRate: 1.0,
      capabilityTier: MODEL_CAPABILITIES[model].capabilityTier,
      lastUpdated: Date.now(),
      callCount: 0,
      avgLatencyMs: MODEL_CAPABILITIES[model].maxLatencyMs,
    };
  });
  return initial;
}

// Save telemetry data
function saveTelemetry(telemetry: Record<string, ModelTelemetry>): void {
  try {
    fs.writeFileSync(getTelemetryPath(), JSON.stringify(telemetry, null, 2));
  } catch (error) {
    console.warn("Failed to save telemetry:", error);
  }
}

// Load routing history
function loadRoutingHistory(): RoutingDecision[] {
  try {
    const historyFile = getHistoryPath();
    if (fs.existsSync(historyFile)) {
      const history = JSON.parse(fs.readFileSync(historyFile, "utf-8"));
      // Keep only last 100 entries
      return history.slice(-100);
    }
  } catch (error) {
    console.warn("Failed to load routing history:", error);
  }
  return [];
}

// Save routing decision
function saveRoutingDecision(decision: RoutingDecision): void {
  try {
    const history = loadRoutingHistory();
    history.push(decision);
    // Keep only last 100 entries
    const recent = history.slice(-100);
    fs.writeFileSync(getHistoryPath(), JSON.stringify(recent, null, 2));
  } catch (error) {
    console.warn("Failed to save routing decision:", error);
  }
}

// Update telemetry after a model call
export function updateTelemetry(
  model: string,
  latencyMs: number,
  success: boolean = true
): void {
  const telemetry = loadTelemetry();

  if (!telemetry[model]) {
    // Initialize if doesn't exist
    const base = MODEL_CAPABILITIES[model] || {
      capabilityTier: CapabilityTier.STANDARD,
      baseCostPer1kTokens: 0.03,
      maxLatencyMs: 5000,
      supportsStructuredOutput: true,
      supportsStreaming: true,
    };

    telemetry[model] = {
      model,
      latencyMs,
      costPer1kTokens: base.baseCostPer1kTokens,
      successRate: success ? 1.0 : 0.0,
      capabilityTier: base.capabilityTier,
      lastUpdated: Date.now(),
      callCount: 1,
      avgLatencyMs: latencyMs,
    };
  } else {
    // Update running averages
    const existing = telemetry[model];
    existing.callCount += 1;
    existing.avgLatencyMs =
      (existing.avgLatencyMs * (existing.callCount - 1) + latencyMs) /
      existing.callCount;
    existing.latencyMs = latencyMs; // Most recent
    existing.successRate =
      (existing.successRate * (existing.callCount - 1) + (success ? 1 : 0)) /
      existing.callCount;
    existing.lastUpdated = Date.now();
  }

  saveTelemetry(telemetry);
}

// Calculate model score for a given config
function calculateModelScore(
  model: string,
  telemetry: ModelTelemetry,
  config: RouterConfig
): { score: number; reason: string } {
  const capabilities = MODEL_CAPABILITIES[model];
  if (!capabilities) {
    return { score: 0, reason: "Unknown model" };
  }

  let score = 100; // Start with base score
  const reasons: string[] = [];

  // Check capability tier match
  const taskTierMap: Record<string, CapabilityTier> = {
    classification: CapabilityTier.BASIC,
    summarization: CapabilityTier.STANDARD,
    extraction: CapabilityTier.STANDARD,
    reasoning: CapabilityTier.REASONING,
    chat: CapabilityTier.STANDARD,
  };

  const requiredTier = taskTierMap[config.task] || CapabilityTier.STANDARD;
  const tierOrder = [
    CapabilityTier.BASIC,
    CapabilityTier.STANDARD,
    CapabilityTier.ADVANCED,
    CapabilityTier.REASONING,
  ];
  const modelTierIndex = tierOrder.indexOf(telemetry.capabilityTier);
  const requiredTierIndex = tierOrder.indexOf(requiredTier);

  if (modelTierIndex < requiredTierIndex) {
    score -= 30; // Model doesn't meet capability requirements
    reasons.push("insufficient capabilities");
  } else if (modelTierIndex > requiredTierIndex + 1) {
    score -= 10; // Overkill, but acceptable
    reasons.push("overkill for task");
  }

  // Check latency constraints
  if (config.maxLatencyMs && telemetry.avgLatencyMs > config.maxLatencyMs) {
    score -= 50; // Doesn't meet latency requirement
    reasons.push("exceeds max latency");
  }

  // Priority-based scoring
  if (config.priority === "cost") {
    const costScore = (1 / telemetry.costPer1kTokens) * 100; // Higher score for lower cost
    score = score * 0.3 + costScore * 0.7;
    reasons.push("cost-optimized");
  } else if (config.priority === "speed") {
    const speedScore = (1 / telemetry.avgLatencyMs) * 10000; // Higher score for lower latency
    score = score * 0.3 + speedScore * 0.7;
    reasons.push("speed-optimized");
  } else if (config.priority === "quality") {
    // Prefer higher capability tiers
    const qualityScore = (modelTierIndex + 1) * 25;
    score = score * 0.3 + qualityScore * 0.7;
    reasons.push("quality-optimized");
  } else {
    // Balanced: consider all factors
    const costScore = (1 / telemetry.costPer1kTokens) * 50;
    const speedScore = (1 / telemetry.avgLatencyMs) * 5000;
    const qualityScore = (modelTierIndex + 1) * 15;
    score =
      score * 0.2 + costScore * 0.3 + speedScore * 0.3 + qualityScore * 0.2;
    reasons.push("balanced");
  }

  // Penalize low success rate
  if (telemetry.successRate < 0.95) {
    score -= (1 - telemetry.successRate) * 50;
    reasons.push("low success rate");
  }

  // Boost score for recent, frequently used models (they're likely reliable)
  const daysSinceUpdate =
    (Date.now() - telemetry.lastUpdated) / (1000 * 60 * 60 * 24);
  if (daysSinceUpdate < 1 && telemetry.callCount > 10) {
    score += 5;
    reasons.push("recently used");
  }

  return {
    score: Math.max(0, score),
    reason: reasons.join(", "),
  };
}

// Select the best model for a given configuration
export function selectModel(config: RouterConfig): string {
  const telemetry = loadTelemetry();

  // Get all available models
  const models = Object.keys(telemetry);
  if (models.length === 0) {
    // Fallback to default
    return "openai/gpt-4.1";
  }

  // Score all models
  const scored = models.map((model) => {
    const score = calculateModelScore(model, telemetry[model], config);
    return {
      model,
      ...score,
    };
  });

  // Sort by score (highest first)
  scored.sort((a, b) => b.score - a.score);

  // Select best model
  const selected = scored[0];
  const alternatives = scored.slice(1, 4); // Top 3 alternatives

  // Save routing decision
  const decision: RoutingDecision = {
    timestamp: Date.now(),
    config,
    selectedModel: selected.model,
    reason: `${selected.reason} (score: ${selected.score.toFixed(2)})`,
    alternatives: alternatives.map((alt) => ({
      model: alt.model,
      score: alt.score,
      reason: alt.reason,
    })),
  };
  saveRoutingDecision(decision);

  return selected.model;
}

// Get routing statistics
export function getRoutingStats() {
  const history = loadRoutingHistory();
  const telemetry = loadTelemetry();

  // Model usage counts
  const modelUsage: Record<string, number> = {};
  history.forEach((decision) => {
    modelUsage[decision.selectedModel] =
      (modelUsage[decision.selectedModel] || 0) + 1;
  });

  // Task type distribution
  const taskDistribution: Record<string, number> = {};
  history.forEach((decision) => {
    taskDistribution[decision.config.task] =
      (taskDistribution[decision.config.task] || 0) + 1;
  });

  // Priority distribution
  const priorityDistribution: Record<string, number> = {};
  history.forEach((decision) => {
    priorityDistribution[decision.config.priority] =
      (priorityDistribution[decision.config.priority] || 0) + 1;
  });

  // Average latency by model
  const avgLatencyByModel: Record<string, number> = {};
  Object.entries(telemetry).forEach(([model, data]) => {
    avgLatencyByModel[model] = data.avgLatencyMs;
  });

  // Cost estimates (simplified)
  const estimatedCostByModel: Record<string, number> = {};
  Object.entries(telemetry).forEach(([model, data]) => {
    estimatedCostByModel[model] = data.callCount * data.costPer1kTokens * 0.1; // Assume ~100 tokens per call
  });

  return {
    totalDecisions: history.length,
    modelUsage,
    taskDistribution,
    priorityDistribution,
    avgLatencyByModel,
    estimatedCostByModel,
    recentDecisions: history.slice(-10), // Last 10 decisions
    telemetry: Object.values(telemetry),
  };
}
