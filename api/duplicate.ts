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

// STEP 1: Copy database pages content as flat list - simple and fast approach
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

  // FAST approach: batch processing with Promise.allSettled
  const BATCH_SIZE = 10; // Process 10 pages at once to avoid API limits
  let copiedCount = 0;
  
  // Process pages in batches
  for (let i = 0; i < allPages.length; i += BATCH_SIZE) {
    const batch = allPages.slice(i, i + BATCH_SIZE);
    console.log(`🚀 Processing batch ${Math.floor(i/BATCH_SIZE) + 1}/${Math.ceil(allPages.length/BATCH_SIZE)} (${batch.length} pages)...`);
    
    // Create promises for this batch
    const batchPromises = batch
      .filter(page => 'properties' in page) // Type guard
      .map(async (page) => {
        const pageProperties = (page as any).properties;
        const filteredProperties = filterPropertiesForCreation(pageProperties);

        return notion.pages.create({
          parent: {
            type: "database_id",
            database_id: targetDatabaseId,
          },
          properties: filteredProperties,
        });
      });

    // Execute batch in parallel
    const results = await Promise.allSettled(batchPromises);
    
    // Count successful copies
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        copiedCount++;
        console.log(`✅ Copied page ${copiedCount}/${allPages.length}`);
      } else {
        console.error(`❌ Error copying page ${i + index + 1}:`, result.reason);
      }
    });
  }

  console.log(`🎉 Successfully copied ${copiedCount} total pages`);
  return copiedCount;
}

// STEP 2: Add sub-items support and restore hierarchical structure
async function addSubItemsFieldAndRestoreHierarchy(
  sourceDatabaseId: string, 
  targetDatabaseId: string
): Promise<void> {
  console.log("🔗 STEP 2: Adding sub-items field and restoring hierarchy...");
  
  // First, add Sub-items relation field to the target database
  await notion.databases.update({
    database_id: targetDatabaseId,
    properties: {
      "Sub-items": {
        type: "relation",
        relation: {
          database_id: targetDatabaseId,
          single_property: {}
        }
      }
    } as any
  });
  
  console.log("✅ Added Sub-items field to target database");
  
  // Now restore the hierarchical structure
  await restoreHierarchy(sourceDatabaseId, targetDatabaseId);
}

// Restore hierarchical relationships between pages
async function restoreHierarchy(sourceDatabaseId: string, targetDatabaseId: string): Promise<void> {
  console.log("🌳 Analyzing and restoring hierarchical structure...");
  
  // Get all pages from source database to analyze hierarchy
  const sourcePages = await getAllPagesFromDatabase(sourceDatabaseId);
  const targetPages = await getAllPagesFromDatabase(targetDatabaseId);
  
  console.log(`📊 Found ${sourcePages.length} source pages and ${targetPages.length} target pages`);
  
  // Create mapping from source to target pages (by title or other unique identifier)
  const pageMapping = createPageMapping(sourcePages, targetPages);
  
  // Find hierarchical relationships in source pages - look specifically for Sub-items field
  const relationships = findHierarchicalRelationships(sourcePages);
  
  console.log(`🔗 Found ${relationships.length} hierarchical relationships to restore`);
  
  // Apply relationships to target pages
  if (relationships.length > 0) {
    await applyRelationships(relationships, pageMapping, targetDatabaseId);
  }
  
  console.log("✅ Hierarchy restoration completed");
}

// Get all pages from a database
async function getAllPagesFromDatabase(databaseId: string): Promise<any[]> {
  let allPages: any[] = [];
  let hasMore = true;
  let startCursor: string | undefined = undefined;

  while (hasMore) {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: startCursor,
      page_size: 100,
    });

    allPages = allPages.concat(response.results);
    hasMore = response.has_more;
    startCursor = response.next_cursor || undefined;
  }

  return allPages;
}

