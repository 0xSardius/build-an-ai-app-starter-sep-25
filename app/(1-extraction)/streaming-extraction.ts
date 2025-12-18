import dotenvFlow from "dotenv-flow";
dotenvFlow.config();
import fs from "fs";
import path from "path";
import { generateObject } from "ai";
import { z } from "zod";

// Configuration
const CONFIG = {
  // Context limits (tokens) - adjust based on your model
  // GPT-4.1 typically has ~128k context, but we'll use smaller chunks for safety
  MAX_CHUNK_TOKENS: 8000, // Conservative chunk size
  OVERLAP_TOKENS: 200, // Overlap between chunks to maintain context
  CHUNK_SIZE_CHARS: 16000, // Approximate character count (roughly 4 chars per token)
  STATE_FILE: "app/(1-extraction)/.extraction-state.json",
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
};

// Extraction schema (simplified version for chunk processing)
const chunkExtractionSchema = z.object({
  people: z
    .array(
      z.object({
        name: z.string(),
        role: z.string().nullable(),
        company: z.string().nullable(),
        context: z.string().optional(),
      })
    )
    .describe("People mentioned in this chunk"),
  companies: z.array(z.string()).describe("Companies mentioned in this chunk"),
  keyConcepts: z.array(z.string()).describe("Key concepts in this chunk"),
  relationships: z
    .array(
      z.object({
        person1: z.string(),
        person2: z.string(),
        relationshipType: z.string(),
        evidence: z.string(),
      })
    )
    .optional()
    .describe("Relationships found in this chunk"),
});

// Final aggregated schema
const aggregatedSchema = z.object({
  people: z.array(
    z.object({
      name: z.string(),
      role: z.string().nullable(),
      company: z.string().nullable(),
      context: z.string().optional(),
      chunks: z
        .array(z.number())
        .describe("Chunk indices where this person appeared"),
    })
  ),
  companies: z.array(
    z.object({
      name: z.string(),
      chunks: z
        .array(z.number())
        .describe("Chunk indices where this company appeared"),
    })
  ),
  keyConcepts: z.array(
    z.object({
      concept: z.string(),
      chunks: z
        .array(z.number())
        .describe("Chunk indices where this concept appeared"),
    })
  ),
  relationships: z.array(
    z.object({
      person1: z.string(),
      person2: z.string(),
      relationshipType: z.string(),
      evidence: z.string(),
      chunks: z
        .array(z.number())
        .describe("Chunk indices where this relationship appeared"),
    })
  ),
  summary: z.string().describe("Overall summary of the document"),
});

// State management for resumable processing
interface ProcessingState {
  filePath: string;
  totalChunks: number;
  completedChunks: number[];
  failedChunks: number[];
  chunkResults: Record<number, any>;
  startTime: number;
  lastUpdate: number;
}

function loadState(filePath: string): ProcessingState | null {
  try {
    if (fs.existsSync(CONFIG.STATE_FILE)) {
      const state = JSON.parse(fs.readFileSync(CONFIG.STATE_FILE, "utf-8"));
      // Verify state is for the same file
      if (state.filePath === filePath) {
        return state;
      }
    }
  } catch (error) {
    console.warn("Failed to load state:", error);
  }
  return null;
}

function saveState(state: ProcessingState): void {
  try {
    fs.writeFileSync(CONFIG.STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.warn("Failed to save state:", error);
  }
}

function clearState(): void {
  try {
    if (fs.existsSync(CONFIG.STATE_FILE)) {
      fs.unlinkSync(CONFIG.STATE_FILE);
    }
  } catch (error) {
    console.warn("Failed to clear state:", error);
  }
}

// Chunk text intelligently (respects sentence boundaries)
function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunkEnd = end;

    // Try to break at sentence boundary if not at end of text
    if (end < text.length) {
      const lastPeriod = text.lastIndexOf(".", end);
      const lastNewline = text.lastIndexOf("\n", end);
      const breakPoint = Math.max(lastPeriod, lastNewline);

      if (breakPoint > start + chunkSize * 0.5) {
        // Only break if we're not too close to start
        chunkEnd = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, chunkEnd).trim());

    // Move start position with overlap
    start = chunkEnd - overlap;
    if (start <= 0) start = chunkEnd; // Prevent infinite loop
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

// Progress bar visualization
function updateProgress(
  current: number,
  total: number,
  chunkIndex: number,
  status: string = "processing"
): void {
  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * 40);
  const bar = "█".repeat(filled) + "░".repeat(40 - filled);
  const statusEmoji =
    status === "processing" ? "🔄" : status === "error" ? "❌" : "✅";

  process.stdout.write(
    `\r${statusEmoji} [${bar}] ${percentage}% | Chunk ${
      chunkIndex + 1
    }/${total} | ${status}`
  );
}

