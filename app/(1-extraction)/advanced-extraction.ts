import dotenvFlow from "dotenv-flow";
dotenvFlow.config();
import fs from "fs";
import { generateText } from "ai";

// import essay
const essay = fs.readFileSync("app/(1-extraction)/essay.txt", "utf-8");

async function main() {
  const result = await generateText({
    model: "openai/gpt-5",
    prompt: `Extract all the company names from this essay. Include both explicit mentions and implied references. (e.g., "the startup" referring to a previously mentioned company). Essay: ${essay}`,
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
