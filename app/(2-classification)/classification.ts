import dotenvFlow from "dotenv-flow";
dotenvFlow.config();

import supportRequests from "./support_requests.json";
import { z } from "zod";
import { generateObject } from "ai";

async function main() {
  console.log("Asking AI to classify support requests...");

  // TODO: Define the schema for a single classified request
  // - Use z.object() to define the structure
  // - Include 'request' field (string) and 'category' field (enum)
  // - Categories: 'billing', 'product_issues', 'enterprise_sales', 'account_issues', 'product_feedback'
  const requestSchema = z.object({
    request: z.string().describe("The support request text"),
    category: z
      .enum([
        "billing",
        "product_issues",
        "enterprise_sales",
        "account_issues",
        "product_feedback",
      ])
      .describe("The category of the support request"),
  });
  // TODO: Use generateObject to classify the requests
  // - Model: 'openai/gpt-4.1'
  // - Prompt: Instruct to classify based on categories
  // - Schema: Use your defined schema
  // - Output: 'array' (to handle multiple items)
  const { object: classifiedRequests } = await generateObject({
    model: "openai/gpt-4.1",
    schema: requestSchema,
    prompt: `Classify the following support requests into categories: ${JSON.stringify(
      supportRequests
    )}`,
    output: "array",
  });

  // TODO: Display the classified results
  // - Access the results via object property
  // - Log as formatted JSON
}

main().catch(console.error);
