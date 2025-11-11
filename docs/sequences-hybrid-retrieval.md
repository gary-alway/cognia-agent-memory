# Hybrid Retrieval with Expansion Sequence

This sequence diagram shows the advanced retrieval process with pattern expansion and reranking. **Note:** This diagram shows the core retrieval flow. When `includeArchived` is enabled (default), archived sessions from MinIO are also searched and merged with these results. See [sequences-recall-memories.md](sequences-recall-memories.md) for the complete flow including archived memory.

```mermaid
sequenceDiagram
    participant Client
    participant AdvancedRetrieval as Advanced Retrieval
    participant Neo4j
    participant EmbeddingsClient as Embeddings Client
    participant PreferenceService as Preference Service

    Client->>AdvancedRetrieval: retrieveWithExpansionAndRerank(query, userId, topK)
    
    AdvancedRetrieval->>EmbeddingsClient: generateEmbedding(query)
    EmbeddingsClient-->>AdvancedRetrieval: queryEmbedding[1024]
    
    AdvancedRetrieval->>PreferenceService: getUserPreferences(userId)
    PreferenceService->>Neo4j: MATCH (u:User)-[:HAS_PREFERENCE]->(p)
    Neo4j-->>PreferenceService: preferences[]
    PreferenceService-->>AdvancedRetrieval: preferences[]
    
    par Pattern Expansion
        AdvancedRetrieval->>Neo4j: Vector search for entities in query
        Neo4j-->>AdvancedRetrieval: entities[] (top 5)
        
        loop For each entity
            AdvancedRetrieval->>Neo4j: 1-hop: Find messages mentioning entity
            Neo4j-->>AdvancedRetrieval: messages[]
            AdvancedRetrieval->>Neo4j: 2-hop: Find facts about entity
            Neo4j-->>AdvancedRetrieval: facts[]
        end
    and Vector Search
        AdvancedRetrieval->>Neo4j: db.index.vector.queryNodes('msg_emb_idx', topK, embedding)
        Neo4j-->>AdvancedRetrieval: messages[] with similarity scores
        AdvancedRetrieval->>Neo4j: db.index.vector.queryNodes('fact_emb_idx', 3, embedding)
        Neo4j-->>AdvancedRetrieval: facts[] with similarity scores
    end
    
    AdvancedRetrieval->>AdvancedRetrieval: Combine results
    AdvancedRetrieval->>AdvancedRetrieval: Calculate final scores
    Note over AdvancedRetrieval: Score = 0.7 * vector_score +<br/>0.2 * recency_decay +<br/>0.1 * importance +<br/>preference_bonus
    
    AdvancedRetrieval->>AdvancedRetrieval: Sort by final_score
    AdvancedRetrieval->>AdvancedRetrieval: Limit to topK
    
    AdvancedRetrieval-->>Client: {messages, facts, entities, expanded}
```

