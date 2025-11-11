// Verify schema was initialized correctly
// Run this in Neo4j Browser (http://localhost:7474)

// Check constraints
SHOW CONSTRAINTS;

// Check indexes (including vector indexes)
SHOW INDEXES;

// Check vector indexes specifically
CALL db.indexes() YIELD name, type, state, properties
WHERE type = 'VECTOR'
RETURN name, type, state, properties;

// Verify specific constraints exist
SHOW CONSTRAINTS
WHERE name IN ['session_id', 'message_id', 'user_id', 'entity_canonical_id', 'fact_id', 'tool_call_id'];

// Verify specific indexes exist
SHOW INDEXES
WHERE name IN ['message_ts', 'entity_type_name', 'tool_call_status', 'msg_emb_idx', 'fact_emb_idx'];

