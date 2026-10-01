import "dotenv/config";
import os from "node:os";
import path from "node:path";

process.env.APP_TIMEZONE = "America/Sao_Paulo";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = path.join(os.tmpdir(), "besmart-test-storage");
process.env.AUTH_SECRET ??= "test-secret-test-secret-test-secret-123456";
