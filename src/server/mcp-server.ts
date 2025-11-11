#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getArchivalService,
  restoreSessionToNeo4j,
} from "../archival/archival.js";
import { getEmbeddingsClient } from "../clients/embeddings.js";
import { getConnection } from "../core/db.js";
import { initializeSchema } from "../core/schema.js";
import {
  validateObjectName,
  validatePositiveInteger,
} from "../core/validation.js";
import {
  ingestEnrichedMessage,
  ingestWithToolTracking,
} from "../ingestion/enriched_ingest.js";
import {
  associateSessionWithUser,
  createOrUpdatePreference,
} from "../memory/preferences.js";
import { retrieveWithExpansionAndRerank } from "../retrieval/advanced_retrieval.js";

const server = new Server(
  {
    name: "cognia-memory",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

function getOrCreateSession(sessionId?: string): string {
  if (sessionId) {
    return sessionId;
  }
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `mcp-session-${timestamp.toString(36)}-${random}`;
}

function getOrCreateUser(userId?: string): string {
  if (userId) {
    return userId;
  }
  return "mcp-user-default";
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "store_memory",
        description:
          "Store a message in agent memory with entity and fact extraction. CRITICAL: Store the ACTUAL message content verbatim, NOT a description or summary. Examples: If you wrote code, store the actual code. If the user said something, store their exact words. NEVER store meta-descriptions like 'I wrote X' or 'User asked me to Y' - those are summaries, not the actual content. The system will warn you if it detects summary patterns.",
        inputSchema: {
          type: "object",
          properties: {
            role: {
              type: "string",
              enum: ["user", "assistant"],
              description: "Role of the message sender",
            },
            content: {
              type: "string",
              description:
                "The ACTUAL message content to store verbatim. CRITICAL: Store the real content (code, user's exact words, technical details, etc.), NOT descriptions like 'I wrote X', 'User asked Y', 'This is a summary of Z'. The system validates this and will warn if summary patterns are detected.",
            },
            importance: {
              type: "number",
              description: "Importance score 0-1 (default: 0.5)",
              default: 0.5,
            },
            session_id: {
              type: "string",
              description: "Optional session ID (default: auto-generated)",
            },
            user_id: {
              type: "string",
              description: "Optional user ID (default: 'mcp-user-default')",
            },
          },
          required: ["role", "content"],
        },
      },
      {
        name: "recall_memories",
        description:
          "Search agent memory for relevant past conversations using semantic similarity",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What to search for in memory",
            },
            top_k: {
              type: "number",
              description: "Number of results to return (default: 5)",
              default: 5,
            },
            include_archived: {
              type: "boolean",
              description:
                "Include archived memory in search (default: false, adds ~1000ms latency)",
              default: false,
            },
            user_id: {
              type: "string",
              description: "Optional user ID (default: 'mcp-user-default')",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "track_tool_usage",
        description: "Track a tool call with its outcome for pattern learning",
        inputSchema: {
          type: "object",
          properties: {
            tool_name: {
              type: "string",
              description: "Name of the tool that was called",
            },
            args: {
              type: "object",
              description: "Arguments passed to the tool",
            },
            status: {
              type: "string",
              enum: ["success", "failed"],
              description: "Did the tool call succeed or fail?",
            },
            latency_ms: {
              type: "number",
              description: "How long the tool took (optional)",
            },
            description: {
              type: "string",
              description: "Brief description of what happened",
            },
            session_id: {
              type: "string",
              description: "Optional session ID (default: auto-generated)",
            },
            user_id: {
              type: "string",
              description: "Optional user ID (default: 'mcp-user-default')",
            },
          },
          required: ["tool_name", "status", "description"],
        },
      },
      {
        name: "set_preference",
        description: "Set a user preference for personalized memory retrieval",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description:
                "Preference key (e.g., 'tone', 'detail_level', 'language')",
            },
            value: {
              type: "string",
              description: "Preference value",
            },
            confidence: {
              type: "number",
              description: "Confidence 0-1 (default: 1.0)",
              default: 1.0,
            },
            user_id: {
              type: "string",
              description: "Optional user ID (default: 'mcp-user-default')",
            },
          },
          required: ["key", "value"],
        },
      },
      {
        name: "get_preferences",
        description: "Get all user preferences",
        inputSchema: {
          type: "object",
          properties: {
            user_id: {
              type: "string",
              description: "Optional user ID (default: 'mcp-user-default')",
            },
          },
        },
      },
      {
        name: "get_session_info",
        description: "Get current session and user IDs",
        inputSchema: {
          type: "object",
          properties: {
            session_id: {
              type: "string",
              description: "Optional session ID (default: auto-generated)",
            },
            user_id: {
              type: "string",
              description: "Optional user ID (default: 'mcp-user-default')",
            },
          },
        },
      },
      {
        name: "list_archived_sessions",
        description:
          "List archived sessions from MinIO with metadata (session IDs, timestamps, message counts)",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Maximum number of sessions to return (default: 50)",
              default: 50,
            },
          },
        },
      },
      {
        name: "replay_session",
        description:
          "Retrieve and replay an archived session. Optionally restore it back to Neo4j for search.",
        inputSchema: {
          type: "object",
          properties: {
            object_name: {
              type: "string",
              description:
                "The object name of the archived session (from list_archived_sessions)",
            },
            restore_to_neo4j: {
              type: "boolean",
              description:
                "Whether to restore the session back to Neo4j for search (default: false)",
              default: false,
            },
          },
          required: ["object_name"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: "Missing arguments",
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const conn = getConnection();
    const embeddingsClient = getEmbeddingsClient();
    const session = conn.session();
    const currentSessionId = getOrCreateSession(
      args.session_id as string | undefined,
    );
    const currentUserId = getOrCreateUser(args.user_id as string | undefined);

    try {
      if (name === "store_memory") {
        const role = args.role as string;
        const content = args.content as string;
        const importance = (args.importance as number) || 0.5;

        await session.executeWrite((tx) => {
          associateSessionWithUser(tx, currentSessionId, currentUserId);
        });

        const messageId = await ingestEnrichedMessage(
          session,
          currentSessionId,
          role,
          content,
          {
            importance,
            extractEntities: true,
            extractFacts: role === "assistant",
          },
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message_id: messageId,
                  session_id: currentSessionId,
                  stored:
                    content.length > 100
                      ? `${content.slice(0, 100)}...`
                      : content,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (name === "recall_memories") {
        const query = args.query as string;
        const topK = (args.top_k as number) || 5;
        const includeArchived = (args.include_archived as boolean) || false;

        try {
          const queryEmbedding =
            await embeddingsClient.generateEmbedding(query);

          let results: Awaited<
            ReturnType<typeof retrieveWithExpansionAndRerank>
          >;
          try {
            results = await session.executeRead((tx) =>
              retrieveWithExpansionAndRerank(
                tx,
                queryEmbedding,
                currentUserId,
                topK,
                true,
                includeArchived,
              ),
            );
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error:
                      error instanceof Error
                        ? error.message
                        : "Failed to retrieve memories",
                    query,
                    memories: [],
                    facts: [],
                    entities: [],
                  }),
                },
              ],
              isError: true,
            };
          }

          if (!results) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    query,
                    memories: [],
                    facts: [],
                    entities: [],
                  }),
                },
              ],
            };
          }

          const messages = results.messages || [];
          const memories = messages.map((msg) => ({
            role: msg.role || "unknown",
            text: msg.text || "",
            score: msg.final_score || msg.score || 0,
            timestamp: msg.ts || "",
          }));

          const facts =
            results.facts && Array.isArray(results.facts)
              ? results.facts.slice(0, 3).map((fact) => ({
                  text: fact.text || "",
                  score: fact.final_score || fact.score || 0,
                }))
              : [];

          const entities =
            results.expanded?.entities &&
            Array.isArray(results.expanded.entities)
              ? results.expanded.entities.slice(0, 5).map((ent) => ({
                  type: ent.type || "unknown",
                  name: ent.name || "",
                }))
              : [];

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    query,
                    memories,
                    facts,
                    entities,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to retrieve memories",
                  query,
                  memories: [],
                  facts: [],
                  entities: [],
                }),
              },
            ],
            isError: true,
          };
        }
      }

      if (name === "track_tool_usage") {
        const toolName = args.tool_name as string;
        const toolArgs = (args.args as Record<string, unknown>) || {};
        const status = args.status as string;
        const latencyMs = args.latency_ms as number | undefined;
        const description = args.description as string;
        const toolSessionId = getOrCreateSession(
          args.session_id as string | undefined,
        );
        const toolUserId = getOrCreateUser(args.user_id as string | undefined);

        await session.executeWrite((tx) => {
          associateSessionWithUser(tx, toolSessionId, toolUserId);
        });

        const [messageId, toolCallId] = await ingestWithToolTracking(
          session,
          toolSessionId,
          "assistant",
          description,
          toolName,
          toolArgs,
          status,
          latencyMs,
        );

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  tool_call_id: toolCallId,
                  message_id: messageId,
                  status,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (name === "set_preference") {
        const key = args.key as string;
        const value = args.value as string;
        const confidence = (args.confidence as number) || 1.0;
        const prefUserId = getOrCreateUser(args.user_id as string | undefined);

        await session.executeWrite((tx) => {
          createOrUpdatePreference(tx, prefUserId, key, value, confidence);
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  preference: {
                    key,
                    value,
                    confidence,
                  },
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (name === "get_preferences") {
        const prefUserId = getOrCreateUser(args.user_id as string | undefined);
        const txc = session.beginTransaction();
        try {
          const result = await txc.run(
            `
            MATCH (u:User {id: $user_id})-[:HAS_PREFERENCE]->(p:Preference)
            RETURN p.key AS key, p.value AS value, p.confidence AS confidence
            `,
            { user_id: prefUserId },
          );
          const records = result.records;

          if (!records || records.length === 0) {
            await txc.commit();
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      user_id: prefUserId,
                      preferences: [],
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          }
          const prefs = records.map((record) => {
            const confidenceValue = record.get("confidence");
            const confidence =
              typeof confidenceValue === "number"
                ? confidenceValue
                : ((confidenceValue as { toNumber(): number })?.toNumber() ??
                  1.0);
            return {
              key: record.get("key") as string,
              value: record.get("value") as string,
              confidence,
            };
          });
          await txc.commit();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    user_id: prefUserId,
                    preferences: prefs,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          await txc.rollback();
          throw error;
        }
      }

      if (name === "get_session_info") {
        const infoSessionId = getOrCreateSession(
          args.session_id as string | undefined,
        );
        const infoUserId = getOrCreateUser(args.user_id as string | undefined);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  session_id: infoSessionId,
                  user_id: infoUserId,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (name === "list_archived_sessions") {
        let limit = 50;
        if (args.limit !== undefined) {
          try {
            limit = validatePositiveInteger(args.limit, 1, 1000);
          } catch (error) {
            let errorMessage =
              "Invalid limit parameter. Must be an integer between 1 and 1000";
            if (error && typeof error === "object" && "issues" in error) {
              const zodError = error as { issues: Array<{ message: string }> };
              if (
                Array.isArray(zodError.issues) &&
                zodError.issues.length > 0
              ) {
                errorMessage = `Invalid limit parameter: ${zodError.issues[0].message}`;
              }
            } else if (error instanceof Error) {
              errorMessage = error.message;
            }
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: errorMessage,
                    sessions: [],
                  }),
                },
              ],
              isError: true,
            };
          }
        }

        const archivalService = getArchivalService();

        try {
          const sessions =
            await archivalService.listArchivedSessionsWithMetadata();
          const limitedSessions = sessions.slice(0, limit);

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    sessions: limitedSessions,
                    total: sessions.length,
                    returned: limitedSessions.length,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to list archived sessions",
                  sessions: [],
                }),
              },
            ],
            isError: true,
          };
        }
      }

      if (name === "replay_session") {
        let objectName: string;
        try {
          objectName = validateObjectName(args.object_name);
        } catch (error) {
          let errorMessage =
            "Invalid object_name parameter. Must match pattern: sessions/{sessionId}/{timestamp}.json";
          if (error && typeof error === "object" && "issues" in error) {
            const zodError = error as { issues: Array<{ message: string }> };
            if (Array.isArray(zodError.issues) && zodError.issues.length > 0) {
              errorMessage = `Invalid object_name parameter: ${zodError.issues[0].message}`;
            }
          } else if (error instanceof Error) {
            errorMessage = error.message;
          }
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error: errorMessage,
                }),
              },
            ],
            isError: true,
          };
        }

        const restoreToNeo4j =
          typeof args.restore_to_neo4j === "boolean"
            ? args.restore_to_neo4j
            : false;
        const archivalService = getArchivalService();

        try {
          const sessionData = await archivalService.retrieveSession(objectName);

          if (!Array.isArray(sessionData.messages)) {
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: "Invalid session data: messages is not an array",
                  }),
                },
              ],
              isError: true,
            };
          }

          const sortedMessages = [...sessionData.messages].sort((a, b) => {
            const timeA = new Date(a.ts).getTime();
            const timeB = new Date(b.ts).getTime();
            if (isNaN(timeA) || isNaN(timeB)) {
              return 0;
            }
            return timeA - timeB;
          });

          let restoreResult = null;
          if (restoreToNeo4j) {
            const restoreStats = await restoreSessionToNeo4j(
              session,
              sessionData,
            );
            restoreResult = restoreStats;
          }

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(
                  {
                    session_id: sessionData.id,
                    object_name: objectName,
                    messages: sortedMessages.map((msg) => ({
                      role: msg.role,
                      text: msg.text,
                      timestamp: msg.ts,
                    })),
                    entities: sessionData.entities || [],
                    tools: sessionData.tools || [],
                    message_count: sortedMessages.length,
                    restored_to_neo4j: restoreToNeo4j,
                    restore_result: restoreResult,
                  },
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  error:
                    error instanceof Error
                      ? error.message
                      : "Failed to replay session",
                }),
              },
            ],
            isError: true,
          };
        }
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    } finally {
      await session.close();
    }
  } catch (error) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error:
              error instanceof Error
                ? error.message
                : "Failed to initialize connection or client",
          }),
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);

    const conn = getConnection();

    (async () => {
      try {
        if (!(await conn.checkConnection())) {
          return;
        }

        const session = conn.session();
        try {
          await initializeSchema(session);
        } finally {
          await session.close();
        }
      } catch {
        // Ignore initialization errors
      }
    })();
  } catch (error) {
    process.exit(1);
  }
}

main().catch(() => {
  process.exit(1);
});
