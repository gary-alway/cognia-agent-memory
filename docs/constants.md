# Constants Reference

Reference for all constants used in Cognia's retrieval and scoring algorithms.

## Retrieval Limits

Located in `src/core/constants.ts`:

| Constant | Value | Description |
|----------|-------|-------------|
| `RETRIEVAL_LIMITS.DEFAULT_TOP_K` | `5` | Default number of results for basic similarity search |
| `RETRIEVAL_LIMITS.DEFAULT_HYBRID_TOP_K` | `30` | Default number of results for hybrid retrieval |
| `RETRIEVAL_LIMITS.DEFAULT_FACTS_TOP_K` | `10` | Default number of facts to retrieve |
| `RETRIEVAL_LIMITS.DEFAULT_FACTS_ABOUT_ENTITY` | `10` | Default number of facts about a specific entity |
| `RETRIEVAL_LIMITS.DEFAULT_TOOL_PATTERNS` | `10` | Default number of tool patterns to retrieve |
| `RETRIEVAL_LIMITS.PATTERN_EXPANSION_FACTS` | `50` | Maximum facts to include in pattern expansion |
| `RETRIEVAL_LIMITS.PATTERN_EXPANSION_TOOLS` | `20` | Maximum tools to include in pattern expansion |
| `RETRIEVAL_LIMITS.PATTERN_EXPANSION_SEED_MESSAGES` | `5` | Number of seed messages for pattern expansion |
| `RETRIEVAL_LIMITS.FAILED_SUCCESS_PATTERNS` | `5` | Number of failed-then-successful patterns to retrieve |
| `RETRIEVAL_LIMITS.RELATED_ENTITIES` | `20` | Maximum related entities to retrieve |
| `RETRIEVAL_LIMITS.HYBRID_FACTS_RATIO` | `0.3` | Ratio of facts in hybrid retrieval (30% of topK) |
| `RETRIEVAL_LIMITS.ARCHIVED_MEMORY_RATIO` | `0.3` | Ratio of archived messages in retrieval (30% of topK) |
| `RETRIEVAL_LIMITS.ARCHIVED_MEMORY_MAX_SESSIONS` | `10` | Maximum number of archived sessions to search |

## Reranking Weights

Used in `rerankResults()` to combine different scoring factors:

| Constant | Value | Description |
|----------|-------|-------------|
| `RERANK_WEIGHTS.VECTOR` | `0.7` | Weight for vector similarity score (70%) |
| `RERANK_WEIGHTS.RECENCY` | `0.2` | Weight for recency decay score (20%) |
| `RERANK_WEIGHTS.IMPORTANCE` | `0.1` | Weight for importance score (10%) |
| `RERANK_WEIGHTS.PREFERENCE_BOOST` | `0.1` | Additional boost per matching user preference |

## Fact Scoring Weights

Used when scoring facts in hybrid retrieval:

| Constant | Value | Description |
|----------|-------|-------------|
| `FACT_SCORING_WEIGHTS.SCORE` | `0.8` | Weight for similarity score (80%) |
| `FACT_SCORING_WEIGHTS.CONFIDENCE` | `0.2` | Weight for confidence score (20%) |

## Fact Confidence Calculation

Dynamic confidence calculation based on fact quality:

| Constant | Value | Description |
|----------|-------|-------------|
| `FACT_CONFIDENCE.BASE` | `0.5` | Base confidence for all facts |
| `FACT_CONFIDENCE.MIN` | `0.1` | Minimum confidence value |
| `FACT_CONFIDENCE.MAX` | `1.0` | Maximum confidence value |
| `FACT_CONFIDENCE.SHORT_PENALTY` | `0.2` | Penalty for very short facts (<10 chars) |
| `FACT_CONFIDENCE.LONG_BOOST` | `0.1` | Boost for longer facts (>100 chars) |
| `FACT_CONFIDENCE.OPTIMAL_LENGTH_BOOST` | `0.1` | Boost for optimal length facts (20-200 chars) |
| `FACT_CONFIDENCE.ENTITY_MAX_BOOST` | `0.2` | Maximum boost from entity count |
| `FACT_CONFIDENCE.ENTITY_PER_BOOST` | `0.05` | Boost per entity mentioned (up to max) |
| `FACT_CONFIDENCE.COMPLETE_SENTENCE_BOOST` | `0.1` | Boost for complete sentences (ends with .!?) |
| `FACT_CONFIDENCE.HAS_NUMBERS_BOOST` | `0.05` | Boost for facts containing numbers |

## Text Length Thresholds

Used to determine when to extract entities and facts:

| Constant | Value | Description |
|----------|-------|-------------|
| `TEXT_LENGTH_THRESHOLDS.ENTITY_EXTRACTION` | `20` | Minimum text length to extract entities |
| `TEXT_LENGTH_THRESHOLDS.FACT_EXTRACTION` | `50` | Minimum text length to extract facts |
| `TEXT_LENGTH_THRESHOLDS.SHORT_FACT` | `10` | Threshold for "short" fact (penalty) |
| `TEXT_LENGTH_THRESHOLDS.LONG_FACT` | `100` | Threshold for "long" fact (boost) |
| `TEXT_LENGTH_THRESHOLDS.OPTIMAL_FACT_MIN` | `20` | Minimum for optimal fact length |
| `TEXT_LENGTH_THRESHOLDS.OPTIMAL_FACT_MAX` | `200` | Maximum for optimal fact length |

## Default Values

| Constant | Value | Description |
|----------|-------|-------------|
| `DEFAULT_IMPORTANCE.MESSAGE` | `0.5` | Default importance for messages |
| `DEFAULT_IMPORTANCE.TOOL_TRACKING` | `0.6` | Default importance for tool tracking messages |
| `DEFAULT_CONFIDENCE.PREFERENCE` | `1.0` | Default confidence for user preferences |

## Tuning Recommendations

### Increasing Recall
- Increase `DEFAULT_HYBRID_TOP_K` to retrieve more candidates
- Increase `PATTERN_EXPANSION_FACTS` and `PATTERN_EXPANSION_TOOLS` for more context

### Improving Precision
- Decrease `DEFAULT_HYBRID_TOP_K` to focus on top results
- Adjust `RERANK_WEIGHTS` to emphasize vector similarity or recency
- Increase `FACT_SCORING_WEIGHTS.CONFIDENCE` to prioritize high-confidence facts

### Performance Optimization
- Decrease retrieval limits if queries are slow
- Reduce `PATTERN_EXPANSION_FACTS` and `PATTERN_EXPANSION_TOOLS` for faster expansion