// Extract from a single chunk with streaming
async function extractChunk(
  chunkText: string,
  chunkIndex: number,
  totalChunks: number,
  retryCount: number = 0
): Promise<any> {
  try {
    updateProgress(chunkIndex, totalChunks, chunkIndex, "processing");

    // Use streamText for streaming, but we'll collect the full result
    // In a real scenario, you might want to stream to UI
    const result = await generateObject({
      model: "openai/gpt-4.1",
      schema: chunkExtractionSchema,
      prompt: `Extract key information from this document chunk. This is chunk ${
        chunkIndex + 1
      } of ${totalChunks}.

Extract:
- All people mentioned (names, roles, companies)
- All companies and organizations
- Key concepts and ideas
- Relationships between people (if any)

Chunk text:
${chunkText}`,
    });

    updateProgress(chunkIndex + 1, totalChunks, chunkIndex, "completed");
    return result.object;
  } catch (error: any) {
    if (retryCount < CONFIG.MAX_RETRIES) {
      console.log(
        `\n⚠️  Chunk ${chunkIndex + 1} failed, retrying... (${retryCount + 1}/${
          CONFIG.MAX_RETRIES
        })`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, CONFIG.RETRY_DELAY_MS)
      );
      return extractChunk(chunkText, chunkIndex, totalChunks, retryCount + 1);
    }

    updateProgress(chunkIndex, totalChunks, chunkIndex, "error");
    console.log(
      `\n❌ Chunk ${chunkIndex + 1} failed after ${CONFIG.MAX_RETRIES} retries`
    );

    // Fallback: return a summary instead of structured extraction
    try {
      const fallbackResult = await generateObject({
        model: "openai/gpt-4.1",
        schema: z.object({
          summary: z.string().describe("Summary of the chunk content"),
          people: z.array(z.string()).optional(),
          companies: z.array(z.string()).optional(),
        }),
        prompt: `Provide a brief summary of this document chunk and list any people or companies mentioned.

Chunk text:
${chunkText}`,
      });

      return {
        people: (fallbackResult.object.people || []).map((name: string) => ({
          name,
          role: null,
          company: null,
        })),
        companies: fallbackResult.object.companies || [],
        keyConcepts: [],
        relationships: [],
        summary: fallbackResult.object.summary,
      };
    } catch (fallbackError) {
      // Last resort: return empty structure
      return {
        people: [],
        companies: [],
        keyConcepts: [],
        relationships: [],
        summary: `Chunk ${chunkIndex + 1} processing failed: ${error.message}`,
      };
    }
  }
}

// Map phase: Process all chunks
async function mapPhase(
  chunks: string[],
  state: ProcessingState
): Promise<Record<number, any>> {
  const results: Record<number, any> = { ...state.chunkResults };

  // Process chunks in parallel (with concurrency limit)
  const CONCURRENCY_LIMIT = 3;
  const chunksToProcess: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (!state.completedChunks.includes(i) && !state.failedChunks.includes(i)) {
      chunksToProcess.push(i);
    }
  }

  // Process in batches
  for (let i = 0; i < chunksToProcess.length; i += CONCURRENCY_LIMIT) {
    const batch = chunksToProcess.slice(i, i + CONCURRENCY_LIMIT);
    const promises = batch.map(async (chunkIndex) => {
      try {
        const result = await extractChunk(
          chunks[chunkIndex],
          chunkIndex,
          chunks.length
        );
        results[chunkIndex] = result;
        state.completedChunks.push(chunkIndex);
        state.chunkResults[chunkIndex] = result;
        state.lastUpdate = Date.now();
        saveState(state);
        return { chunkIndex, success: true };
      } catch (error: any) {
        state.failedChunks.push(chunkIndex);
        saveState(state);
        return { chunkIndex, success: false, error: error.message };
      }
    });

    await Promise.all(promises);
  }

  return results;
}

