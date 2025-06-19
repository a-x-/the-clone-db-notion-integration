import type { VercelRequest, VercelResponse } from "@vercel/node";

interface HealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  version: string;
  hasToken: boolean;
  hasSourceDatabaseId: boolean;
  hasParentPageId: boolean;
}

interface ErrorResponse {
  error: string;
  message?: string;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for all responses
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle OPTIONS request (CORS preflight)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow GET requests
  if (req.method !== "GET") {
    const errorResponse: ErrorResponse = {
      error: "Method Not Allowed",
      message: "Only GET and OPTIONS methods are allowed",
    };
    return res.status(405).json(errorResponse);
  }

  try {
    // Check all required environment variables
    const hasToken = !!process.env.NOTION_TOKEN;
    const hasSourceDatabaseId = !!process.env.SOURCE_DATABASE_ID;
    const hasParentPageId = !!process.env.PARENT_PAGE_ID;

    const isHealthy = hasToken && hasSourceDatabaseId && hasParentPageId;

    const healthResponse: HealthResponse = {
      status: isHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: "2.0.0",
      hasToken,
      hasSourceDatabaseId,
      hasParentPageId,
    };

    const statusCode = isHealthy ? 200 : 503;
    return res.status(statusCode).json(healthResponse);
  } catch (error) {
    const errorResponse: ErrorResponse = {
      error: "Internal Server Error",
      message: error instanceof Error ? error.message : "Unknown error occurred",
    };
    return res.status(500).json(errorResponse);
  }
}
