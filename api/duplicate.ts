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

// Helper function to get page title from properties
function getPageTitle(page: any): string {
  const properties = page.properties;
  
  // Look for title property (usually "Name" but can vary)
  for (const [, prop] of Object.entries(properties)) {
    if ((prop as any).type === 'title' && (prop as any).title && (prop as any).title.length > 0) {
      return (prop as any).title[0].plain_text || 'Untitled';
    }
  }
  
  return 'Untitled';
}

// Helper function to find parent page title by ID
function findParentTitle(pages: any[], parentId: string): string {
  const parentPage = pages.find(page => page.id === parentId);
  return parentPage ? getPageTitle(parentPage) : 'Unknown Parent';
}

// STEP 1: Copy database pages content with Test Suite field populated
async function copyDatabaseContent(
  sourceDatabaseId: string,
  targetDatabaseId: string,
): Promise<number> {
  let allPages: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  console.log("🔍 Fetching all pages from source database...");

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
    
    console.log(`📄 Fetched ${allPages.length} pages so far...`);
  }

  console.log(`📊 Found ${allPages.length} total pages to copy`);

  // Analyze hierarchy - find which pages are sub-items of others
  console.log("🔍 Analyzing hierarchy to populate Test Suite field...");
  console.log("🔍 Looking for hierarchy fields: Sub-items, Sub-item, Parent item, Related to Checklist (Sub-item)");
  
  const hierarchyMap = new Map<string, string>(); // pageTitle -> parentTitle
  
  for (const page of allPages) {
    const pageTitle = getPageTitle(page);
    
    // Check all possible hierarchy field names
    const hierarchyFields = ['Sub-items', 'Sub-item', 'Parent item', 'Related to Checklist (Sub-item)', 'Related to Checklist (Parent item)'];
    
    for (const fieldName of hierarchyFields) {
      if (page?.properties?.[fieldName]) {
        const hierarchyProperty = page.properties[fieldName];
        
        if (hierarchyProperty?.type === 'relation' && hierarchyProperty?.relation && hierarchyProperty.relation.length > 0) {
          const relations = hierarchyProperty.relation;
          
          // For Sub-items or Sub-item fields - this page is parent of the related items
          if (fieldName.includes('Sub-item') || fieldName === 'Sub-items') {
            for (const relatedItem of relations) {
              if (relatedItem.id) {
                const childPage = allPages.find(p => p.id === relatedItem.id);
                if (childPage) {
                  const childTitle = getPageTitle(childPage);
                  hierarchyMap.set(childTitle, pageTitle);
                }
              }
            }
          }
          
          // For Parent item fields - the related items are parents of this page
          if (fieldName.includes('Parent item')) {
            for (const relatedItem of relations) {
              if (relatedItem.id) {
                const parentPage = allPages.find(p => p.id === relatedItem.id);
                if (parentPage) {
                  const parentTitle = getPageTitle(parentPage);
                  hierarchyMap.set(pageTitle, parentTitle);
                }
              }
            }
          }
        }
      }
    }
  }
  
  console.log(`📊 Found ${hierarchyMap.size} pages with parent relationships`);
  if (hierarchyMap.size > 0) {
    console.log("📋 Hierarchy mapping:");
    let logCount = 0;
    hierarchyMap.forEach((parentTitle, childTitle) => {
      if (logCount < 10) { // Limit logs to prevent timeout
        console.log(`   "${childTitle}" -> "${parentTitle}"`);
      }
      logCount++;
    });
    if (logCount > 10) {
      console.log(`   ... and ${logCount - 10} more mappings`);
    }
  }

  // FAST approach: batch processing with Promise.allSettled
  const BATCH_SIZE = 10; // Process 10 pages at once to avoid API limits
  let copiedCount = 0;
  let successfulCopies = 0;
  let failedCopies = 0;
  
  // Process pages in batches
  for (let i = 0; i < allPages.length; i += BATCH_SIZE) {
    const batch = allPages.slice(i, i + BATCH_SIZE);
    console.log(`🚀 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(allPages.length/BATCH_SIZE)} (${batch.length} pages)...`);
    
    // Create promises for this batch
    const batchPromises = batch
      .filter(page => 'properties' in page) // Type guard
      .map(async (page, batchIndex) => {
        const pageProperties = (page as any).properties;
        const filteredProperties = filterPropertiesForCreation(pageProperties);

        // Add Test Suite field with parent name if this page has a parent
        const parentTitle = hierarchyMap.get(getPageTitle(page));
        if (parentTitle) {
          filteredProperties["Test Suite"] = {
            type: "rich_text",
            rich_text: [
              {
                type: "text",
                text: {
                  content: parentTitle
                }
              }
            ]
          };
        } else {
          // Empty Test Suite field for pages without parents
          filteredProperties["Test Suite"] = {
            type: "rich_text",
            rich_text: []
          };
        }

        try {
          const result = await notion.pages.create({
            parent: {
              type: "database_id",
              database_id: targetDatabaseId,
            },
            properties: filteredProperties,
          });
          return { success: true, result, originalPage: page, batchIndex };
        } catch (error) {
          console.error(`❌ Error creating page "${getPageTitle(page)}":`, error);
          return { success: false, error, originalPage: page, batchIndex };
        }
      });

    // Execute batch in parallel
    const results = await Promise.allSettled(batchPromises);
    
    // Count successful copies
    results.forEach((result, index) => {
      copiedCount++;
      if (result.status === 'fulfilled') {
        const pageResult = result.value;
        if (pageResult.success) {
          successfulCopies++;
        } else {
          failedCopies++;
          console.error(`❌ Failed to copy page ${copiedCount}/${allPages.length}:`, pageResult.error);
        }
      } else {
        failedCopies++;
        console.error(`❌ Promise rejected for page ${copiedCount}/${allPages.length}:`, result.reason);
      }
    });
  }

  console.log(`🎉 Processing completed: ${successfulCopies} successful, ${failedCopies} failed, ${copiedCount} total processed`);
  return successfulCopies;
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
    const baseName = process.env.NEW_DATABASE_NAME || "Cloned Database";
    
    // Add current date to database name in human-readable format
    const currentDate = new Date();
    const humanDate = currentDate.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const newName = `${baseName} (${humanDate})`;

    // Validate ID formats
    validateNotionId(sourceDatabaseId, "SOURCE_DATABASE_ID");
    validateNotionId(parentPageId, "PARENT_PAGE_ID");

    console.log("🚀 Starting database cloning process...");
    console.log(`📊 Source Database ID: ${sourceDatabaseId}`);
    console.log(`📁 Parent Page ID: ${parentPageId}`);
    console.log(`🏷️ New Database Name: ${newName}`);

    // Get source database
    const sourceDatabase = await notion.databases.retrieve({
      database_id: sourceDatabaseId,
    });

    console.log("✅ Successfully retrieved source database");

    // Filter database properties to exclude problematic ones (relation, rollup)
    const filteredDatabaseProperties = filterDatabaseSchemaProperties(sourceDatabase.properties);
    
    // Add Test Suite field for parent item names
    filteredDatabaseProperties["Test Suite"] = {
      type: "rich_text",
      rich_text: {}
    };
    console.log("🔧 Added Test Suite field for parent item names");
    
    // Add Last Edited By field
    filteredDatabaseProperties["Last Edited By"] = {
      type: "last_edited_by",
      last_edited_by: {}
    };
    console.log("🔧 Added Last Edited By field");
    
    // Note: Notion API doesn't support wrap configuration for rich_text fields
    // Wrap behavior is controlled by the Notion UI, not the API
    if (filteredDatabaseProperties.Action && filteredDatabaseProperties.Action.type === 'rich_text') {
      console.log("🔧 Action field detected (wrap will be configured in Notion UI)");
    }

    // Create new database with flat structure (STEP 1: copy all data as flat list)
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
      properties: filteredDatabaseProperties,
    });

    console.log("✅ Successfully created new database");

    console.log(`✅ Successfully created new database: ${newDatabase.id}`);

    // Copy all pages from source to target database as flat list (STEP 1)
    const copiedPagesCount = await copyDatabaseContent(sourceDatabaseId, newDatabase.id);

    console.log(`🎉 Successfully copied ${copiedPagesCount} pages`);

    // Generate URL for the new database
    const newDatabaseUrl = `https://notion.so/${newDatabase.id.replace(/-/g, "")}`;

    const successResponse: SuccessResponse = {
      success: true,
      newDatabaseId: newDatabase.id,
      newDatabaseUrl,
      message: `Database "${newName}" successfully cloned with ${copiedPagesCount} pages as flat list!`,
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
