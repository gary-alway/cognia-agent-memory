import { LLM_MODEL, LLM_TIMEOUT_MS, OLLAMA_BASE_URL } from "../core/config.js";
import { NetworkError, TimeoutError } from "../core/errors.js";
import { validateEntities } from "../core/validation.js";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface RetrievedDocument {
  title: string;
  content: string;
}

export class LLMClient {
  private baseUrl: string;
  private llmModel: string;

  constructor(baseUrl?: string, model?: string) {
    this.baseUrl = baseUrl || OLLAMA_BASE_URL;
    this.llmModel = model || LLM_MODEL;
  }

  async generateResponse(
    prompt: string,
    context?: string[],
    systemPrompt?: string,
  ): Promise<string> {
    const messages: Message[] = [];

    if (systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }

    let userContent = prompt;
    if (context && context.length > 0) {
      const contextText = context.join("\n\n---\n\n");
      userContent = `Context information:
${contextText}

---

Based on the context above, please answer the following question:
${prompt}`;
    }

    messages.push({ role: "user", content: userContent });

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.llmModel,
          messages: messages,
        }),
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new NetworkError(`HTTP error! status: ${response.status}`, {
          statusCode: response.status,
        });
      }

      const data = (await response.json()) as ChatCompletionResponse;
      return data.choices[0].message.content;
    } catch (error) {
      if (error instanceof NetworkError) {
        throw error;
      }
      if (
        error instanceof Error &&
        (error.name === "AbortError" || error.name === "TimeoutError")
      ) {
        throw new TimeoutError("Request timed out", {
          cause: error,
          timeoutMs: LLM_TIMEOUT_MS,
        });
      }
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new NetworkError("Network request failed", { cause: error });
      }
      throw new NetworkError(
        `Failed to generate response: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
  }

  async generateRagResponse(
    question: string,
    retrievedDocuments: RetrievedDocument[],
    systemPrompt?: string,
  ): Promise<string> {
    const context = retrievedDocuments.map(
      (doc) => `Title: ${doc.title}\nContent: ${doc.content}`,
    );

    const defaultSystemPrompt = `You are a knowledgeable AI assistant with access to a knowledge base. 
Answer questions based on the provided context documents. 
If the context doesn't contain sufficient information, acknowledge this and provide what you can based on the available information.
Be concise but comprehensive in your responses.`;

    return this.generateResponse(
      question,
      context,
      systemPrompt || defaultSystemPrompt,
    );
  }

  async extractEntities(
    text: string,
  ): Promise<Array<{ type: string; name: string }>> {
    const prompt = `Extract named entities from the following text. Return a JSON array of entities with 'type' and 'name' fields.
Types should be: PERSON, ORG, PRODUCT, TECH, CONCEPT, or OTHER.

Text: ${text}

Return ONLY the JSON array, no other text.`;

    const systemPrompt =
      "You are a precise entity extraction system. Return only valid JSON.";

    try {
      const response = await this.generateResponse(
        prompt,
        undefined,
        systemPrompt,
      );
      const parsed = JSON.parse(response);
      return validateEntities(parsed);
    } catch {
      return [];
    }
  }

  async extractFacts(text: string, entities: string[]): Promise<string[]> {
    const entitiesStr =
      entities.length > 0 ? entities.join(", ") : "relevant entities";
    const prompt = `Extract key facts from the following text about ${entitiesStr}.
Return a simple list of factual statements, one per line.

Text: ${text}

Return ONLY the facts, one per line, no numbering or bullets.`;

    try {
      const response = await this.generateResponse(prompt);
      const facts = response
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return facts;
    } catch {
      return [];
    }
  }
}

let _llmClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (_llmClient === null) {
    _llmClient = new LLMClient();
  }
  return _llmClient;
}
