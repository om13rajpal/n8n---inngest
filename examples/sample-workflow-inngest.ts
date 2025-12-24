/**
 * Inngest Functions - Converted from n8n Workflow
 * Original Workflow: Sample Data Pipeline
 * Converted: 2025-12-23T21:33:10.045Z
 *
 * This code was automatically generated from an n8n workflow.
 * Review and adjust as needed for your specific use case.
 */

import { Inngest } from "inngest";
supabase
import { createClient } from "@supabase/supabase-js";

// Inngest Client
const inngest = new Inngest({ id: "sample-data-pipeline" });

// Helper Functions

/**
 * Get Supabase client instance
 */
function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_KEY environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Scheduled: Sample Data Pipeline
 * Schedule: 0 */1 * * *
 */
export const sample_data_pipeline = inngest.createFunction(
  {
  id: 'sample-data-pipeline',
  name: 'Scheduled: Sample Data Pipeline'
},
  { cron: "0 */1 * * *" },
  async ({ step }) => {
    // Input data from trigger
    const inputData = event?.data ?? {};

    // HTTP GET: Fetch API Data
    const fetch_api_data = await step.run("fetch-api-data", async () => {
      const data = event.data;
            
      
            const response = await fetch("https://api.example.com/data", {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                ...{},
                
              },
              body: undefined,
              redirect: "follow",
              signal: AbortSignal.timeout(30000),
            });
      
            if (!response.ok) {
              throw new Error(`HTTP error! status: ${response.status}`);
            }
      
            const contentType = response.headers.get("content-type");
            if (contentType?.includes("application/json")) {
              return await response.json();
            }
            return await response.text();
    });

    // IF condition: Check Status
    const check_status = await step.run("check-status", async () => {
      const data = fetch_api_data;
            const condition = (${data.status} === "active");
      
            return {
              branch: condition ? 'true' : 'false',
              data,
              condition,
            };
    });

    // Code: Transform Data
    const transform_data = await step.run("transform-data", async () => {
      const inputData = check_status;
            const items = Array.isArray(inputData) ? inputData : [inputData];
            const $input = { all: () => items, first: () => items[0], last: () => items[items.length - 1] };
      
            // Original n8n code (converted):
            return items.map(item => ({ ...item.json, processedAt: new Date().toISOString() }));
    });

    // Supabase upsert: Save to Supabase
    const save_to_supabase = await step.run("save-to-supabase", async () => {
      const data = transform_data;
            const supabase = getSupabaseClient();
      
            const upsertData = data;
      
            const { data: result, error } = await supabase
              .from("processed_records")
              .upsert(upsertData, { onConflict: "id" })
              .select();
      
            if (error) throw new Error(`Supabase upsert error: ${error.message}`);
            return result;
    });

    // Code: Log Skip
    const log_skip = await step.run("log-skip", async () => {
      const inputData = check_status;
            const items = Array.isArray(inputData) ? inputData : [inputData];
            const $input = { all: () => items, first: () => items[0], last: () => items[items.length - 1] };
      
            // Original n8n code (converted):
            console.log('Skipped inactive record'); return items;
    });

    // Return final result
    return { success: true };
  }
);

// Export all functions
export const functions = [sample_data_pipeline];