import { Client } from "@notionhq/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";

interface ErrorResponse {
  error: string;
  message?: string;
  details?: string;
}

interface SuccessResponse {
  success: true;
  newDatabaseId: string;
  newDatabaseUrl: string;
  message: string;
  copiedPagesCount: number;
}

const notion = new Client({
  auth: process.env.NOTION_TOKEN,
});

// Security validation for environment variables
function validateEnvironment(): void {
  if (!process.env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN environment variable is required");
  }

  if (!process.env.SOURCE_DATABASE_ID) {
    throw new Error("SOURCE_DATABASE_ID environment variable is required");
  }

  if (!process.env.PARENT_PAGE_ID) {
    throw new Error("PARENT_PAGE_ID environment variable is required");
  }
}

// Validate ID format (32 characters, alphanumeric + hyphens)
function validateNotionId(id: string, idType: string): void {
  const cleanId = id.replace(/-/g, "");
  if (cleanId.length !== 32 || !/^[a-f0-9]+$/i.test(cleanId)) {
    throw new Error(`Invalid ${idType} format. Must be 32 characters.`);
  }
}

// Filter database schema properties to exclude problematic ones
function filterDatabaseSchemaProperties(properties: any): any {
  const filteredProperties: any = {};
  
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as any;
    
    // Skip relation properties as they reference other databases and can cause validation errors
    if (prop.type === 'relation') {
      console.log(`Skipping relation property in schema: ${key}`);
      continue;
    }
    
    // Skip rollup properties as they depend on relations
    if (prop.type === 'rollup') {
      console.log(`Skipping rollup property in schema: ${key}`);
      continue;
    }
    
    // Include all other property types (title, rich_text, number, select, etc.)
    filteredProperties[key] = value;
  }
  
  return filteredProperties;
}

// Filter properties to exclude problematic ones for page creation
function filterPropertiesForCreation(properties: any): any {
  const filteredProperties: any = {};
  
  for (const [key, value] of Object.entries(properties)) {
    const prop = value as any;
    
    // Skip relation properties as they can cause validation errors
    // when relations reference pages that don't exist in the target database
    if (prop.type === 'relation') {
      console.log(`Skipping relation property: ${key}`);
      continue;
    }
    
    // Skip rollup properties as they depend on relations
    if (prop.type === 'rollup') {
      console.log(`Skipping rollup property: ${key}`);
      continue;
    }
    
    // Skip formula properties as they are calculated automatically
    if (prop.type === 'formula') {
      console.log(`Skipping formula property: ${key}`);
      continue;
    }
    
    // Skip created_by and last_edited_by as they are system properties
    if (prop.type === 'created_by' || prop.type === 'last_edited_by') {
      console.log(`Skipping system property: ${key}`);
      continue;
    }
    
    // Skip created_time and last_edited_time as they are system properties
    if (prop.type === 'created_time' || prop.type === 'last_edited_time') {
      console.log(`Skipping system property: ${key}`);
      continue;
    }
    
    // Include all other property types
    filteredProperties[key] = value;
  }
  
  return filteredProperties;
}

// Copy database pages content
async function copyDatabaseContent(
  sourceDatabaseId: string,
  targetDatabaseId: string,
): Promise<number> {
  let allPages: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  // Get all pages from source database
  while (hasMore) {
    const response = await notion.databases.query({
      database_id: sourceDatabaseId,
      start_cursor: startCursor,
      page_size: 100,
    });

    allPages = allPages.concat(response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  console.log(`Found ${allPages.length} pages to copy`);

  // Copy each page to the new database
  let copiedCount = 0;
  for (const page of allPages) {
    try {
      // Extract and filter properties from the source page
      const pageProperties = page.properties;
      const filteredProperties = filterPropertiesForCreation(pageProperties);

      // Create new page in target database
      await notion.pages.create({
        parent: {
          type: "database_id",
          database_id: targetDatabaseId,
        },
        properties: filteredProperties,
      });

      copiedCount++;
      console.log(`Copied page ${copiedCount}/${allPages.length}`);
    } catch (error) {
      console.error("Error copying page:", error);
      // Continue copying other pages even if one fails
    }
  }

  return copiedCount;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle OPTIONS request (CORS preflight)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    const errorResponse: ErrorResponse = {
      error: "Method not allowed",
      message: "Only POST requests are allowed for this endpoint",
    };
    return res.status(405).json(errorResponse);
  }

  try {
    // Validate environment variables
    validateEnvironment();

    const sourceDatabaseId = process.env.SOURCE_DATABASE_ID!;
    const parentPageId = process.env.PARENT_PAGE_ID!;
    const newName = process.env.NEW_DATABASE_NAME || "Cloned Database";

    // Validate ID formats
    validateNotionId(sourceDatabaseId, "SOURCE_DATABASE_ID");
    validateNotionId(parentPageId, "PARENT_PAGE_ID");

    console.log("Starting database cloning process...");
    console.log(`Source Database ID: ${sourceDatabaseId}`);
    console.log(`Parent Page ID: ${parentPageId}`);
    console.log(`New Database Name: ${newName}`);

    // Get source database
    const sourceDatabase = await notion.databases.retrieve({
      database_id: sourceDatabaseId,
    });

    console.log("Successfully retrieved source database");

    // Filter database properties to exclude problematic ones (relation, rollup)
    const filteredDatabaseProperties = filterDatabaseSchemaProperties(sourceDatabase.properties);

    // Create new database
    const newDatabase = await notion.databases.create({
      parent: {
        type: "page_id",
        page_id: parentPageId,
      },
      title: [
        {
          type: "text",
          text: {
            content: newName,
          },
        },
      ],
      properties: filteredDatabaseProperties as any,
    });

    console.log(`Successfully created new database: ${newDatabase.id}`);

    // Copy all pages from source to target database
    const copiedPagesCount = await copyDatabaseContent(sourceDatabaseId, newDatabase.id);

    console.log(`Successfully copied ${copiedPagesCount} pages`);

    // Generate URL for the new database
    const newDatabaseUrl = `https://notion.so/${newDatabase.id.replace(/-/g, "")}`;

    const successResponse: SuccessResponse = {
      success: true,
      newDatabaseId: newDatabase.id,
      newDatabaseUrl,
      message: `Database "${newName}" successfully cloned with ${copiedPagesCount} pages! Note: Relation, rollup, and formula properties were skipped during copy.`,
      copiedPagesCount,
    };

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error("Error cloning database:", error);

    let errorMessage = "Failed to clone database";
    let statusCode = 500;

    if (error instanceof Error) {
      if (error.message.includes("environment variable")) {
        errorMessage = "Server configuration error";
        statusCode = 500;
      } else if (error.message.includes("Invalid") && error.message.includes("format")) {
        errorMessage = "Invalid database or page ID format in configuration";
        statusCode = 500;
      } else if (error.message.includes("Could not find")) {
        errorMessage = "Database or page not found. Check permissions and IDs in configuration.";
        statusCode = 404;
      } else if (error.message.includes("Unauthorized")) {
        errorMessage = "Unauthorized. Check Notion token and permissions.";
        statusCode = 401;
      }
    }

    const errorResponse: ErrorResponse = {
      error: errorMessage,
      details:
        process.env.NODE_ENV === "development"
          ? error instanceof Error
            ? error.message
            : String(error)
          : undefined,
    };

    return res.status(statusCode).json(errorResponse);
  }
}
