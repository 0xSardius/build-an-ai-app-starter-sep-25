import dotenvFlow from "dotenv-flow";
dotenvFlow.config();
import { generateText, generateObject } from "ai";
import { z } from "zod";

// Sample data for testing
const appointmentText =
  "Team meeting tomorrow 3pm in the conference room with Guillermo and Sarah";
const namesText =
  "In the meeting, Guillermo and Lee discussed the new Vercel AI SDK with Sarah from marketing.";

async function compareOutputs() {
  console.log("\n=== Sample Data ===\n");
  console.log("Appointment text:", appointmentText);
  console.log("Names text:", namesText);

  // TODO: Add generateText example for extracting names
  // - Use generateText to extract names from namesText
  // - Log the output and its type
  // - Note that you'll need to parse the text string
  const { text } = await generateText({
    model: "google/gemini-2.5-flash",
    prompt: `Extract all the names from the following text: ${namesText}`,
  });
  console.log(text);
  console.log("Output type:", typeof text);

  // TODO: Add generateObject example for structured appointment data
  // - Create a Zod schema for appointment details
  // - Use generateObject with the schema
  // - Log the structured output
  // - Show how you can directly access properties
  console.log("Using generateObject to extract structured appointment data");

  const appointmentSchema = z.object({
    title: z.string().describe("The meeting title or subject"),
    date: z.string().describe("The date of the meeting"),
    time: z.string().describe("The time of the event"),
    location: z.string().nullable().describe("Where the event will take place"),
    attendees: z.array(z.string()).describe("People attending the the meeting"),
  });

  const { object } = await generateObject({
    model: "openai/gpt-4.1",
    schema: appointmentSchema,
    prompt: `Parse appointment details from the following text: ${appointmentText}`,
  });

  console.log("Structured output:", JSON.stringify(object, null, 2));
  console.log("Output type:", typeof object);
  console.log("\nDirect property access:");
  console.log("- Title:", object.title);
  console.log("- Date:", object.date);
  console.log("- Time:", object.time);
  console.log("- Location:", object.location);
  console.log("- Attendees:", object.attendees?.join(", "));
}

compareOutputs().catch(console.error);
