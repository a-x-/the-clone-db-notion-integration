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

    // Get source database
    const sourceDatabase = await notion.databases.retrieve({
      database_id: sourceDatabaseId,
    });

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
      properties: sourceDatabase.properties as any,
    });

    // Generate URL for the new database
    const newDatabaseUrl = `https://notion.so/${newDatabase.id.replace(/-/g, "")}`;

    const successResponse: SuccessResponse = {
      success: true,
      newDatabaseId: newDatabase.id,
      newDatabaseUrl,
      message: `Database "${newName}" successfully cloned!`,
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
      details: process.env.NODE_ENV === "development" ? error instanceof Error ? error.message : String(error) : undefined,
    };

    return res.status(statusCode).json(errorResponse);
  }
}
