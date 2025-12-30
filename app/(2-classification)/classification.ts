import dotenvFlow from "dotenv-flow";
dotenvFlow.config();

import supportRequests from "./support_requests_multilanguage.json";
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
    categories: z
      .array(
        z.enum([
          "billing",
          "product_issues",
          "enterprise_sales",
          "account_issues",
          "product_feedback",
        ])
      )
      .min(1, "At least one category is required")
      .max(
        3,
        "Maximum of 3 categories per request to avoid over-classification"
      )
      .describe(
        "The most relevant categories for this support request. Assign 1-3 categories only when the request genuinely spans multiple areas. Most requests should have 1-2 categories. Avoid assigning categories that are only tangentially related."
      ),
    urgency: z
      .enum(["low", "medium", "high"])
      .describe("The urgency of the support request"),
    language: z
      .string()
      .describe("The full name of the language of the support request"),
  });
  // TODO: Use generateObject to classify the requests
  // - Model: 'openai/gpt-4.1'
  // - Prompt: Instruct to classify based on categories
  // - Schema: Use your defined schema
  // - Output: 'array' (to handle multiple items)
  const { object: classifiedRequests } = await generateObject({
    model: "openai/gpt-4.1",
    schema: requestSchema,
    prompt: `Classify the following support requests into categories. 

Guidelines for multi-label classification:
- Assign 1 category for most requests (the primary issue)
- Assign 2 categories only when the request clearly involves multiple distinct areas (e.g., "can't access premium features after payment" = billing + product_issues)
- Assign 3 categories only in rare cases where the request genuinely spans three distinct problem areas
- Be selective: avoid assigning categories that are only loosely related
- Most requests should have 1-2 categories maximum

Support requests: ${JSON.stringify(supportRequests)}`,
    output: "array",
  });

  // TODO: Display the classified results
  // - Access the results via object property
  // - Log as formatted JSON
  console.log("\n--- AI Response (Structured JSON) ---");
  // Output the validated, structured array
  console.log(JSON.stringify(classifiedRequests, null, 2));
  console.log("-----------------------------------");
}

main().catch(console.error);
