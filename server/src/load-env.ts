// ============================================================
// Simple .env loader without external dependencies
// ============================================================

import { readFileSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

/**
 * Load environment variables from .env file
 * Parses simple KEY=value format, ignores comments and empty lines
 */
export function loadEnv(): void {
  try {
    const envPath = resolve(__dirname, "..", ".env");
    const content = readFileSync(envPath, "utf-8");

    content.split("\n").forEach((line) => {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith("#")) {
        return;
      }

      // Parse KEY=value, handling inline comments
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();

        // Remove inline comments
        const commentIndex = value.indexOf("#");
        if (commentIndex > 0 && value[commentIndex - 1] === " ") {
          value = value.substring(0, commentIndex).trim();
        }

        // Set environment variable only if not already set
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });

    console.log(" Loaded environment variables from .env");
  } catch (err) {
    // Silently fail if .env doesn't exist or can't be read
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(" Warning: Could not load .env file:", (err as Error).message);
    }
  }
}