// Reduce phase: Aggregate results from all chunks
async function reducePhase(
  chunkResults: Record<number, any>,
  totalChunks: number
): Promise<any> {
  console.log("\n\n🔄 Aggregating results from all chunks...");

  // Aggregate people (deduplicate by name)
  const peopleMap = new Map<string, any>();
  const companiesMap = new Map<string, Set<number>>();
  const conceptsMap = new Map<string, Set<number>>();
  const relationshipsMap = new Map<string, any>();

  Object.entries(chunkResults).forEach(([chunkIndexStr, result]) => {
    const chunkIndex = parseInt(chunkIndexStr);

    // Aggregate people
    result.people?.forEach((person: any) => {
      const key = person.name.toLowerCase();
      if (!peopleMap.has(key)) {
        peopleMap.set(key, {
          ...person,
          chunks: [chunkIndex],
        });
      } else {
        const existing = peopleMap.get(key);
        // Merge information, update chunks
        if (!existing.chunks.includes(chunkIndex)) {
          existing.chunks.push(chunkIndex);
        }
        // Update with more complete info if available
        if (!existing.role && person.role) existing.role = person.role;
        if (!existing.company && person.company)
          existing.company = person.company;
        if (!existing.context && person.context)
          existing.context = person.context;
      }
    });

    // Aggregate companies
    result.companies?.forEach((company: string) => {
      const key = company.toLowerCase();
      if (!companiesMap.has(key)) {
        companiesMap.set(key, new Set([chunkIndex]));
      } else {
        companiesMap.get(key)!.add(chunkIndex);
      }
    });

    // Aggregate concepts
    result.keyConcepts?.forEach((concept: string) => {
      const key = concept.toLowerCase();
      if (!conceptsMap.has(key)) {
        conceptsMap.set(key, new Set([chunkIndex]));
      } else {
        conceptsMap.get(key)!.add(chunkIndex);
      }
    });

    // Aggregate relationships
    result.relationships?.forEach((rel: any) => {
      const key = `${rel.person1.toLowerCase()}-${rel.person2.toLowerCase()}-${
        rel.relationshipType
      }`;
      if (!relationshipsMap.has(key)) {
        relationshipsMap.set(key, {
          ...rel,
          chunks: [chunkIndex],
        });
      } else {
        const existing = relationshipsMap.get(key);
        if (!existing.chunks.includes(chunkIndex)) {
          existing.chunks.push(chunkIndex);
        }
        // Merge evidence
        if (rel.evidence && !existing.evidence.includes(rel.evidence)) {
          existing.evidence += `; ${rel.evidence}`;
        }
      }
    });
  });

  // Convert maps to arrays
  // Store original names for companies and concepts
  const companyOriginalNames = new Map<string, string>();
  const conceptOriginalNames = new Map<string, string>();

  Object.entries(chunkResults).forEach(([, result]) => {
    result.companies?.forEach((company: string) => {
      const key = company.toLowerCase();
      if (!companyOriginalNames.has(key)) {
        companyOriginalNames.set(key, company);
      }
    });
    result.keyConcepts?.forEach((concept: string) => {
      const key = concept.toLowerCase();
      if (!conceptOriginalNames.has(key)) {
        conceptOriginalNames.set(key, concept);
      }
    });
  });

  const aggregated = {
    people: Array.from(peopleMap.values()),
    companies: Array.from(companiesMap.entries()).map(([key, chunks]) => ({
      name: companyOriginalNames.get(key) || key,
      chunks: Array.from(chunks),
    })),
    keyConcepts: Array.from(conceptsMap.entries()).map(([key, chunks]) => ({
      concept: conceptOriginalNames.get(key) || key,
      chunks: Array.from(chunks),
    })),
    relationships: Array.from(relationshipsMap.values()),
  };

  // Generate final summary using map/reduce pattern
  console.log("📝 Generating final summary...");
  const summaries = Object.values(chunkResults)
    .map((r: any) => r.summary)
    .filter((s: string) => s);

  let finalSummary = "";
  if (summaries.length > 0) {
    // If we have too many summaries, reduce them first
    if (summaries.length > 10) {
      // Reduce summaries in batches
      const batchSize = 5;
      let reducedSummaries = summaries;
      while (reducedSummaries.length > 1) {
        const batches = [];
        for (let i = 0; i < reducedSummaries.length; i += batchSize) {
          batches.push(reducedSummaries.slice(i, i + batchSize));
        }
        reducedSummaries = await Promise.all(
          batches.map(async (batch) => {
            const result = await generateObject({
              model: "openai/gpt-4.1",
              schema: z.object({
                summary: z.string().describe("Combined summary"),
              }),
              prompt: `Combine these summaries into a single coherent summary:

${batch.join("\n\n")}`,
            });
            return result.object.summary;
          })
        );
      }
      finalSummary = reducedSummaries[0];
    } else {
      const result = await generateObject({
        model: "openai/gpt-4.1",
        schema: z.object({
          summary: z.string().describe("Final comprehensive summary"),
        }),
        prompt: `Create a comprehensive summary that combines all these chunk summaries:

${summaries.join("\n\n")}`,
      });
      finalSummary = result.object.summary;
    }
  }

  return {
    ...aggregated,
    summary: finalSummary,
  };
}