// Create mapping between source and target pages based on title
function createPageMapping(sourcePages: any[], targetPages: any[]): Map<string, string> {
  const mapping = new Map<string, string>();
  
  for (const sourcePage of sourcePages) {
    const sourceTitle = getPageTitle(sourcePage);
    if (sourceTitle) {
      // Find corresponding target page by title
      const targetPage = targetPages.find(target => getPageTitle(target) === sourceTitle);
      if (targetPage) {
        mapping.set(sourcePage.id, targetPage.id);
      }
    }
  }
  
  console.log(`📝 Created mapping for ${mapping.size} pages`);
  return mapping;
}

// Extract title from page properties
function getPageTitle(page: any): string | null {
  if (!page.properties) return null;
  
  // Look for title property (usually the first property with type 'title')
  for (const [key, property] of Object.entries(page.properties)) {
    if ((property as any).type === 'title') {
      const titleArray = (property as any).title;
      if (titleArray && titleArray.length > 0) {
        return titleArray[0].plain_text || null;
      }
    }
  }
  
  return null;
}

// Find hierarchical relationships in source pages - look specifically for Sub-items field
function findHierarchicalRelationships(sourcePages: any[]): Array<{parentId: string, childId: string}> {
  const relationships: Array<{parentId: string, childId: string}> = [];
  
  for (const page of sourcePages) {
    if (page?.properties?.["Sub-items"]) {
      const subItemsProperty = page.properties["Sub-items"];
      
      // Check if this is a relation property with sub-items
      if (subItemsProperty?.type === 'relation' && subItemsProperty?.relation) {
        const subItems = subItemsProperty?.relation;
        
        // Each related page is a sub-item of current page
        for (const subItem of subItems) {
          if (subItem.id) {
            relationships.push({
              parentId: page.id,
              childId: subItem.id
            });
          }
        }
      }
    }
  }
  
  console.log(`🔍 Found ${relationships.length} parent-child relationships from Sub-items field`);
  return relationships;
}

// Apply relationships to target database
async function applyRelationships(
  relationships: Array<{parentId: string, childId: string}>, 
  pageMapping: Map<string, string>,
  targetDatabaseId: string
): Promise<void> {
  console.log(`🔄 Applying ${relationships.length} relationships...`);
  
  const BATCH_SIZE = 5; // Smaller batch size for relation updates
  
  for (let i = 0; i < relationships.length; i += BATCH_SIZE) {
    const batch = relationships.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (relationship) => {
      const targetParentId = pageMapping.get(relationship.parentId);
      const targetChildId = pageMapping.get(relationship.childId);
      
      if (targetParentId && targetChildId) {
        try {
          // Get current parent page to see existing sub-items
          const parentPage = await notion.pages.retrieve({ page_id: targetParentId });
          const currentSubItems = (parentPage as any).properties["Sub-items"]?.relation || [];
          
          // Add new child to sub-items list
          const updatedSubItems = [...currentSubItems, { id: targetChildId }];
          
          // Update parent page with new sub-item relationship
          await notion.pages.update({
            page_id: targetParentId,
            properties: {
              "Sub-items": {
                type: "relation",
                relation: updatedSubItems
              }
            }
          });
          
          console.log(`✅ Added relationship: ${targetParentId} -> ${targetChildId}`);
        } catch (error) {
          console.error(`❌ Error creating relationship ${targetParentId} -> ${targetChildId}:`, error);
        }
      }
    });
    
    await Promise.allSettled(batchPromises);
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
    
    // Configure Action field as wrap if it exists
    if (filteredDatabaseProperties.Action && filteredDatabaseProperties.Action.type === 'rich_text') {
      filteredDatabaseProperties.Action.rich_text = {
        wrap: true
      };
      console.log("🔧 Configured Action field with wrap: true");
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

    // STEP 2: Add sub-items field and restore hierarchical structure
    await addSubItemsFieldAndRestoreHierarchy(sourceDatabaseId, newDatabase.id);

    // Generate URL for the new database
    const newDatabaseUrl = `https://notion.so/${newDatabase.id.replace(/-/g, "")}`;

    const successResponse: SuccessResponse = {
      success: true,
      newDatabaseId: newDatabase.id,
      newDatabaseUrl,
      message: `Database "${newName}" successfully cloned with ${copiedPagesCount} pages and hierarchy restored! Sub-items feature is now active.`,
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
