"use server";

import { generateObject } from "ai";
import { z } from "zod";
import pLimit from "p-limit";

const summarizationSchema = z.object({
  headline: z.string().describe("The headline of the article"),
  context: z.string().describe("The context of the article"),
  discussionPoints: z.string().describe("The discussion points of the article"),
  takeaways: z.string().describe("The takeaways of the article"),
});

// Configuration for chunking
const CHUNK_CONFIG = {
  MAX_COMMENTS_PER_CHUNK: 50, // Process 50 comments at a time
  MAX_TOKENS_PER_CHUNK: 8000, // Conservative token limit
  CONCURRENCY_LIMIT: 3, // Process 3 chunks in parallel
  MAX_RETRIES: 3, // Maximum retry attempts for failed chunks
  RETRY_DELAY_MS: 1000, // Initial retry delay (exponential backoff)
  IMPORTANCE_THRESHOLD: 0.6, // Only summarize comments with importance >= 0.6
};

// Schema for classifying comment importance
const importanceSchema = z.object({
  importance: z
    .number()
    .min(0)
    .max(1)
    .describe("Importance score from 0 (low) to 1 (critical)"),
  reason: z
    .string()
    .describe("Brief explanation of why this comment is important or not"),
  category: z
    .enum([
      "decision",
      "action_item",
      "question",
      "update",
      "discussion",
      "other",
    ])
    .describe("Category of the comment"),
});

type CommentImportance = z.infer<typeof importanceSchema> & {
  comment: any;
};

// Estimate token count (rough approximation: 1 token ≈ 4 characters)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

// Sleep utility for retry delays
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * CLASSIFICATION PHASE: Classify comment importance before summarization
 * Filters out low-importance comments to focus on what matters
 */
async function classifyCommentImportance(
  comments: any[]
): Promise<CommentImportance[]> {
  console.log(
    `🔍 CLASSIFICATION PHASE: Analyzing ${comments.length} comments for importance...`
  );

  const limit = pLimit(CHUNK_CONFIG.CONCURRENCY_LIMIT);
  let classified = 0;

  const classificationTasks = comments.map((comment) =>
    limit(async () => {
      try {
        const { object: importance } = await generateObject({
          model: "openai/gpt-4.1",
          schema: importanceSchema,
          prompt: `Rate the importance of this comment for creating a summary. Consider:
- Does it contain decisions or action items?
- Is it asking critical questions?
- Does it provide important updates or context?
- Is it just casual discussion or noise?

Comment: ${JSON.stringify(comment)}`,
        });

        classified++;
        if (classified % 10 === 0) {
          console.log(
            `  ✓ Classified ${classified}/${comments.length} comments`
          );
        }

        return { ...importance, comment };
      } catch (error: any) {
        // On classification error, mark as low importance (fail-safe)
        console.warn(
          `  ⚠️ Classification failed for comment, marking as low importance: ${error.message}`
        );
        return {
          importance: 0.3,
          reason: "Classification failed, defaulting to low importance",
          category: "other" as const,
          comment,
        };
      }
    })
  );

  const results = await Promise.all(classificationTasks);

  // Filter by importance threshold
  const importantComments = results.filter(
    (r: CommentImportance) => r.importance >= CHUNK_CONFIG.IMPORTANCE_THRESHOLD
  );

  console.log(
    `  ✓ Filtered to ${importantComments.length} important comments (${(
      (importantComments.length / comments.length) *
      100
    ).toFixed(1)}%)`
  );

  return importantComments;
}

// Chunk comments into manageable batches
function chunkComments(comments: any[]): any[][] {
  const chunks: any[][] = [];
  let currentChunk: any[] = [];
  let currentTokenCount = 0;

  for (const comment of comments) {
    const commentText = JSON.stringify(comment);
    const commentTokens = estimateTokens(commentText);

    // If adding this comment would exceed limits, start a new chunk
    if (
      currentChunk.length >= CHUNK_CONFIG.MAX_COMMENTS_PER_CHUNK ||
      currentTokenCount + commentTokens > CHUNK_CONFIG.MAX_TOKENS_PER_CHUNK
    ) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }
      currentChunk = [comment];
      currentTokenCount = commentTokens;
    } else {
      currentChunk.push(comment);
      currentTokenCount += commentTokens;
    }
  }

  // Add the last chunk if it has comments
  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// ============================================================================
// MAPREDUCE PATTERN IMPLEMENTATION
// ============================================================================

/**
 * MAP PHASE: Transform each chunk of comments into a summary
 * This is the "map" operation - applies the summarization function to each chunk
 * Uses p-limit for controlled parallel processing with error handling
 */