// Main processing function
async function processDocument(
  filePath: string,
  resume: boolean = true
): Promise<void> {
  console.log("🚀 Starting Streaming Extraction Pipeline\n");
  console.log("=".repeat(70));

  // Load or create state
  let state: ProcessingState | null = null;
  if (resume) {
    state = loadState(filePath);
    if (state) {
      console.log(`📂 Resuming from previous session...`);
      console.log(
        `   Completed: ${state.completedChunks.length}/${state.totalChunks} chunks`
      );
      console.log(`   Failed: ${state.failedChunks.length} chunks`);
    }
  }

  // Read file
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  const fileSizeMB = (fileContent.length / (1024 * 1024)).toFixed(2);
  console.log(`📄 File: ${filePath}`);
  console.log(
    `📊 Size: ${fileSizeMB} MB (${fileContent.length.toLocaleString()} characters)\n`
  );

  // Chunk the text
  const chunks = chunkText(
    fileContent,
    CONFIG.CHUNK_SIZE_CHARS,
    CONFIG.OVERLAP_TOKENS * 4
  );
  console.log(`📦 Split into ${chunks.length} chunks\n`);

  // Initialize or update state
  if (!state) {
    state = {
      filePath,
      totalChunks: chunks.length,
      completedChunks: [],
      failedChunks: [],
      chunkResults: {},
      startTime: Date.now(),
      lastUpdate: Date.now(),
    };
  } else {
    state.totalChunks = chunks.length; // Update in case file changed
  }

  // Memory tracking
  const memoryBefore = process.memoryUsage();
  console.log(
    `💾 Memory before: ${(memoryBefore.heapUsed / 1024 / 1024).toFixed(2)} MB\n`
  );

  try {
    // MAP PHASE: Process all chunks
    console.log("🔄 MAP PHASE: Processing chunks...\n");
    const chunkResults = await mapPhase(chunks, state);

    // REDUCE PHASE: Aggregate results
    console.log("\n\n🔄 REDUCE PHASE: Aggregating results...\n");
    const finalResults = await reducePhase(chunkResults, chunks.length);

    // Display results
    console.log("\n\n" + "=".repeat(70));
    console.log("✅ EXTRACTION COMPLETE\n");
    console.log("=".repeat(70));

    console.log(`\n👥 People Found: ${finalResults.people.length}`);
    console.log(`🏢 Companies Found: ${finalResults.companies.length}`);
    console.log(`💡 Concepts Found: ${finalResults.keyConcepts.length}`);
    console.log(`🔗 Relationships Found: ${finalResults.relationships.length}`);

    // Memory tracking
    const memoryAfter = process.memoryUsage();
    const memoryUsed =
      (memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024;
    console.log(`\n💾 Memory used: ${memoryUsed.toFixed(2)} MB`);
    console.log(
      `⏱️  Total time: ${((Date.now() - state.startTime) / 1000).toFixed(2)}s`
    );

    // Save final results
    const outputPath = filePath.replace(/\.txt$/, "-extracted.json");
    fs.writeFileSync(outputPath, JSON.stringify(finalResults, null, 2));
    console.log(`\n💾 Results saved to: ${outputPath}`);

    // Clear state on success
    clearState();
    console.log("\n✅ Processing complete!");
  } catch (error: any) {
    console.error("\n❌ Processing failed:", error.message);
    console.log(
      "\n💾 State saved. Run with resume=true to continue from last checkpoint."
    );
    throw error;
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);

  // Help message
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`
🚀 Streaming Extraction Pipeline

Usage:
  pnpm run extraction:streaming [file-path] [options]

Arguments:
  file-path          Path to the document to process (default: app/(1-extraction)/essay.txt)

Options:
  --resume, -r       Resume from last checkpoint if processing was interrupted
  --help, -h         Show this help message

Examples:
  pnpm run extraction:streaming
  pnpm run extraction:streaming large-document.txt
  pnpm run extraction:streaming large-document.txt --resume

Features:
  ✅ Chunked processing for large documents (handles 100+ page PDFs)
  ✅ Map/reduce pattern for efficient aggregation
  ✅ Resumable processing (saves state, can resume after crashes)
  ✅ Progress tracking with visual indicators
  ✅ Automatic retry with fallback summarization
  ✅ Memory and runtime benchmarking
  ✅ Respects context limits with intelligent chunking
`);
    process.exit(0);
  }

  const filePath =
    args.find((arg) => !arg.startsWith("--") && !arg.startsWith("-")) ||
    "app/(1-extraction)/essay.txt";
  const resume = args.includes("--resume") || args.includes("-r");

  try {
    await processDocument(filePath, resume);
  } catch (error: any) {
    console.error("\n❌ Error:", error.message);
    if (error.stack) {
      console.error("\nStack trace:", error.stack);
    }
    process.exit(1);
  }
}

main();
