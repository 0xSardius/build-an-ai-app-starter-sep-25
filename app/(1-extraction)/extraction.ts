import dotenvFlow from "dotenv-flow";
dotenvFlow.config();
import fs from "fs";
import { generateText } from "ai";

// import essay
const essay = fs.readFileSync("app/(1-extraction)/essay.txt", "utf-8");

const companyPrompt = `Extract all the company names from this essay. Include both explicit mentions and implied references. (e.g., "the startup" referring to a previously mentioned company). Essay: ${essay}`;

const conceptPrompt = `Identify the main business concepts and related technical terms used in this essay. Categorize them as either "business" or "techincal concepts." Format as JSON: { "business": ["concept1", "concept2"], "technical": ["term1", "term2"] }. Essay: ${essay}`;

const quotePrompt = `Extract all the quotes (text in quotation marks) from this essay. For each quote, identify who said it if mentioned. Format as a JSON array: [{ "quotes": ["quote1", "quote2"], "speaker": "speaker1" }, { "quotes": ["quote3", "quote4"], "speaker": "speaker2" }]. Essay: ${essay}`;

async function main() {
  const result = await generateText({
    model: "openai/gpt-4.1",
    prompt: quotePrompt,
  });

  console.log("---- Response ---");
  console.log(result.text);
  console.log("------------------------------");
}

main().catch((error) => {
  console.log("Extraction failed:", error.message);
  console.log("\n Common Issues:");
  console.log("1. Check API key configuration");
  console.log("2. Verify essay.txt exists at app/(1-extraction)/essay.txt");
  console.log("3.Ensure you have internet connectivity for API calls");
  process.exit(1);
});
