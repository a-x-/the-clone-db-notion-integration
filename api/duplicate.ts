import { Client } from "@notionhq/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";

interface RequestBody {
  sourceDatabaseId: string;
  parentPageId: string;
  includeContent?: boolean;
  newName?: string;
}

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

// Валидация входных данных
function validateInput(body: unknown): RequestBody {
  if (!body || typeof body !== "object") {
    throw new Error("Request body is required and must be an object");
  }

  const { sourceDatabaseId, parentPageId, includeContent, newName } = body as Record<
    string,
    unknown
  >;

  if (!sourceDatabaseId || typeof sourceDatabaseId !== "string") {
    throw new Error("sourceDatabaseId is required and must be a string");
  }

  if (!parentPageId || typeof parentPageId !== "string") {
    throw new Error("parentPageId is required and must be a string");
  }

  // Проверяем формат ID (32 символа без дефисов или с дефисами)
  const idPattern =
    /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

  if (!idPattern.test(sourceDatabaseId.replace(/-/g, ""))) {
    throw new Error("sourceDatabaseId must be a valid Notion database ID");
  }

  if (!idPattern.test(parentPageId.replace(/-/g, ""))) {
    throw new Error("parentPageId must be a valid Notion page ID");
  }

  return {
    sourceDatabaseId,
    parentPageId,
    includeContent: typeof includeContent === "boolean" ? includeContent : false,
    newName: typeof newName === "string" ? newName : undefined,
  };
}

// Основная функция дублирования базы данных
async function duplicateDatabase(data: RequestBody): Promise<SuccessResponse> {
  const { sourceDatabaseId, parentPageId, newName } = data;

  try {
    // 1. Получаем информацию об исходной базе данных
    const sourceDb = await notion.databases.retrieve({
      database_id: sourceDatabaseId,
    });

    if (!("properties" in sourceDb)) {
      throw new Error("Failed to retrieve database properties");
    }

    // 2. Создаём название для новой базы данных
    let dbTitle = "Database (Copy)";
    if (newName) {
      dbTitle = newName;
    } else if ("title" in sourceDb && Array.isArray(sourceDb.title) && sourceDb.title[0]) {
      dbTitle = `${sourceDb.title[0].plain_text || "Database"} (Copy)`;
    }

    // 3. Создаём новую базу данных с теми же свойствами
    const newDatabase = await notion.databases.create({
      parent: {
        type: "page_id",
        page_id: parentPageId,
      },
      title: [
        {
          type: "text",
          text: {
            content: dbTitle,
          },
        },
      ],
      // Notion API типы properties очень сложные, используем any для совместимости
      properties: sourceDb.properties as any,
    });

    // 4. Формируем URL новой базы данных
    const newDatabaseUrl = `https://notion.so/${newDatabase.id.replace(/-/g, "")}`;

    return {
      success: true,
      newDatabaseId: newDatabase.id,
      newDatabaseUrl,
      message: `Database "${dbTitle}" successfully duplicated!`,
    };
  } catch (error) {
    console.error("Error duplicating database:", error);

    if (error instanceof Error) {
      if (error.message.includes("unauthorized")) {
        throw new Error("Unauthorized: Check your NOTION_TOKEN and database permissions");
      }
      if (error.message.includes("not_found")) {
        throw new Error("Database or parent page not found. Check your IDs and permissions");
      }
      throw new Error(`Notion API error: ${error.message}`);
    }

    throw new Error("Unknown error occurred while duplicating database");
  }
}

// CORS headers
function setCorsHeaders(res: VercelResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

// Главный обработчик
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<VercelResponse> {
  setCorsHeaders(res);

  // Обрабатываем preflight OPTIONS запрос
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Принимаем только POST запросы
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      message: "This endpoint only accepts POST requests",
    } satisfies ErrorResponse);
  }

  // Проверяем наличие токена
  if (!process.env.NOTION_TOKEN) {
    return res.status(500).json({
      error: "Server configuration error",
      details: "NOTION_TOKEN environment variable is not set",
    } satisfies ErrorResponse);
  }

  try {
    // Валидируем входные данные
    const validatedData = validateInput(req.body);

    // Выполняем дублирование
    const result = await duplicateDatabase(validatedData);

    return res.status(200).json(result satisfies SuccessResponse);
  } catch (error) {
    console.error("Handler error:", error);

    return res.status(400).json({
      error: "Bad request",
      details: error instanceof Error ? error.message : "Unknown error",
    } satisfies ErrorResponse);
  }
}
