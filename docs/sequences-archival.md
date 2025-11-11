# Archival Sequence

This sequence diagram shows how old sessions are archived to MinIO for long-term storage.

**Note:** Archived data is now integrated into the memory retrieval system. When `recall_memories` is called, archived sessions are searched alongside active data. See [long-term-memory.md](long-term-memory.md) for details.

```mermaid
sequenceDiagram
    participant ArchivalService as Archival Service
    participant Neo4j
    participant MinIO

    Note over ArchivalService: Scheduled or manual trigger
    
    ArchivalService->>Neo4j: Execute Read Transaction
    ArchivalService->>Neo4j: getOldSessions(daysOld=90)
    
    Note over Neo4j: Query sessions with last_activity<br/>older than cutoff date
    
    Neo4j->>Neo4j: MATCH (s:Session)-[:HAS_MESSAGE]->(m:Message)
    Neo4j->>Neo4j: WHERE max(m.ts) < cutoff
    Neo4j->>Neo4j: OPTIONAL MATCH entities, tools
    Neo4j-->>ArchivalService: sessionData[]
    
    loop For each old session
        ArchivalService->>ArchivalService: Build session JSON
        Note over ArchivalService: {id, messages,<br/>entities, tools}
        
        ArchivalService->>MinIO: Ensure bucket exists
        MinIO-->>ArchivalService: bucket ready
        
        ArchivalService->>ArchivalService: Generate object name
        Note over ArchivalService: sessions/{sessionId}/{timestamp}.json
        
        ArchivalService->>MinIO: putObject(bucket, objectName, data)
        MinIO-->>ArchivalService: objectName
        
        ArchivalService->>Neo4j: (Optional) Delete archived session
        Note over Neo4j: Session data now in MinIO
    end
    
    ArchivalService-->>ArchivalService: Return archivedCount
```

