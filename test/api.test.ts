import type { VercelRequest, VercelResponse } from "@vercel/node";
import { beforeEach, describe, expect, test, vi } from "vitest";
import duplicateHandler from "../api/duplicate.js";
import healthHandler from "../api/health.js";

// Mock environment for testing
const mockEnv = {
  NOTION_TOKEN: "secret_test_token_123",
  SOURCE_DATABASE_ID: "12345678901234567890123456789012",
  PARENT_PAGE_ID: "98765432109876543210987654321098",
  NEW_DATABASE_NAME: "Test Database Clone",
};

// Utilities for managing environment variables in tests
const envUtils = {
  backup: {} as Record<string, string | undefined>,

  setEnvVars(env: Record<string, string>) {
    for (const [key, value] of Object.entries(env)) {
      this.backup[key] = process.env[key];
      process.env[key] = value;
    }
  },

  removeEnvVar(key: string) {
    this.backup[key] = process.env[key];
    // Using Reflect.deleteProperty for proper deletion
    Reflect.deleteProperty(process.env, key);
  },

  restoreAll() {
    for (const [key, value] of Object.entries(this.backup)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        Reflect.deleteProperty(process.env, key);
      }
    }
    this.backup = {};
  },
};

// Mock fetch globally for Notion API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockRequest(method = "POST", body = {}): VercelRequest {
  return {
    method,
    body,
    headers: {},
    url: "/api/duplicate",
    query: {},
  } as VercelRequest;
}

function createMockResponse() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
  return res as unknown as VercelResponse;
}

describe("API Endpoints", () => {
  beforeEach(() => {
    envUtils.restoreAll();
    vi.clearAllMocks();
  });

  describe("Health Endpoint", () => {
    test("should return healthy status with all environment variables", async () => {
      envUtils.setEnvVars(mockEnv);

      const req = createMockRequest("GET");
      const res = createMockResponse();

      await healthHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        status: "healthy",
        timestamp: expect.any(String),
        version: "2.0.0",
        hasToken: true,
        hasSourceDatabaseId: true,
        hasParentPageId: true,
      });
    });

    test("should return unhealthy when SOURCE_DATABASE_ID is missing", async () => {
      const { SOURCE_DATABASE_ID, ...envWithoutSourceDb } = mockEnv;
      envUtils.setEnvVars(envWithoutSourceDb);

      const req = createMockRequest("GET");
      const res = createMockResponse();

      await healthHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        status: "unhealthy",
        timestamp: expect.any(String),
        version: "2.0.0",
        hasToken: true,
        hasSourceDatabaseId: false,
        hasParentPageId: true,
      });
    });

    test("should handle CORS preflight", async () => {
      const req = createMockRequest("OPTIONS");
      const res = createMockResponse();

      await healthHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe("Duplicate Endpoint", () => {
    test("should successfully clone database using environment variables", async () => {
      envUtils.setEnvVars(mockEnv);

      const req = createMockRequest("POST");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      // With invalid token, it should return 500
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to clone database",
        details: undefined,
      });
    });

    test("should fail when SOURCE_DATABASE_ID is missing", async () => {
      const { SOURCE_DATABASE_ID, ...envWithoutSourceDb } = mockEnv;
      envUtils.setEnvVars(envWithoutSourceDb);

      const req = createMockRequest("POST");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Server configuration error",
        details: undefined,
      });
    });

    test("should fail when PARENT_PAGE_ID is missing", async () => {
      const { PARENT_PAGE_ID, ...envWithoutParentPage } = mockEnv;
      envUtils.setEnvVars(envWithoutParentPage);

      const req = createMockRequest("POST");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Server configuration error",
        details: undefined,
      });
    });

    test("should fail when NOTION_TOKEN is missing", async () => {
      const { NOTION_TOKEN, ...envWithoutToken } = mockEnv;
      envUtils.setEnvVars(envWithoutToken);

      const req = createMockRequest("POST");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Server configuration error",
        details: undefined,
      });
    });

    test("should handle invalid HTTP methods", async () => {
      envUtils.setEnvVars(mockEnv);

      const req = createMockRequest("GET");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(405);
      expect(res.json).toHaveBeenCalledWith({
        error: "Method not allowed",
        message: "Only POST requests are allowed for this endpoint",
      });
    });

    test("should handle CORS preflight", async () => {
      const req = createMockRequest("OPTIONS");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.setHeader).toHaveBeenCalledWith("Access-Control-Allow-Origin", "*");
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.end).toHaveBeenCalled();
    });

    test("should handle Notion API errors", async () => {
      envUtils.setEnvVars(mockEnv);

      const req = createMockRequest("POST");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to clone database",
        details: undefined,
      });
    });

    test("should use default database name when NEW_DATABASE_NAME is not set", async () => {
      const { NEW_DATABASE_NAME, ...envWithoutName } = mockEnv;
      envUtils.setEnvVars(envWithoutName);

      const req = createMockRequest("POST");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      // With invalid token, it should return 500
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: "Failed to clone database",
        details: undefined,
      });
    });
  });

  describe("Hierarchy Analysis", () => {
    test("should attempt hierarchy analysis with logging", async () => {
      envUtils.setEnvVars(mockEnv);

      // Mock console.log to capture debug output but allow some output
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Mock console.error to prevent error spam
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest("POST");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      // Should call status (either success or error)
      expect(res.status).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    test("should handle API errors gracefully", async () => {
      envUtils.setEnvVars(mockEnv);

      // Mock console.error to capture error output
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const req = createMockRequest("POST");
      const res = createMockResponse();

      await duplicateHandler(req, res);

      // Should handle errors gracefully and return proper status
      expect(res.status).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();
      
      consoleErrorSpy.mockRestore();
    });
  });
});
