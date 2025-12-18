import dotenvFlow from "dotenv-flow";
dotenvFlow.config();
import fs from "fs";
import { generateText, generateObject } from "ai";
import { z } from "zod";

// import essay
const essay = fs.readFileSync("app/(1-extraction)/essay.txt", "utf-8");

const companyPrompt = `Extract all the company names from this essay. Include both explicit mentions and implied references. (e.g., "the startup" referring to a previously mentioned company). Essay: ${essay}`;

const conceptPrompt = `Identify the main business concepts and related technical terms used in this essay. Categorize them as either "business" or "techincal concepts." Format as JSON: { "business": ["concept1", "concept2"], "technical": ["term1", "term2"] }. Essay: ${essay}`;

const quotePrompt = `Extract all the quotes (text in quotation marks) from this essay. For each quote, identify who said it if mentioned. Format as a JSON array: [{ "quotes": ["quote1", "quote2"], "speaker": "speaker1" }, { "quotes": ["quote3", "quote4"], "speaker": "speaker2" }]. Essay: ${essay}`;

const fewShotPrompt = `Extract all the company names from this essay. Include both explicit mentions and implied references. (e.g., "the startup" referring to a previously mentioned company). Essay: ${essay}`;

const fewShotPromptWithNames = `Extract all names from this essay. Fomat like this:
  Example:
  Name: John Doe
  Role: CEO
  Company: Acme Inc.
  Context: John Doe is the CEO of Acme Inc.
  Essay: ${essay}
`;

const fewShotPromptWithStructuredOutput = `Extract all the company names, and people names from this essay. Include both explicit mentions and implied references. (e.g., "the startup" referring to a previously mentioned company). Format as JSON: { "companies": ["company1", "company2"], "people": ["person1", "person2"] }. Essay: ${essay}`;

// Schema for social/professional network extraction
const networkExtractionSchema = z.object({
  people: z
    .array(
      z.object({
        name: z.string().describe("Full name of the person"),
        role: z
          .string()
          .nullable()
          .describe(
            "Their professional role or title (e.g., CEO, Founder, VC)"
          ),
        company: z
          .string()
          .nullable()
          .describe("Company or organization they're associated with"),
        context: z
          .string()
          .optional()
          .describe("Additional context about this person from the text"),
        mentionedAs: z
          .string()
          .optional()
          .describe("How they were referred to (e.g., 'founder', 'executive')"),
      })
    )
    .describe("All people mentioned in the text with their attributes"),

  relationships: z
    .array(
      z.object({
        person1: z.string().describe("First person in the relationship"),
        person2: z.string().describe("Second person in the relationship"),
        relationshipType: z
          .enum([
            "colleague",
            "mentor",
            "mentee",
            "founder_of",
            "investor_in",
            "advisor_to",
            "studied_by",
            "influenced_by",
            "peer",
            "acquaintance",
            "event_participant",
            "other",
          ])
          .describe("Type of relationship between the two people"),
        direction: z
          .enum(["bidirectional", "person1_to_person2", "person2_to_person1"])
          .describe("Direction of the relationship"),
        strength: z
          .enum(["strong", "moderate", "weak", "implied"])
          .describe("Strength of the relationship based on evidence in text"),
        evidence: z
          .string()
          .describe(
            "The specific text or context that indicates this relationship"
          ),
        context: z
          .string()
          .optional()
          .describe(
            "Additional context about when/where this relationship was mentioned"
          ),
      })
    )
    .describe("All relationships between people mentioned in the text"),

  networkClusters: z
    .array(
      z.object({
        name: z
          .string()
          .describe(
            "Name of the cluster (e.g., 'YC Founders', 'Apple Leadership')"
          ),
        members: z
          .array(z.string())
          .describe("People who belong to this cluster"),
        commonAttribute: z
          .string()
          .describe(
            "What connects these people (e.g., same company, same role, same event)"
          ),
      })
    )
    .optional()
    .describe(
      "Groups or clusters of people who share common attributes or contexts"
    ),
});