async function mapPhase(
  chunks: any[][]
): Promise<z.infer<typeof summarizationSchema>[]> {
  console.log(`📊 MAP PHASE: Processing ${chunks.length} chunks...`);

  // Create a limit function that allows CONCURRENCY_LIMIT concurrent operations
  const limit = pLimit(CHUNK_CONFIG.CONCURRENCY_LIMIT);

  // Track progress and errors
  let completed = 0;
  let failed = 0;
  const total = chunks.length;

  // Create all tasks with concurrency limit and error handling
  const tasks = chunks.map((chunk, chunkIndex) =>
    limit(async () => {
      try {
        const result = await mapChunkToSummary(chunk, chunkIndex, total);
        completed++;
        console.log(
          `  ✓ Processed chunk ${completed}/${total} (${(
            (completed / total) *
            100
          ).toFixed(1)}%)`
        );
        return { success: true, result, chunkIndex };
      } catch (error: any) {
        failed++;
        console.error(
          `  ❌ Chunk ${chunkIndex + 1} failed after all retries: ${
            error.message
          }`
        );
        // Return fallback summary
        return {
          success: false,
          result: createFallbackSummary(chunk, chunkIndex, total, error),
          chunkIndex,
        };
      }
    })
  );

  // Execute all tasks - p-limit handles concurrency automatically
  const results = await Promise.all(tasks);

  // Extract summaries and log statistics
  const chunkSummaries = results.map(
    (r: {
      success: boolean;
      result: z.infer<typeof summarizationSchema>;
      chunkIndex: number;
    }) => r.result
  );
  const successCount = results.filter(
    (r: {
      success: boolean;
      result: z.infer<typeof summarizationSchema>;
      chunkIndex: number;
    }) => r.success
  ).length;

  if (failed > 0) {
    console.warn(
      `  ⚠️ Completed with ${failed} failed chunks (${successCount}/${total} successful)`
    );
  } else {
    console.log(`  ✅ All ${total} chunks processed successfully`);
  }

  return chunkSummaries;
}

/**
 * MAP OPERATION: Transform a single chunk into a summary
 * Includes retry logic with exponential backoff
 */
async function mapChunkToSummary(
  chunk: any[],
  chunkIndex: number,
  totalChunks: number,
  retryCount: number = 0
): Promise<z.infer<typeof summarizationSchema>> {
  try {
    const { object: summary } = await generateObject({
      model: "openai/gpt-4.1",
      prompt: `Generate a summary of the following comments (chunk ${
        chunkIndex + 1
      } of ${totalChunks}): ${JSON.stringify(
        chunk
      )}. Focus on key decisions and action items.`,
      schema: summarizationSchema,
    });
    return summary;
  } catch (error: any) {
    // Retry logic with exponential backoff
    if (retryCount < CHUNK_CONFIG.MAX_RETRIES) {
      const delay = CHUNK_CONFIG.RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.warn(
        `  ⚠️ Chunk ${
          chunkIndex + 1
        } failed, retrying in ${delay}ms... (attempt ${retryCount + 1}/${
          CHUNK_CONFIG.MAX_RETRIES
        })`
      );
      await sleep(delay);
      return mapChunkToSummary(chunk, chunkIndex, totalChunks, retryCount + 1);
    }

    // After max retries, return fallback summary
    console.error(
      `  ❌ Chunk ${chunkIndex + 1} failed after ${
        CHUNK_CONFIG.MAX_RETRIES
      } retries: ${error.message}`
    );
    return createFallbackSummary(chunk, chunkIndex, totalChunks, error);
  }
}

/**
 * FALLBACK: Create a basic summary when chunk processing fails
 */
function createFallbackSummary(
  chunk: any[],
  chunkIndex: number,
  totalChunks: number,
  error: any
): z.infer<typeof summarizationSchema> {
  // Extract basic info from comments as fallback
  const commentTexts = chunk
    .map((c) => c.content || c.text || JSON.stringify(c))
    .join(" ");

  return {
    headline: `Summary of chunk ${chunkIndex + 1} (partial)`,
    context: `Unable to fully process this chunk due to: ${error.message}. Showing partial information.`,
    discussionPoints: `Comments in this chunk: ${
      chunk.length
    }. Content preview: ${commentTexts.substring(0, 200)}...`,
    takeaways: `This chunk encountered processing errors and may be incomplete. Please review manually if critical.`,
  };
}

/**
 * REDUCE PHASE: Combine multiple summaries into a single unified summary
 * This is the "reduce" operation - aggregates all chunk summaries
 */
async function reducePhase(
  summaries: z.infer<typeof summarizationSchema>[]
): Promise<z.infer<typeof summarizationSchema>> {
  console.log(`🔄 REDUCE PHASE: Combining ${summaries.length} summaries...`);

  // Base case: single summary doesn't need reduction
  if (summaries.length === 1) {
    return summaries[0];
  }

  // If we have many summaries, reduce recursively in batches
  if (summaries.length > 10) {
    // Reduce summaries in batches first (hierarchical reduction)
    const batchSize = 5;
    let reducedSummaries = summaries;

    // Use p-limit for parallel batch reduction
    const reduceLimit = pLimit(CHUNK_CONFIG.CONCURRENCY_LIMIT);

    while (reducedSummaries.length > 1) {
      const batches: z.infer<typeof summarizationSchema>[][] = [];
      for (let i = 0; i < reducedSummaries.length; i += batchSize) {
        batches.push(reducedSummaries.slice(i, i + batchSize));
      }

      // Reduce each batch in parallel with concurrency control
      const batchTasks = batches.map((batch) =>
        reduceLimit(() => reduceBatch(batch))
      );
      reducedSummaries = await Promise.all(batchTasks);
      console.log(`  ✓ Reduced to ${reducedSummaries.length} summary/ies`);
    }

    return reducedSummaries[0];
  }

  // For smaller sets, reduce directly
  return reduceBatch(summaries);
}

