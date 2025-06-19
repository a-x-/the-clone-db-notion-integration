import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";
import duplicateHandler from "../api/duplicate.js";
import healthHandler from "../api/health.js";

// Утилиты для работы с переменными окружения в тестах
const envUtils = {
  backup: {} as Record<string, string | undefined>,

  removeEnvVar(key: string) {
    this.backup[key] = process.env[key];
    // Используем Reflect.deleteProperty для корректного удаления
    Reflect.deleteProperty(process.env, key);
  },

  restoreEnvVar(key: string) {
    if (this.backup[key] !== undefined) {
      process.env[key] = this.backup[key];
    }
    delete this.backup[key];
  },

  setEnvVar(key: string, value: string) {
    this.backup[key] = process.env[key];
    process.env[key] = value;
  },
};

// Mock для VercelResponse
const createMockResponse = () => {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
  } as unknown as VercelResponse;
  return res;
};

// Mock для VercelRequest
const createMockRequest = (method: string, body?: any): VercelRequest =>
  ({
    method,
    body,
    headers: {},
    url: "",
    query: {},
  }) as VercelRequest;

describe("API Endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Health Endpoint", () => {
    test("should return healthy status when token exists", async () => {
      envUtils.setEnvVar("NOTION_TOKEN", "test-token");
      const req = createMockRequest("GET");
      const res = createMockResponse();

      await healthHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "healthy",
          hasToken: true,
          version: "2.0.0",
        }),
      );

      envUtils.restoreEnvVar("NOTION_TOKEN");
    });

    test("should return unhealthy status when token missing", async () => {
      envUtils.removeEnvVar("NOTION_TOKEN");

      const req = createMockRequest("GET");
      const res = createMockResponse();

      await healthHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "unhealthy",
          hasToken: false,
        }),
      );

      envUtils.restoreEnvVar("NOTION_TOKEN");
    });

    test("should reject non-GET methods", async () => {
      const req = createMockRequest("POST");
      const res = createMockResponse();

      await healthHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({ error: "Method not allowed" });
    });
  });

  describe("Duplicate Endpoint", () => {
    test("should reject GET requests", async () => {
      const req = createMockRequest("GET");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Method not allowed",
        }),
      );
    });

    test("should handle CORS preflight", async () => {
      const req = createMockRequest("OPTIONS");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
      expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Methods", "POST, OPTIONS");
      expect(res.end).toHaveBeenCalled();
    });

    test("should validate missing input data", async () => {
      envUtils.setEnvVar("NOTION_TOKEN", "test-token");
      const req = createMockRequest("POST", {});
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Bad request",
          details: expect.stringContaining("sourceDatabaseId"),
        }),
      );

      envUtils.restoreEnvVar("NOTION_TOKEN");
    });

    test("should validate ID format", async () => {
      envUtils.setEnvVar("NOTION_TOKEN", "test-token");
      const req = createMockRequest("POST", {
        sourceDatabaseId: "invalid-id",
        parentPageId: "also-invalid",
      });
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Bad request",
          details: expect.stringContaining("valid Notion"),
        }),
      );

      envUtils.restoreEnvVar("NOTION_TOKEN");
    });

    test("should handle missing NOTION_TOKEN", async () => {
      envUtils.removeEnvVar("NOTION_TOKEN");

      const req = createMockRequest("POST", {
        sourceDatabaseId: "12345678901234567890123456789012",
        parentPageId: "12345678901234567890123456789012",
      });
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: "Server configuration error",
          details: "NOTION_TOKEN environment variable is not set",
        }),
      );

      envUtils.restoreEnvVar("NOTION_TOKEN");
    });
  });
});

// Utility тесты
describe("Utilities", () => {
  test("should validate Notion ID format", () => {
    const validIds = [
      "12345678901234567890123456789012",
      "12345678-1234-1234-1234-123456789012",
      "abcdef12345678901234567890123456",
      "ABCDEF12-3456-7890-1234-567890123456",
    ];

    const invalidIds = [
      "short",
      "too-long-id-that-exceeds-32-characters-definitely",
      "invalid-chars-!@#$%^&*()",
      "",
      "12345678-12345-1234-1234-123456789012", // неправильный формат
      "1234567890123456789012345678901", // 31 символ
    ];

    const idPattern =
      /^[a-f0-9]{32}$|^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

    for (const id of validIds) {
      expect(idPattern.test(id.replace(/-/g, ""))).toBe(true);
    }

    for (const id of invalidIds) {
      expect(idPattern.test(id.replace(/-/g, ""))).toBe(false);
    }
  });

  test("should handle ID normalization", () => {
    const idWithDashes = "12345678-1234-1234-1234-123456789012";
    const idWithoutDashes = "12345678123412341234123456789012";

    expect(idWithDashes.replace(/-/g, "")).toBe(idWithoutDashes);
    expect(idWithoutDashes.length).toBe(32);
  });
});
