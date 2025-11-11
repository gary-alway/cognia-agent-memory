import neo4j, { type Driver, type Session } from "neo4j-driver";
import { NEO4J_PASSWORD, NEO4J_URI, NEO4J_USER } from "./config.js";
import { getLogger } from "./logger.js";

const logger = getLogger("db");

export class Neo4jConnection {
  private _driver: Driver | null = null;
  private uri: string;
  private user: string;
  private password: string;

  constructor(uri?: string, user?: string, password?: string) {
    this.uri = uri || NEO4J_URI;
    this.user = user || NEO4J_USER;
    this.password = password || NEO4J_PASSWORD;
  }

  get driver(): Driver {
    if (this._driver === null) {
      this._driver = neo4j.driver(
        this.uri,
        neo4j.auth.basic(this.user, this.password),
      );
    }
    return this._driver;
  }

  async close(): Promise<void> {
    if (this._driver !== null) {
      await this._driver.close();
      this._driver = null;
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      const session = this.driver.session();
      try {
        const result = await session.run("RETURN 1 as num");
        const record = result.records[0];
        return record?.get("num").toNumber() === 1;
      } finally {
        await session.close();
      }
    } catch (error) {
      logger.error("Connection check failed:", error);
      return false;
    }
  }

  session(): Session {
    return this.driver.session();
  }
}

let _connection: Neo4jConnection | null = null;

export function getConnection(): Neo4jConnection {
  if (_connection === null) {
    _connection = new Neo4jConnection();
  }
  return _connection;
}
