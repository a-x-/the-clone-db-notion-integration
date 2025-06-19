import type { VercelRequest, VercelResponse } from "@vercel/node";

interface HealthResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  version: string;
  environment: string;
  hasToken: boolean;
  uptime?: number;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const healthStatus: HealthResponse = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: "2.0.0",
    environment: process.env.NODE_ENV || "production",
    hasToken: !!process.env.NOTION_TOKEN,
    uptime: process.uptime?.() || undefined,
  };

  // Проверяем что токен установлен
  if (!process.env.NOTION_TOKEN) {
    healthStatus.status = "unhealthy";
    return res.status(503).json(healthStatus);
  }

  return res.status(200).json(healthStatus);
}
