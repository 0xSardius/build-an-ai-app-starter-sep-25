"use server";

import { generateObject, generateText } from "ai";
import { z } from "zod";

const summarizationSchema = z.object({
  headline: z.string().describe("The headline of the article"),
  context: z.string().describe("The context of the article"),
  discussionPoints: z.string().describe("The discussion points of the article"),
  takeaways: z.string().describe("The takeaways of the article"),
});

export const generateSummary = async (comments: any[]) => {
  console.log("Generating summary for", comments.length, "comments...");
  const { object: summary } = await generateObject({
    model: "openai/gpt-4.1",
    prompt: `Generate a summary of the following comments: ${JSON.stringify(
      comments
    )}. Focus on key decisions and action items.`,
    schema: summarizationSchema,
  });
  console.log("Summary:", summary);
  return summary;
};
