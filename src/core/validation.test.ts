import { describe, expect, it } from "vitest";
import {
  validateObjectName,
  validateNonEmptyString,
  validatePositiveInteger,
  validateNumberInRange,
} from "./validation.js";

describe("validation", () => {
  describe("validateObjectName", () => {
    it("should validate correct object name", () => {
      const valid = "sessions/session-123/2024-01-01T00:00:00.000Z.json";
      expect(validateObjectName(valid)).toBe(valid);
    });

    it("should reject object name not starting with sessions/", () => {
      expect(() => {
        validateObjectName("other/session-123/file.json");
      }).toThrow("Object name must start with 'sessions/'");
    });

    it("should reject object name not ending with .json", () => {
      expect(() => {
        validateObjectName("sessions/session-123/file.txt");
      }).toThrow("Object name must end with '.json'");
    });

    it("should reject object name with path traversal", () => {
      expect(() => {
        validateObjectName("sessions/../etc/passwd.json");
      }).toThrow("Object name contains invalid path characters");

      expect(() => {
        validateObjectName("sessions//session-123/file.json");
      }).toThrow("Object name contains invalid path characters");
    });

    it("should reject object name with wrong number of parts", () => {
      expect(() => {
        validateObjectName("sessions/file.json");
      }).toThrow("Object name must match pattern");

      expect(() => {
        validateObjectName("sessions/session-123/sub/file.json");
      }).toThrow("Object name must match pattern");
    });

    it("should reject empty string", () => {
      expect(() => {
        validateObjectName("");
      }).toThrow();
    });

    it("should reject non-string values", () => {
      expect(() => {
        validateObjectName(null as unknown as string);
      }).toThrow();

      expect(() => {
        validateObjectName(123 as unknown as string);
      }).toThrow();
    });
  });

  describe("validateNonEmptyString", () => {
    it("should validate non-empty strings", () => {
      expect(validateNonEmptyString("hello")).toBe("hello");
      expect(validateNonEmptyString("  hello  ")).toBe("hello");
    });

    it("should reject empty strings", () => {
      expect(() => validateNonEmptyString("")).toThrow();
      expect(() => validateNonEmptyString("   ")).toThrow();
    });
  });

  describe("validatePositiveInteger", () => {
    it("should validate positive integers in range", () => {
      expect(validatePositiveInteger(1, 1, 100)).toBe(1);
      expect(validatePositiveInteger(50, 1, 100)).toBe(50);
      expect(validatePositiveInteger(100, 1, 100)).toBe(100);
    });

    it("should reject values outside range", () => {
      expect(() => validatePositiveInteger(0, 1, 100)).toThrow();
      expect(() => validatePositiveInteger(101, 1, 100)).toThrow();
    });

    it("should reject non-integers", () => {
      expect(() => validatePositiveInteger(1.5, 1, 100)).toThrow();
    });
  });

  describe("validateNumberInRange", () => {
    it("should validate numbers in range", () => {
      expect(validateNumberInRange(0.5, 0, 1)).toBe(0.5);
      expect(validateNumberInRange(0, 0, 1)).toBe(0);
      expect(validateNumberInRange(1, 0, 1)).toBe(1);
    });

    it("should reject values outside range", () => {
      expect(() => validateNumberInRange(-0.1, 0, 1)).toThrow();
      expect(() => validateNumberInRange(1.1, 0, 1)).toThrow();
    });
  });
});
