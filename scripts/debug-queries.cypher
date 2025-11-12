// Debug queries for exploring Cognia database
// Run these in Neo4j Browser (http://localhost:7474)
// Default credentials: neo4j / password

// === Overview Queries ===

// Count all nodes by label
MATCH (n)
RETURN labels(n) AS label, count(*) AS count
ORDER BY count DESC;

// Count all relationships by type
MATCH ()-[r]->()
RETURN type(r) AS relationship, count(*) AS count
ORDER BY count DESC;

// Database summary
MATCH (n)
WITH labels(n) AS labels, count(*) AS nodeCount
MATCH ()-[r]->()
WITH labels, nodeCount, type(r) AS relType, count(*) AS relCount
RETURN {
  nodes: collect(DISTINCT {label: labels, count: nodeCount}),
  relationships: collect(DISTINCT {type: relType, count: relCount})
} AS summary;


// === Session Queries ===

// List all sessions with message counts
MATCH (s:Session)
OPTIONAL MATCH (s)-[:HAS_MESSAGE]->(m:Message)
WITH s, count(m) AS messageCount
RETURN s.id AS sessionId, s.startedAt AS startedAt, messageCount
ORDER BY s.startedAt DESC
LIMIT 10;

// Get latest session with all its messages
MATCH (s:Session)
WITH s ORDER BY s.startedAt DESC LIMIT 1
MATCH (s)-[:HAS_MESSAGE]->(m:Message)
RETURN s.id AS sessionId, 
       m.id AS messageId, 
       m.role AS role, 
       m.text AS text, 
       m.ts AS timestamp
ORDER BY m.ts;

// Find sessions by date range (last 7 days)
MATCH (s:Session)-[:HAS_MESSAGE]->(m:Message)
WHERE m.ts > datetime() - duration('P7D')
RETURN DISTINCT s.id AS sessionId, 
       min(m.ts) AS firstMessage, 
       max(m.ts) AS lastMessage, 
       count(m) AS messageCount
ORDER BY lastMessage DESC;


// === Message Queries ===

// Recent messages across all sessions
MATCH (m:Message)
RETURN m.id AS messageId, 
       m.role AS role, 
       m.text AS text, 
       m.ts AS timestamp, 
       m.importance AS importance
ORDER BY m.ts DESC
LIMIT 20;

// Messages with their session context
MATCH (s:Session)-[:HAS_MESSAGE]->(m:Message)
RETURN s.id AS sessionId, 
       m.role AS role, 
       m.text AS text, 
       m.ts AS timestamp
ORDER BY m.ts DESC
LIMIT 20;

// Search messages by text content
MATCH (m:Message)
WHERE m.text CONTAINS 'search_term_here'
RETURN m.id AS messageId, 
       m.role AS role, 
       m.text AS text, 
       m.ts AS timestamp
ORDER BY m.ts DESC;


// === Entity Queries ===

// List all entities with counts
MATCH (e:Entity)
RETURN e.type AS type, e.name AS name, count(*) AS occurrences
ORDER BY occurrences DESC, type, name
LIMIT 50;

// Entities by type
MATCH (e:Entity)
WHERE e.type = 'PERSON'
RETURN e.name AS name, e.type AS type, e.canonical_id AS id
ORDER BY name
LIMIT 20;

// Find which messages mention a specific entity
MATCH (m:Message)-[:MENTIONS]->(e:Entity)
WHERE e.name = 'entity_name_here'
RETURN m.text AS message, m.ts AS timestamp, e.type AS entityType
ORDER BY m.ts DESC;

// Entity co-occurrence (entities mentioned together)
MATCH (m:Message)-[:MENTIONS]->(e1:Entity)
MATCH (m)-[:MENTIONS]->(e2:Entity)
WHERE e1.name < e2.name
RETURN e1.name AS entity1, e2.name AS entity2, count(m) AS coOccurrences
ORDER BY coOccurrences DESC
LIMIT 20;


// === Fact Queries ===

// Recent facts
MATCH (f:Fact)
RETURN f.id AS factId, 
       f.fact AS fact, 
       f.confidence AS confidence, 
       f.createdAt AS createdAt
ORDER BY f.createdAt DESC
LIMIT 20;

// Facts about a specific entity
MATCH (f:Fact)-[:ABOUT]->(e:Entity)
WHERE e.name = 'entity_name_here'
RETURN f.fact AS fact, 
       f.confidence AS confidence, 
       e.name AS entity, 
       e.type AS entityType
ORDER BY f.confidence DESC;

// Facts from specific messages
MATCH (m:Message)-[:EXTRACTED_FACT]->(f:Fact)
RETURN m.text AS message, 
       f.fact AS fact, 
       f.confidence AS confidence
ORDER BY m.ts DESC
LIMIT 20;


// === Tool Usage Queries ===

// Tool call summary
MATCH (t:ToolCall)
RETURN t.name AS tool, 
       t.status AS status, 
       count(*) AS count, 
       avg(t.latency) AS avgLatency
ORDER BY count DESC;

// Recent tool calls
MATCH (t:ToolCall)
RETURN t.name AS tool, 
       t.status AS status, 
       t.latency AS latency, 
       t.timestamp AS timestamp, 
       t.description AS description
ORDER BY t.timestamp DESC
LIMIT 20;

// Failed tool calls
MATCH (t:ToolCall)
WHERE t.status = 'failed'
RETURN t.name AS tool, 
       t.description AS description, 
       t.timestamp AS timestamp
ORDER BY t.timestamp DESC
LIMIT 20;

// Tool calls by message
MATCH (m:Message)-[:USED_TOOL]->(t:ToolCall)
RETURN m.text AS message, 
       t.name AS tool, 
       t.status AS status, 
       t.latency AS latency
ORDER BY m.ts DESC
LIMIT 20;


// === User Preferences ===

// List all user preferences
MATCH (u:User)-[:HAS_PREFERENCE]->(p:Preference)
RETURN u.id AS userId, 
       p.key AS key, 
       p.value AS value, 
       p.confidence AS confidence
ORDER BY u.id, p.key;


// === Graph Traversal Examples ===

// Full context for a session
MATCH (s:Session {id: 'session-id-here'})
OPTIONAL MATCH (s)-[:HAS_MESSAGE]->(m:Message)
OPTIONAL MATCH (m)-[:MENTIONS]->(e:Entity)
OPTIONAL MATCH (m)-[:EXTRACTED_FACT]->(f:Fact)
OPTIONAL MATCH (m)-[:USED_TOOL]->(t:ToolCall)
RETURN s, m, e, f, t;

// Entity relationship graph
MATCH path = (e1:Entity)<-[:MENTIONS]-(m:Message)-[:MENTIONS]->(e2:Entity)
WHERE e1.name <> e2.name
RETURN path
LIMIT 50;

// Message to entity to fact path
MATCH path = (m:Message)-[:MENTIONS]->(e:Entity)<-[:ABOUT]-(f:Fact)
RETURN path
LIMIT 20;
