import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { BedrockRuntimeClient, InvokeModelCommand, InvokeModelWithResponseStreamCommand, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { EventStreamCodec } from '@smithy/eventstream-codec';
import { toUtf8, fromUtf8 } from '@smithy/util-utf8';
import { Readable } from 'stream';

export interface BedrockUserCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

@Injectable()
export class BedrockIntegrationService {
  private readonly logger = new Logger(BedrockIntegrationService.name);
  private readonly token: string | undefined;
  private readonly proxy: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.token = this.configService.get<string>('AWS_BEARER_TOKEN_BEDROCK');
    this.proxy = this.configService.get<string>('HTTPS_PROXY') || this.configService.get<string>('https_proxy');
    
    if (!this.token) {
      this.logger.warn('AWS_BEARER_TOKEN_BEDROCK is not set. Bedrock fallback is limited.');
    }
  }

  private normalizeRegion(region?: string): string {
    const trimmed = String(region || '').trim();
    if (!trimmed) {
      return 'us-east-1';
    }

    const parentRegionMatch = trimmed.match(/^([a-z]{2}(?:-[a-z]+)+-\d)-[a-z0-9-]+$/i);
    if (parentRegionMatch) {
      const normalized = parentRegionMatch[1].toLowerCase();
      this.logger.warn(`Normalizing Bedrock region ${trimmed} to parent region ${normalized}`);
      return normalized;
    }

    return trimmed.toLowerCase();
  }

  /**
   * Check if a model ID is already a full Bedrock model ARN/ID (e.g. 'us.anthropic.claude-sonnet-4-6-v1:0')
   * vs a short friendly name like 'claude-haiku-4-5'.
   */
  private isFullBedrockModelId(modelId: string): boolean {
    return modelId.includes('.anthropic.') || modelId.includes('.meta.') ||
           modelId.includes('.deepseek.') || modelId.includes('.amazon.') ||
           modelId.includes('.mistral.') || modelId.startsWith('anthropic.') ||
           modelId.startsWith('meta.') || modelId.startsWith('mistral.');
  }

  /**
   * Remap legacy/incorrect model IDs to verified Bedrock model IDs.
   * Handles backward compat for IDs stored in user DB from old catalog.
   */
  private static readonly MODEL_ID_REMAP: Record<string, string> = {
    'us.anthropic.claude-opus-4-6-v1:0':   'us.anthropic.claude-opus-4-20250514-v1:0',
    'us.anthropic.claude-sonnet-4-6-v1:0':  'us.anthropic.claude-sonnet-4-20250514-v1:0',
    'us.anthropic.claude-haiku-4-5-v1:0':   'us.anthropic.claude-haiku-4-5-20251001-v1:0',
    'us.meta.llama4-maverick-v1:0':         'us.meta.llama4-maverick-17b-instruct-v1:0',
    'us.deepseek.deepseek-v3.2-v1:0':       'us.deepseek.r1-v1:0',
    'mistral.mistral-large-v1:0':           'mistral.mistral-large-2402-v1:0',
    'anthropic.claude-sonnet-4-v1:0':       'anthropic.claude-sonnet-4-20250514-v1:0',
    'anthropic.claude-haiku-4-v1:0':        'anthropic.claude-3-5-haiku-20241022-v1:0',
  };

  /**
   * Map short model names to full Bedrock IDs. Also remaps legacy IDs.
   */
  private resolveModelId(modelId: string): string {
    // First check the remap table for legacy/incorrect IDs
    const remapped = BedrockIntegrationService.MODEL_ID_REMAP[modelId];
    if (remapped) return remapped;

    if (this.isFullBedrockModelId(modelId)) return modelId;
    if (modelId.includes('opus')) return 'us.anthropic.claude-opus-4-20250514-v1:0';
    if (modelId.includes('sonnet')) return 'us.anthropic.claude-sonnet-4-20250514-v1:0';
    if (modelId.includes('haiku')) return 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
    return modelId;
  }

  /**
   * Invoke Bedrock model using user's own AWS credentials (SigV4 signing).
   */
  private async invokeWithUserCredentials(modelId: string, body: any, credentials: BedrockUserCredentials): Promise<any> {
    const region = this.normalizeRegion(credentials.region);
    const client = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });
    const response = await client.send(command);
    return JSON.parse(new TextDecoder().decode(response.body));
  }

  /**
   * Invoke Bedrock model using platform Bearer token.
   */
  private async invokeWithPlatformToken(modelId: string, body: any, region: string): Promise<any> {
    const httpsAgent = this.proxy ? new HttpsProxyAgent(this.proxy) : undefined;
    const response = await axios.post(
      `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke`,
      body,
      {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        httpsAgent,
        proxy: false,
        timeout: 60000,
      },
    );
    return response.data;
  }

  /** Check if model is Claude/Anthropic (uses native Anthropic format) vs others (use Converse API) */
  private isClaudeModel(modelId: string): boolean {
    return modelId.includes('anthropic');
  }

  /**
   * Sanitize content blocks for Bedrock:
   * - Convert image_url (OpenAI) → image/base64 (Claude)
   * - Convert image source.type:'url' → fetch & base64
   * - Convert unsupported types to text placeholders
   */
  private async sanitizeContentForBedrock(content: any): Promise<any> {
    if (!Array.isArray(content)) return content;
    return Promise.all(content.map(async (block: any) => {
      // OpenAI image_url format
      if (block.type === 'image_url' && block.image_url?.url) {
        return this.fetchImageAsBase64Block(block.image_url.url);
      }
      // Claude URL source (Bedrock doesn't support URL, only base64)
      if (block.type === 'image' && block.source?.type === 'url' && block.source?.url) {
        return this.fetchImageAsBase64Block(block.source.url);
      }
      // Audio → text placeholder (Bedrock Claude doesn't support audio natively)
      if (block.type === 'input_audio') {
        return { type: 'text', text: `[Audio attachment: ${block.input_audio?.url || 'audio'}]` };
      }
      return block;
    }));
  }

  private readonly maxInlineImageBytes = 5 * 1024 * 1024;

  private buildOversizedImageFallback(url: string, mediaType: string, sizeBytes: number) {
    const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);
    return {
      type: 'text',
      text: `[Image attachment omitted: ${mediaType}, ${sizeMb} MB after download exceeds inline model limit. URL: ${url}]`,
    };
  }

  /** Download an image URL and return a base64 image content block for Bedrock */
  private async fetchImageAsBase64Block(url: string): Promise<any> {
    try {
      const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
      const buffer = Buffer.from(resp.data);
      
      const textData = buffer.toString('utf8');
      if (textData.startsWith('http://') || textData.startsWith('https://')) {
        this.logger.log(`URL returned a redirect URL, fetching actual image: ${textData}`);
        return this.fetchImageAsBase64Block(textData.trim());
      }
      
      const contentType = resp.headers['content-type'] || 'image/png';
      const mediaType = contentType.split(';')[0].trim();
      if (buffer.length > this.maxInlineImageBytes) {
        this.logger.warn(
          `Image too large for Bedrock inline upload (${buffer.length} bytes raw, url: ${url}). Falling back to text metadata.`,
        );
        return this.buildOversizedImageFallback(url, mediaType, buffer.length);
      }
      return {
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') },
      };
    } catch (err: any) {
      this.logger.warn(`Failed to fetch image for base64 conversion: ${err.message} (url: ${url})`);
      return { type: 'text', text: `[Image: ${url}]` };
    }
  }

  /** Invoke non-Claude model via Bedrock Converse API (unified format for Llama, Mistral, Nova, etc.) */
  private async converseWithUserCredentials(
    modelId: string,
    messages: any[],
    system?: string,
    tools?: any[],
    credentials?: BedrockUserCredentials,
  ): Promise<{ text: string; toolCalls: any[]; stopReason?: string }> {
    const region = this.normalizeRegion(credentials?.region || this.configService.get<string>('AWS_REGION'));
    const client = new BedrockRuntimeClient({
      region,
      ...(credentials ? {
        credentials: {
          accessKeyId: credentials.accessKeyId,
          secretAccessKey: credentials.secretAccessKey,
        },
      } : {}),
    });

    // Convert messages to Converse format: content must be array of ContentBlock
    const converseMessages = messages.map((m: any) => ({
      role: m.role,
      content: Array.isArray(m.content)
        ? m.content.map((block: any) => {
            if (block.type === 'text') return { text: block.text };
            if (block.type === 'image' && block.source?.url) return { text: `[Image: ${block.source.url}]` };
            return { text: typeof block === 'string' ? block : JSON.stringify(block) };
          })
        : [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }));

    const input: any = {
      modelId,
      messages: converseMessages,
      inferenceConfig: { maxTokens: 4000 },
    };
    if (system) {
      input.system = [{ text: system }];
    }
    if (tools && tools.length > 0) {
      input.toolConfig = {
        tools: tools.map((t: any) => ({
          toolSpec: { name: t.name, description: t.description, inputSchema: { json: t.input_schema || t.parameters } },
        })),
      };
    }

    const command = new ConverseCommand(input);
    const response = await client.send(command);

    let text = '';
    const toolCalls: any[] = [];
    for (const block of response.output?.message?.content || []) {
      if (block.text) text += block.text;
      if (block.toolUse) {
        toolCalls.push({
          id: block.toolUse.toolUseId,
          type: 'function',
          function: { name: block.toolUse.name, arguments: JSON.stringify(block.toolUse.input) },
        });
      }
    }
    const stopReason = (response as any).stopReason || (toolCalls.length > 0 ? 'tool_use' : 'end_turn');
    return { text, toolCalls, stopReason };
  }

  /**
   * 简单的 Bedrock 调用实现 (作为紧急备选)
   */
  async invokeModel(prompt: string, modelId: string = 'us.anthropic.claude-haiku-4-5-20251001-v1:0', userCredentials?: BedrockUserCredentials): Promise<string> {
    const finalModelId = this.resolveModelId(modelId);
    const region = this.normalizeRegion(userCredentials?.region || this.configService.get<string>('AWS_REGION'));
    this.logger.log(`Calling Bedrock: ${finalModelId} (Region: ${region}, UserCreds: ${!!userCredentials})`);

    const body = {
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    };

    try {
      const data = userCredentials
        ? await this.invokeWithUserCredentials(finalModelId, body, userCredentials)
        : await this.invokeWithPlatformToken(finalModelId, body, region);
      return data.content[0].text;
    } catch (e: any) {
      this.logger.error(`Bedrock invokeModel failed: ${e.message}`);
      throw e;
    }
  }

  /**
   * 用于 HQ 的通用对话接口
   */
  async chat(messages: any[], options: { model?: string } = {}): Promise<any> {
    const prompt = messages[messages.length - 1].content;
    const text = await this.invokeModel(prompt, options.model);
    return {
      text,
      model: options.model || 'bedrock-default'
    };
  }

  /**
   * Invoke Bedrock model with streaming using user's own AWS credentials.
   */
  private async invokeStreamingWithUserCredentials(
    modelId: string,
    body: any,
    credentials: BedrockUserCredentials,
    onChunk: (text: string) => void,
  ): Promise<any> {
    const region = this.normalizeRegion(credentials.region);
    const client = new BedrockRuntimeClient({
      region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
      },
    });
    const command = new InvokeModelWithResponseStreamCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(body),
    });
    const response = await client.send(command);
    return this.consumeBedrockStream(response, onChunk);
  }

  /**
   * Invoke Bedrock model with streaming using platform Bearer token.
   * Manually frames AWS EventStream binary messages from raw HTTP stream,
   * since TCP chunks don't align with message boundaries.
   */
  private async invokeStreamingWithPlatformToken(
    modelId: string,
    body: any,
    region: string,
    onChunk: (text: string) => void,
  ): Promise<any> {
    const httpsAgent = this.proxy ? new HttpsProxyAgent(this.proxy) : undefined;
    const response = await axios.post(
      `https://bedrock-runtime.${region}.amazonaws.com/model/${modelId}/invoke-with-response-stream`,
      body,
      {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.amazon.eventstream',
        },
        httpsAgent,
        proxy: false,
        timeout: 60000,
        responseType: 'stream',
      },
    );

    const fullContent: any[] = [];
    let stopReason = '';
    let currentToolUse: any = null;
    let toolInputJson = '';
    const codec = new EventStreamCodec(toUtf8, fromUtf8);

    // Parse AWS EventStream binary frames from the raw HTTP stream.
    // TCP chunks may contain multiple messages or partial messages,
    // so we accumulate into a buffer and split by the 4-byte length prefix.
    for await (const decoded of this.parseEventStreamFrames(response.data, codec)) {
      // decoded.body is the raw payload; for Bedrock it's JSON: {"bytes":"base64..."}
      const payloadStr = new TextDecoder().decode(decoded.body);
      if (!payloadStr) continue;
      try {
        const outer = JSON.parse(payloadStr);
        const eventBytes = outer.bytes;
        if (!eventBytes) continue;
        const event = JSON.parse(Buffer.from(eventBytes, 'base64').toString('utf8'));

        if (event.type === 'content_block_delta') {
          if (event.delta?.type === 'text_delta') {
            onChunk(event.delta.text);
            fullContent.push({ type: 'text', text: event.delta.text });
          } else if (event.delta?.type === 'input_json_delta') {
            toolInputJson += event.delta.partial_json || '';
          }
        } else if (event.type === 'content_block_start') {
          if (event.content_block?.type === 'tool_use') {
            currentToolUse = event.content_block;
            toolInputJson = '';
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            try { currentToolUse.input = JSON.parse(toolInputJson || '{}'); } catch { currentToolUse.input = {}; }
            fullContent.push(currentToolUse);
            currentToolUse = null;
            toolInputJson = '';
          }
        } else if (event.type === 'message_delta') {
          stopReason = event.delta?.stop_reason || stopReason;
        }
      } catch { /* skip unparseable events */ }
    }

    let text = '';
    const toolUses: any[] = [];
    for (const item of fullContent) {
      if (item.type === 'text') text += item.text;
      else if (item.type === 'tool_use') toolUses.push(item);
    }
    return { content: [{ type: 'text', text }, ...toolUses], stop_reason: stopReason };
  }

  /**
   * Parse AWS EventStream binary frames from a raw Node.js stream.
   * Each frame has a 4-byte big-endian total-length prefix.
   * TCP chunks may contain multiple frames or partial frames.
   */
  private async *parseEventStreamFrames(
    stream: Readable,
    codec: EventStreamCodec,
  ): AsyncGenerator<{ headers: Record<string, any>; body: Uint8Array }> {
    let buffer = Buffer.alloc(0);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk instanceof Uint8Array ? Buffer.from(chunk) : Buffer.from(chunk)]);
      // Each EventStream message starts with 4-byte total length (big-endian)
      while (buffer.length >= 4) {
        const messageLength = buffer.readUInt32BE(0);
        if (messageLength < 16 || messageLength > 16 * 1024 * 1024) break; // sanity check
        if (buffer.length < messageLength) break; // need more data
        const messageBytes = buffer.subarray(0, messageLength);
        buffer = buffer.subarray(messageLength);
        try {
          yield codec.decode(messageBytes);
        } catch { /* skip malformed frame */ }
      }
    }
  }

  /**
   * Consume a Bedrock InvokeModelWithResponseStream response.
   */
  private async consumeBedrockStream(
    response: any,
    onChunk: (text: string) => void,
  ): Promise<any> {
    let text = '';
    const toolUses: any[] = [];
    let currentToolUse: any = null;
    let toolInputJson = '';

    for await (const event of response.body) {
      if (event.chunk?.bytes) {
        const parsed = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        if (parsed.type === 'content_block_delta') {
          if (parsed.delta?.type === 'text_delta') {
            onChunk(parsed.delta.text);
            text += parsed.delta.text;
          } else if (parsed.delta?.type === 'input_json_delta') {
            toolInputJson += parsed.delta.partial_json || '';
          }
        } else if (parsed.type === 'content_block_start') {
          if (parsed.content_block?.type === 'tool_use') {
            currentToolUse = parsed.content_block;
            toolInputJson = '';
          }
        } else if (parsed.type === 'content_block_stop') {
          if (currentToolUse) {
            try {
              currentToolUse.input = JSON.parse(toolInputJson || '{}');
            } catch { currentToolUse.input = {}; }
            toolUses.push(currentToolUse);
            currentToolUse = null;
            toolInputJson = '';
          }
        }
      }
    }

    return { content: [{ type: 'text', text }, ...toolUses] };
  }

  /**
   * 支持 Function Calling 的对话接口
   */
  async chatWithFunctions(messages: any[], options: any = {}): Promise<any> {
    const userCreds: BedrockUserCredentials | undefined = options.userCredentials;

    if (!this.token && !userCreds) {
      throw new Error('No Bedrock credentials available (neither platform token nor user credentials)');
    }

    const rawModel = options.model || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';
    const modelId = this.resolveModelId(rawModel);
    const region = this.normalizeRegion(userCreds?.region || this.configService.get<string>('AWS_REGION'));
    
    this.logger.log(`Bedrock chatWithFunctions: ${rawModel} → ${modelId} (Region: ${region}, UserCreds: ${!!userCreds})`);

    try {
      // Non-Claude models → Bedrock Converse API (unified format)
      if (!this.isClaudeModel(modelId)) {
        const systemMessage = messages.find(m => m.role === 'system');
        const nonSystemMessages = messages.filter(m => m.role !== 'system');
        // Deduplicate tools
        let deduped: any[] | undefined;
        if (options.tools?.length) {
          const seen = new Set<string>();
          deduped = options.tools.filter((t: any) => { if (seen.has(t.name)) return false; seen.add(t.name); return true; });
        }
        const converseResult = await this.converseWithUserCredentials(
          modelId, nonSystemMessages, systemMessage?.content, deduped, userCreds,
        );
        return {
          text: converseResult.text,
          functionCalls: converseResult.toolCalls.length > 0 ? converseResult.toolCalls : null,
          model: modelId,
          stopReason: converseResult.stopReason || (converseResult.toolCalls.length > 0 ? 'tool_use' : 'end_turn'),
        };
      }

      // Claude models → native Anthropic format via InvokeModel
      // Sanitize content: download image URLs → base64 (Bedrock rejects URL sources)
      const _sanitizeStart = Date.now();
      const claudeMessages = await Promise.all(
        messages.filter(m => m.role !== 'system').map(async (m) => ({
          role: m.role,
          content: await this.sanitizeContentForBedrock(m.content),
        })),
      );
      const _sanitizeMs = Date.now() - _sanitizeStart;
      if (_sanitizeMs > 100) {
        this.logger.warn(`⏱ sanitizeContentForBedrock took ${_sanitizeMs}ms for ${claudeMessages.length} messages`);
      }

      const systemMessage = messages.find(m => m.role === 'system');

      // 准备 Body
      const body: any = {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: options.maxTokens || 4000,
        messages: claudeMessages,
      };

      if (systemMessage) {
        // Support prompt caching: if system content is an array of blocks with cache_control, pass as-is
        if (Array.isArray(systemMessage.content) && systemMessage.content.some((b: any) => b.cache_control)) {
          body.system = systemMessage.content;
        } else {
          body.system = systemMessage.content;
        }
      }

      // 如果有工具定义，添加工具 (Bedrock Anthropic Tool Use 格式)
      // Deduplicate by name — Bedrock rejects duplicate tool names
      if (options.tools && options.tools.length > 0) {
        const seen = new Set<string>();
        body.tools = options.tools
          .filter((tool: any) => {
            if (seen.has(tool.name)) return false;
            seen.add(tool.name);
            return true;
          })
          .map((tool: any) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema || tool.parameters,
          }));
      }

      const _invokeStart = Date.now();
      const _streaming = !!options.onChunk;
      const data = userCreds
        ? (options.onChunk
          ? await this.invokeStreamingWithUserCredentials(modelId, body, userCreds, options.onChunk)
          : await this.invokeWithUserCredentials(modelId, body, userCreds))
        : (options.onChunk
          ? await this.invokeStreamingWithPlatformToken(modelId, body, region, options.onChunk).catch(async (streamErr: any) => {
              this.logger.warn(`Bedrock platform streaming failed, falling back to non-streaming: ${streamErr.message}`);
              return this.invokeWithPlatformToken(modelId, body, region);
            })
          : await this.invokeWithPlatformToken(modelId, body, region));
      this.logger.log(`⏱ Bedrock invoke (streaming=${_streaming}): ${Date.now() - _invokeStart}ms, tools=${body.tools?.length || 0}, msgs=${body.messages?.length || 0}`);

      const content = data.content;
      let text = '';
      const toolCalls: any[] = [];

      for (const item of content) {
        if (item.type === 'text') {
          text += item.text;
        } else if (item.type === 'tool_use') {
          toolCalls.push({
            id: item.id,
            type: 'function',
            function: {
              name: item.name,
              arguments: JSON.stringify(item.input)
            }
          });
        }
      }

      const stopReason = data.stop_reason || (toolCalls.length > 0 ? 'tool_use' : 'end_turn');

      return {
        text,
        functionCalls: toolCalls.length > 0 ? toolCalls : null,
        model: modelId,
        stopReason,
      };
    } catch (e: any) {
      this.logger.error(`Bedrock chatWithFunctions failed: ${e.message}`);
      if (e.response) {
        this.logger.error(`Status: ${e.response.status}, Data: ${JSON.stringify(e.response.data)}`);
      }
      throw e;
    }
  }
}
