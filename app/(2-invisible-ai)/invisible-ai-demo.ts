import dotenvFlow from "dotenv-flow";
dotenvFlow.config();
import { generateObject } from "ai";
import { z } from "zod";

// Example: Smart form filling from natural language
async function smartFormFill(userInput: string) {
  console.log("\n🤖 Invisible AI: Smart Form Filling\n");
  console.log(`User types: "${userInput}"\n`);

  // TODO: Create a Zod schema for calendar event details
  // Include fields like: eventTitle, date, time, duration, location, attendees, notes
  const eventSchema = z.object({
    eventTitle: z.string().describe("The title of the event"),
    date: z.string().describe("The date of the event"),
    time: z.string().nullable().describe("The time of the event"),
    duration: z.string().nullable().describe("The duration of the event"),
    location: z.string().nullable().describe("Where the event will take place"),
    attendees: z.array(z.string()).describe("People attending the the meeting"),
    notes: z
      .string()
      .nullable()
      .describe("Any additional notes about the event or agenda items"),
  });

  // TODO: Use generateObject to extract structured data from userInput
  // The AI should parse the natural language and fill the form fields
  const { object: eventDetails } = await generateObject({
    model: "openai/gpt-4.1",
    schema: eventSchema,
    prompt: `Extract all calendar event details from : ${userInput}`,
  });

  // TODO: Display the extracted data in a user-friendly way
  // Show how this saves the user time and effort
  console.log("✨ AI automatically fills your form:\n");
  console.log(`📅 Event: ${eventDetails.eventTitle}`);
  console.log(`📆 Date: ${eventDetails.date}`);
  if (eventDetails.time) console.log(`⏰ Time: ${eventDetails.time}`);
  if (eventDetails.location)
    console.log(`📍 Location: ${eventDetails.location}`);
  if (eventDetails.attendees)
    console.log(`👥 Attendees: ${eventDetails.attendees.join(", ")}`);
  if (eventDetails.notes) console.log(`📝 Notes: ${eventDetails.notes}`);
}

// Example: Smart email categorization
async function smartEmailTriage(emailSubject: string, emailPreview: string) {
  console.log("\n📧 Invisible AI: Email Smart Triage\n");

  // TODO: Create a Zod schema for email triage
  // Include: category (urgent/action-required/fyi/spam/newsletter)
  //          priority (high/medium/low)
  //          suggestedFolder, requiresResponse, estimatedResponseTime
  const emailSchema = z.object({
    category: z
      .enum(["urgent", "action-required", "fyi", "spam", "newsletter"])
      .describe("The category of the email"),
    priority: z
      .enum(["high", "medium", "low"])
      .describe("The priority of the email"),
    suggestedFolder: z
      .string()
      .nullable()
      .describe("The suggested folder for the email"),
    requiresResponse: z
      .boolean()
      .describe("Whether the email requires a response"),
    estimatedResponseTime: z
      .string()
      .nullable()
      .describe("The estimated response time for the email"),
  });

  // TODO: Use generateObject to analyze and categorize the email
  const { object: emailDetails } = await generateObject({
    model: "openai/gpt-4.1",
    schema: emailSchema,
    prompt: `Analyze and categorize the following email: ${emailSubject} ${emailPreview}`,
  });

  // TODO: Display the triage results
  // Show how email gets automatically organized
  console.log("✨ AI automatically categorizes your email:\n");
  console.log(`📧 Category: ${emailDetails.category}`);
  console.log(`🔥 Priority: ${emailDetails.priority}`);
  if (emailDetails.suggestedFolder)
    console.log(`📂 Suggested Folder: ${emailDetails.suggestedFolder}`);
  console.log(`📩 Requires Response: ${emailDetails.requiresResponse}`);
  if (emailDetails.estimatedResponseTime)
    console.log(
      `🕒 Estimated Response Time: ${emailDetails.estimatedResponseTime}`
    );
}

async function runExamples() {
  // Smart form example
  await smartFormFill(
    "Coffee with John next Tuesday at 2pm at Starbucks on Market St, discuss Q4 roadmap"
  );

  console.log("\n" + "=".repeat(60));

  // Email triage example
  await smartEmailTriage(
    "Re: Q4 Budget Approval Needed by EOD",
    "Hi team, I need your approval on the attached Q4 budget proposal by end of day today. Please review the highlighted sections..."
  );
}

runExamples().catch(console.error);
