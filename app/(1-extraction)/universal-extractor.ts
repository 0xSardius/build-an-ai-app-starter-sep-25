import dotenvFlow from "dotenv-flow";
dotenvFlow.config();
import fs from "fs";
import { generateObject } from "ai";
import { z } from "zod";

// Import essay
const essay = fs.readFileSync("app/(1-extraction)/essay.txt", "utf-8");

// Define a comprehensive schema for universal extraction
const universalExtractionSchema = z.object({
  // People: Names of individuals mentioned
  people: z
    .array(z.string())
    .describe("All person names mentioned in the text"),

  // Companies: Organization names
  companies: z.array(z.string()).describe("All company and organization names"),

  // Quotes: Direct quotations with speakers
  quotes: z
    .array(
      z.object({
        text: z.string().describe("The exact quote text"),
        speaker: z
          .string()
          .nullable()
          .describe("Who said it, or null if unknown"),
        context: z
          .string()
          .optional()
          .describe("Brief context about when/where it was said"),
      })
    )
    .describe("All direct quotations from the text"),

  // Concepts: Categorized by type
  concepts: z
    .object({
      business: z
        .array(z.string())
        .describe("Business concepts, strategies, or ideas"),
      technical: z.array(z.string()).describe("Technical terms or concepts"),
      management: z
        .array(z.string())
        .describe("Management practices or methodologies"),
    })
    .describe("Key concepts organized by category"),

  // Dates: Temporal references
  dates: z
    .array(
      z.object({
        date: z.string().describe("The date or time reference"),
        context: z
          .string()
          .describe("What happened or was mentioned on this date"),
      })
    )
    .describe("All dates and time references mentioned"),

  // Locations: Places mentioned
  locations: z
    .array(z.string())
    .describe("Geographic locations, places, or venues"),

  // Key statements: Important claims or assertions
  keyStatements: z
    .array(
      z.object({
        statement: z.string().describe("The key statement or claim"),
        category: z
          .enum(["fact", "opinion", "prediction", "advice"])
          .describe("Type of statement"),
      })
    )
    .describe("Important statements, claims, or assertions"),

  // References: Citations or footnotes
  references: z
    .array(
      z.object({
        marker: z.string().describe("Reference marker (e.g., [1], [2])"),
        content: z.string().describe("The reference content or footnote"),
      })
    )
    .describe("All citations, footnotes, or references"),

  // Relationships: Connections between entities
  relationships: z
    .array(
      z.object({
        entity1: z.string().describe("First entity in the relationship"),
        relationship: z.string().describe("Type of relationship"),
        entity2: z.string().describe("Second entity in the relationship"),
      })
    )
    .optional()
    .describe("Relationships between people, companies, or concepts"),
});

async function main() {
  console.log("🔍 Universal Extractor - Extracting multiple data types...\n");
  console.log("=".repeat(60));

  const result = await generateObject({
    model: "openai/gpt-4.1",
    schema: universalExtractionSchema,
    prompt: `Extract all relevant information from the following essay. 
    
    Extract:
    - All person names (founders, executives, historical figures)
    - All company and organization names
    - All direct quotes with their speakers
    - Key concepts categorized as business, technical, or management
    - All dates and time references
    - Geographic locations and venues
    - Important statements categorized by type (fact, opinion, prediction, advice)
    - All citations and references
    - Relationships between entities (e.g., "Brian Chesky" works at "Airbnb")
    
    Be thorough and include both explicit mentions and clear implied references.
    
    Essay:
    ${essay}`,
  });

  // Display results in a structured, readable format
  console.log("\n📋 EXTRACTION RESULTS\n");
  console.log("=".repeat(60));

  // People
  if (result.object.people.length > 0) {
    console.log("\n👥 PEOPLE:");
    console.log("-".repeat(60));
    result.object.people.forEach((name, i) => {
      console.log(`  ${i + 1}. ${name}`);
    });
  }

  // Companies
  if (result.object.companies.length > 0) {
    console.log("\n🏢 COMPANIES:");
    console.log("-".repeat(60));
    result.object.companies.forEach((company, i) => {
      console.log(`  ${i + 1}. ${company}`);
    });
  }

  // Quotes
  if (result.object.quotes.length > 0) {
    console.log("\n💬 QUOTES:");
    console.log("-".repeat(60));
    result.object.quotes.forEach((quote, i) => {
      console.log(`  ${i + 1}. "${quote.text}"`);
      if (quote.speaker) {
        console.log(`     — ${quote.speaker}`);
      }
      if (quote.context) {
        console.log(`     Context: ${quote.context}`);
      }
      console.log();
    });
  }

  // Concepts
  console.log("\n💡 CONCEPTS:");
  console.log("-".repeat(60));
  if (result.object.concepts.business.length > 0) {
    console.log("\n  Business Concepts:");
    result.object.concepts.business.forEach((concept, i) => {
      console.log(`    ${i + 1}. ${concept}`);
    });
  }
  if (result.object.concepts.technical.length > 0) {
    console.log("\n  Technical Concepts:");
    result.object.concepts.technical.forEach((concept, i) => {
      console.log(`    ${i + 1}. ${concept}`);
    });
  }
  if (result.object.concepts.management.length > 0) {
    console.log("\n  Management Concepts:");
    result.object.concepts.management.forEach((concept, i) => {
      console.log(`    ${i + 1}. ${concept}`);
    });
  }

  // Dates
  if (result.object.dates.length > 0) {
    console.log("\n📅 DATES:");
    console.log("-".repeat(60));
    result.object.dates.forEach((date, i) => {
      console.log(`  ${i + 1}. ${date.date}`);
      console.log(`     ${date.context}`);
      console.log();
    });
  }

  // Locations
  if (result.object.locations.length > 0) {
    console.log("\n📍 LOCATIONS:");
    console.log("-".repeat(60));
    result.object.locations.forEach((location, i) => {
      console.log(`  ${i + 1}. ${location}`);
    });
  }

  // Key Statements
  if (result.object.keyStatements.length > 0) {
    console.log("\n✨ KEY STATEMENTS:");
    console.log("-".repeat(60));
    result.object.keyStatements.forEach((stmt, i) => {
      console.log(`  ${i + 1}. [${stmt.category.toUpperCase()}]`);
      console.log(`     ${stmt.statement}`);
      console.log();
    });
  }

  // References
  if (result.object.references.length > 0) {
    console.log("\n📚 REFERENCES:");
    console.log("-".repeat(60));
    result.object.references.forEach((ref, i) => {
      console.log(`  ${ref.marker}: ${ref.content}`);
    });
  }

  // Relationships
  if (result.object.relationships && result.object.relationships.length > 0) {
    console.log("\n🔗 RELATIONSHIPS:");
    console.log("-".repeat(60));
    result.object.relationships.forEach((rel, i) => {
      console.log(
        `  ${i + 1}. ${rel.entity1} --[${rel.relationship}]--> ${rel.entity2}`
      );
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("\n✅ Extraction complete!");

  // Also output as JSON for programmatic use
  console.log("\n📄 JSON Output (for programmatic use):");
  console.log(JSON.stringify(result.object, null, 2));
}

main().catch((error) => {
  console.log("Extraction failed:", error.message);
  console.log("\nCommon Issues:");
  console.log("1. Check API key configuration");
  console.log("2. Verify essay.txt exists at app/(1-extraction)/essay.txt");
  console.log("3. Ensure you have internet connectivity for API calls");
  process.exit(1);
});