/**
 * REDUCE OPERATION: Combine a batch of summaries into one
 * Includes retry logic for robustness
 */
async function reduceBatch(
  summaries: z.infer<typeof summarizationSchema>[],
  retryCount: number = 0
): Promise<z.infer<typeof summarizationSchema>> {
  if (summaries.length === 1) {
    return summaries[0];
  }

  try {
    // Format summaries for combination
    const combinedText = summaries
      .map(
        (s, i) => `Summary ${i + 1}:
Headline: ${s.headline}
Context: ${s.context}
Discussion Points: ${s.discussionPoints}
Takeaways: ${s.takeaways}`
      )
      .join("\n\n---\n\n");

    const { object: finalSummary } = await generateObject({
      model: "openai/gpt-4.1",
      prompt: `Combine the following summaries into a single comprehensive summary. Focus on the most important points, decisions, and action items across all summaries:

${combinedText}

Generate a unified summary that captures the key themes, decisions, and action items from all the summaries. Eliminate redundancy and highlight the most critical information.`,
      schema: summarizationSchema,
    });

    return finalSummary;
  } catch (error: any) {
    // Retry logic for reduce phase
    if (retryCount < CHUNK_CONFIG.MAX_RETRIES) {
      const delay = CHUNK_CONFIG.RETRY_DELAY_MS * Math.pow(2, retryCount);
      console.warn(
        `  ⚠️ Reduce batch failed, retrying in ${delay}ms... (attempt ${
          retryCount + 1
        }/${CHUNK_CONFIG.MAX_RETRIES})`
      );
      await sleep(delay);
      return reduceBatch(summaries, retryCount + 1);
    }

    // Fallback: combine summaries manually if AI fails
    console.error(
      `  ❌ Reduce batch failed after ${CHUNK_CONFIG.MAX_RETRIES} retries, using fallback`
    );
    return {
      headline: `Combined Summary (${summaries.length} chunks)`,
      context: summaries
        .map((s) => s.context)
        .join(" ")
        .substring(0, 500),
      discussionPoints: summaries
        .map((s) => s.discussionPoints)
        .join("\n")
        .substring(0, 1000),
      takeaways: summaries
        .map((s) => s.takeaways)
        .join("\n")
        .substring(0, 1000),
    };
  }
}

// Main summarization function with selective summarization and error handling
export const generateSummary = async (comments: any[]) => {
  console.log("Generating summary for", comments.length, "comments...");

  // Handle empty comments
  if (comments.length === 0) {
    throw new Error("Cannot generate summary from empty comments array");
  }

  try {
    // CLASSIFICATION PHASE: Filter comments by importance
    const importantComments = await classifyCommentImportance(comments);

    if (importantComments.length === 0) {
      console.warn("⚠️ No important comments found, summarizing all comments");
      // Fallback: use all comments if none are marked important
      importantComments.push(
        ...comments.map((c) => ({
          importance: 0.5,
          reason: "Included as fallback",
          category: "other" as const,
          comment: c,
        }))
      );
    }

    // Extract just the comment objects for processing
    const commentsToSummarize = importantComments.map((ci) => ci.comment);

    // If we have a small number of comments, process directly
    if (commentsToSummarize.length <= CHUNK_CONFIG.MAX_COMMENTS_PER_CHUNK) {
      try {
        const { object: summary } = await generateObject({
          model: "openai/gpt-4.1",
          prompt: `Generate a summary of the following comments: ${JSON.stringify(
            commentsToSummarize
          )}. Focus on key decisions and action items.`,
          schema: summarizationSchema,
        });
        console.log("✅ Summary:", summary.headline);
        return summary;
      } catch (error: any) {
        console.error("Error generating summary:", error.message);
        throw error;
      }
    }

    // For large comment sets, use MapReduce pattern
    console.log("📦 Large comment set detected, using MapReduce pattern...");
    const chunks = chunkComments(commentsToSummarize);
    console.log(`   Split into ${chunks.length} chunks`);

    // MAP PHASE: Transform each chunk into a summary
    const chunkSummaries = await mapPhase(chunks);

    // REDUCE PHASE: Combine all summaries into final summary
    const finalSummary = await reducePhase(chunkSummaries);
    console.log("✅ Final summary generated:", finalSummary.headline);

    return finalSummary;
  } catch (error: any) {
    console.error("❌ Summarization failed:", error.message);
    // Return a basic fallback summary
    return {
      headline: "Summary Generation Failed",
      context: `Unable to generate summary: ${error.message}`,
      discussionPoints: `Please try again or review the comments manually. Error: ${error.message}`,
      takeaways:
        "Summary generation encountered an error. The comments may need manual review.",
    };
  }
};
