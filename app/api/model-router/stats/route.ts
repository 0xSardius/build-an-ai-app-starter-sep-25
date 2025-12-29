import { NextResponse } from "next/server";
import { getRoutingStats } from "@/lib/model-router";

export async function GET() {
  try {
    const stats = getRoutingStats();
    
    // Format data for visualization
    const visualizationData = {
      summary: {
        totalDecisions: stats.totalDecisions,
        uniqueModels: Object.keys(stats.modelUsage).length,
        dateRange: stats.recentDecisions.length > 0
          ? {
              start: new Date(Math.min(...stats.recentDecisions.map(d => d.timestamp))).toISOString(),
              end: new Date(Math.max(...stats.recentDecisions.map(d => d.timestamp))).toISOString(),
            }
          : null,
      },
      
      // Model usage data (for pie/bar charts)
      modelUsage: Object.entries(stats.modelUsage)
        .map(([model, count]) => ({
          model,
          count,
          percentage: stats.totalDecisions > 0 
            ? ((count / stats.totalDecisions) * 100).toFixed(1) 
            : "0",
        }))
        .sort((a, b) => b.count - a.count),
      
      // Task distribution (for bar chart)
      taskDistribution: Object.entries(stats.taskDistribution)
        .map(([task, count]) => ({
          task,
          count,
        }))
        .sort((a, b) => b.count - a.count),
      
      // Priority distribution
      priorityDistribution: Object.entries(stats.priorityDistribution)
        .map(([priority, count]) => ({
          priority,
          count,
        })),
      
      // Performance metrics
      performance: Object.entries(stats.avgLatencyByModel)
        .map(([model, latency]) => ({
          model,
          avgLatencyMs: Math.round(latency),
          callCount: stats.modelUsage[model] || 0,
        }))
        .sort((a, b) => a.avgLatencyMs - b.avgLatencyMs),
      
      // Cost analysis
      costAnalysis: Object.entries(stats.estimatedCostByModel)
        .map(([model, cost]) => ({
          model,
          estimatedCost: parseFloat(cost.toFixed(4)),
          callCount: stats.modelUsage[model] || 0,
          costPerCall: stats.modelUsage[model] > 0
            ? parseFloat((cost / stats.modelUsage[model]).toFixed(6))
            : 0,
        }))
        .sort((a, b) => b.estimatedCost - a.estimatedCost),
      
      // Recent decisions timeline
      timeline: stats.recentDecisions.map((decision) => ({
        timestamp: decision.timestamp,
        date: new Date(decision.timestamp).toISOString(),
        model: decision.selectedModel,
        task: decision.config.task,
        priority: decision.config.priority,
        reason: decision.reason,
      })),
      
      // Model comparison matrix
      modelComparison: stats.telemetry.map((t) => ({
        model: t.model,
        avgLatencyMs: Math.round(t.avgLatencyMs),
        costPer1kTokens: t.costPer1kTokens,
        successRate: (t.successRate * 100).toFixed(1),
        callCount: t.callCount,
        capabilityTier: t.capabilityTier,
      })),
    };
    
    return NextResponse.json(visualizationData, {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("Error fetching routing stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch routing statistics", message: error.message },
      { status: 500 }
    );
  }
}





