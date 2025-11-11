import type { Driver, Session } from "neo4j-driver";
import neo4j from "neo4j-driver";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Neo4jConnection, getConnection } from "./db.js";

vi.mock("neo4j-driver", () => {
  const mockSession = {
    run: vi.fn(),
    close: vi.fn(),
  } as unknown as Session;

  const mockDriver = {
    session: vi.fn(() => mockSession),
    close: vi.fn(),
  } as unknown as Driver;

  return {
    default: {
      driver: vi.fn(() => mockDriver),
      auth: {
        basic: vi.fn((user: string, password: string) => ({ user, password })),
      },
      int: (value: number) => ({ toNumber: () => value }),
    },
  };
});

describe("Neo4jConnection", () => {
  let connection: Neo4jConnection;
  let mockDriver: Driver;
  let mockSession: Session;

  beforeEach(() => {
    vi.clearAllMocks();
    connection = new Neo4jConnection();

    mockSession = {
      run: vi.fn().mockResolvedValue({
        records: [{ get: vi.fn(() => ({ toNumber: () => 1 })) }],
      }),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Session;

    mockDriver = {
      session: vi.fn(() => mockSession),
      close: vi.fn().mockResolvedValue(undefined),
    } as unknown as Driver;

    (neo4j.driver as ReturnType<typeof vi.fn>).mockReturnValue(mockDriver);
  });

  afterEach(async () => {
    await connection.close();
  });

  describe("constructor", () => {
    it("should use default config values when no parameters provided", () => {
      const conn = new Neo4jConnection();
      expect(conn).toBeInstanceOf(Neo4jConnection);
    });

    it("should use provided parameters when provided", () => {
      const conn = new Neo4jConnection(
        "bolt://custom:7687",
        "custom_user",
        "custom_password",
      );
      expect(conn).toBeInstanceOf(Neo4jConnection);
    });
  });

  describe("driver", () => {
    it("should create driver on first access", () => {
      const driver = connection.driver;
      expect(neo4j.driver).toHaveBeenCalled();
      expect(driver).toBe(mockDriver);
    });

    it("should reuse driver on subsequent access", () => {
      const driver1 = connection.driver;
      const driver2 = connection.driver;
      expect(neo4j.driver).toHaveBeenCalledTimes(1);
      expect(driver1).toBe(driver2);
    });
  });

  describe("close", () => {
    it("should close driver and reset to null", async () => {
      connection.driver;
      await connection.close();
      expect(mockDriver.close).toHaveBeenCalledTimes(1);
    });

    it("should not throw if driver is null", async () => {
      await expect(connection.close()).resolves.not.toThrow();
    });
  });

  describe("checkConnection", () => {
    it("should return true when connection is successful", async () => {
      const result = await connection.checkConnection();
      expect(result).toBe(true);
      expect(mockDriver.session).toHaveBeenCalledTimes(1);
      expect(mockSession.run).toHaveBeenCalledWith("RETURN 1 as num");
      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });

    it("should return false when connection fails", async () => {
      (mockSession.run as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("Connection failed"),
      );
      const result = await connection.checkConnection();
      expect(result).toBe(false);
      expect(mockSession.close).toHaveBeenCalledTimes(1);
    });
  });

  describe("session", () => {
    it("should return a session from the driver", () => {
      const session = connection.session();
      expect(mockDriver.session).toHaveBeenCalledTimes(1);
      expect(session).toBe(mockSession);
    });
  });

  describe("edge cases and error handling", () => {
    describe("checkConnection", () => {
      it("should handle session creation failure", async () => {
        (mockDriver.session as ReturnType<typeof vi.fn>).mockImplementation(
          () => {
            throw new Error("Session creation failed");
          },
        );

        const result = await connection.checkConnection();
        expect(result).toBe(false);
      });

      it("should handle session close failure", async () => {
        (mockSession.close as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Close failed"),
        );

        const result = await connection.checkConnection();
        expect(result).toBe(false);
      });

      it("should handle timeout", async () => {
        (mockSession.run as ReturnType<typeof vi.fn>).mockImplementation(
          () =>
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 100),
            ),
        );

        const result = await connection.checkConnection();
        expect(result).toBe(false);
      });
    });

    describe("close", () => {
      it("should handle driver close failure", async () => {
        const conn = new Neo4jConnection();
        conn.driver;
        (mockDriver.close as ReturnType<typeof vi.fn>).mockRejectedValue(
          new Error("Close failed"),
        );

        await expect(conn.close()).rejects.toThrow();
      });
    });

    describe("session", () => {
      it("should handle driver session failure", () => {
        (mockDriver.session as ReturnType<typeof vi.fn>).mockImplementation(
          () => {
            throw new Error("Session creation failed");
          },
        );

        expect(() => connection.session()).toThrow("Session creation failed");
      });
    });
  });
});

describe("getConnection", () => {
  it("should return a Neo4jConnection instance", () => {
    const conn = getConnection();
    expect(conn).toBeInstanceOf(Neo4jConnection);
  });

  it("should return the same instance on subsequent calls", () => {
    const conn1 = getConnection();
    const conn2 = getConnection();
    expect(conn1).toBe(conn2);
  });
});