const smartNameExtractorPrompt = `Extract all people and their relationships from this essay to build a comprehensive social/professional network.

PERSON EXTRACTION:
1. Identify ALL people mentioned, including:
   - Founders and executives (e.g., CEOs, CTOs, VPs)
   - Investors and advisors (VCs, angels, board members)
   - Historical figures and role models
   - Authors, speakers, and event participants
   - Any individuals referenced by name or clear description

2. For each person, capture:
   - Full name (use the most complete form mentioned)
   - Professional role/title if stated (e.g., "CEO of Airbnb", "Founder", "VC")
   - Company or organization affiliation
   - Context clues about their background or significance
   - How they're referred to in the text (e.g., "founder", "executive", "investor")

RELATIONSHIP INFERENCE:
3. Analyze connections between people by identifying:
   - DIRECT professional relationships:
     * Colleagues (work at same company)
     * Co-founders or founding team members
     * Investor-investee (funding relationships)
     * Advisor-advisee (advisory relationships)
     * Manager-subordinate (hierarchical relationships)
   
   - LEARNING/INFLUENCE relationships:
     * Mentor-mentee (guidance relationships)
     * Studied by / influenced by (learning from someone)
     * Role model relationships
   
   - SOCIAL/CONTEXTUAL relationships:
     * Peers (similar roles or status)
     * Event participants (attended same event)
     * Community members (same group, organization, or network)
     * Acquaintances (mentioned together in context)
   
   - IMPLIED relationships (infer from context):
     * "Founders we've funded" → investor-founder relationship
     * "Studied how X ran Y" → learning/influence relationship
     * "At a YC event" → event participant relationship
     * Same company mentioned → potential colleague relationship

4. For each relationship, determine:
   - Relationship type: Use the most specific category that accurately describes the connection
   - Direction: 
     * "bidirectional" if mutual (e.g., colleagues, peers)
     * "person1_to_person2" if one-way (e.g., mentor→mentee, investor→founder)
     * "person2_to_person1" if reverse direction
   - Strength: 
     * "strong" if explicitly stated with clear evidence
     * "moderate" if reasonably inferred from context
     * "weak" if only loosely implied
     * "implied" if inferred but not directly stated
   - Evidence: Quote the exact text or describe the specific context that supports this relationship
   - Context: Note when/where this relationship was mentioned (e.g., "at YC event", "in discussion about company growth")

NETWORK CLUSTERS:
5. Identify groups of people who share common attributes:
   - Same company or organization (e.g., "Apple Leadership", "Airbnb Team")
   - Same role or function (e.g., "YC Founders", "CEOs")
   - Same event or context (e.g., "YC Event Attendees")
   - Same community or network (e.g., "Silicon Valley Founders")
   - Same relationship type (e.g., "Mentors", "Investors")

QUALITY GUIDELINES:
- Be thorough: Include both explicit mentions and well-supported inferences
- Be accurate: Only infer relationships with reasonable evidence
- Be specific: Use precise relationship types rather than generic ones
- Be complete: Capture all relevant people and their connections
- Mark uncertainty: Use "implied" or "weak" strength for uncertain relationships

Essay:
${essay}`;

async function main() {
  console.log(
    "🔍 Smart Name Extractor - Building Social/Professional Network...\n"
  );
  console.log("=".repeat(70));

  const result = await generateObject({
    model: "openai/gpt-4.1",
    schema: networkExtractionSchema,
    prompt: smartNameExtractorPrompt,
  });

  // Display people
  console.log("\n👥 PEOPLE IN THE NETWORK:");
  console.log("-".repeat(70));
  result.object.people.forEach((person, i) => {
    console.log(`\n${i + 1}. ${person.name}`);
    if (person.role) console.log(`   Role: ${person.role}`);
    if (person.company) console.log(`   Company: ${person.company}`);
    if (person.context) console.log(`   Context: ${person.context}`);
  });

  // Display relationships
  console.log("\n\n🔗 RELATIONSHIPS:");
  console.log("-".repeat(70));
  result.object.relationships.forEach((rel, i) => {
    const arrow =
      rel.direction === "bidirectional"
        ? "⟷"
        : rel.direction === "person1_to_person2"
        ? "→"
        : "←";

    console.log(`\n${i + 1}. ${rel.person1} ${arrow} ${rel.person2}`);
    console.log(`   Type: ${rel.relationshipType}`);
    console.log(`   Strength: ${rel.strength}`);
    console.log(`   Evidence: "${rel.evidence}"`);
    if (rel.context) console.log(`   Context: ${rel.context}`);
  });

  // Display network clusters
  if (
    result.object.networkClusters &&
    result.object.networkClusters.length > 0
  ) {
    console.log("\n\n🌐 NETWORK CLUSTERS:");
    console.log("-".repeat(70));
    result.object.networkClusters.forEach((cluster, i) => {
      console.log(`\n${i + 1}. ${cluster.name}`);
      console.log(`   Members: ${cluster.members.join(", ")}`);
      console.log(`   Common Attribute: ${cluster.commonAttribute}`);
    });
  }

  // Network visualization summary
  console.log("\n\n📊 NETWORK SUMMARY:");
  console.log("-".repeat(70));
  console.log(`Total People: ${result.object.people.length}`);
  console.log(`Total Relationships: ${result.object.relationships.length}`);
  if (result.object.networkClusters) {
    console.log(`Network Clusters: ${result.object.networkClusters.length}`);
  }

  // JSON output for programmatic use
  console.log("\n\n📄 Structured JSON Output:");
  console.log("=".repeat(70));
  console.log(JSON.stringify(result.object, null, 2));
}

main().catch((error) => {
  console.log("Extraction failed:", error.message);
  console.log("\n Common Issues:");
  console.log("1. Check API key configuration");
  console.log("2. Verify essay.txt exists at app/(1-extraction)/essay.txt");
  console.log("3.Ensure you have internet connectivity for API calls");
  process.exit(1);
});
