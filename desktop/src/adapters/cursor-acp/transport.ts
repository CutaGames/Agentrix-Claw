/**
 * Injectable stdio JSON-RPC transport seam.
 * DEVELOPMENT_SPIKE_ONLY. Tests never start a vendor process.
 */

import { CURSOR_ACP_DEFAULT_REQUEST_TIMEOUT_MS } from "./constants";
import {
  encodeJsonRpcLine,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  parseJsonRpcLine,
  CursorAcpJsonRpcError,
} from "./json-rpc";
import type {
  AcpStdioJsonRpcTransport,
  AcpStdioJsonRpcTransportOptions,
  CursorAcpJsonRpcId,
} from "./types";

type LineHandler = (line: string) => void;

interface PendingWaiter {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  cancelTimer: () => void;
}

function defaultScheduleTimeout(
  callback: () => void,
  delayMs: number,
): () => void {
  const handle = setTimeout(callback, delayMs);
  return () => clearTimeout(handle);
}

export class InMemoryAcpStdioJsonRpcTransport implements AcpStdioJsonRpcTransport {
  readonly kind = "injectable_stdio_jsonrpc" as const;
  readonly framing = "newline_delimited_json" as const;
  readonly requestTimeoutMs: number;

  private nextId = 1;
  private closed = false;
  private readonly pending = new Map<CursorAcpJsonRpcId, PendingWaiter>();
  private incomingRequestHandler:
    | ((method: string, params: unknown) => Promise<unknown>)
    | undefined;
  private incomingNotificationHandler:
    | ((method: string, params: unknown) => void)
    | undefined;
  private readonly now: () => number;
  private readonly scheduleTimeout: (
    callback: () => void,
    delayMs: number,
  ) => () => void;

  constructor(
    private readonly sendLine: (line: string) => void,
    options: AcpStdioJsonRpcTransportOptions = {},
  ) {
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? CURSOR_ACP_DEFAULT_REQUEST_TIMEOUT_MS;
    this.now = options.now ?? (() => Date.now());
    this.scheduleTimeout = options.scheduleTimeout ?? defaultScheduleTimeout;
  }

  receiveLine(line: string): void {
    if (this.closed || line.trim().length === 0) return;
    let message;
    try {
      message = parseJsonRpcLine(line);
    } catch (error) {
      this.terminate(
        error instanceof Error
          ? error
          : new CursorAcpJsonRpcError("invalid_json", "invalid line"),
      );
      return;
    }
    if (isJsonRpcResponse(message)) {
      if (message.id === null) {
        this.terminate(
          new CursorAcpJsonRpcError("unknown_schema", "response id is null"),
        );
        return;
      }
      const waiter = this.pending.get(message.id);
      if (!waiter) {
        return;
      }
      this.pending.delete(message.id);
      waiter.cancelTimer();
      if ("error" in message) {
        waiter.reject(
          new CursorAcpJsonRpcError("jsonrpc_error", message.error.message),
        );
        return;
      }
      waiter.resolve(message.result);
      return;
    }
    if (isJsonRpcRequest(message)) {
      const handler = this.incomingRequestHandler;
      if (!handler) {
        this.write({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32601,
            message: `no handler for ${message.method}`,
          },
        });
        return;
      }
      void handler(message.method, message.params)
        .then((result) => {
          this.write({
            jsonrpc: "2.0",
            id: message.id,
            result,
          });
        })
        .catch((error: unknown) => {
          this.write({
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32000,
              message:
                error instanceof Error
                  ? error.message
                  : "request handler failed",
            },
          });
        });
      return;
    }
    if (isJsonRpcNotification(message)) {
      this.incomingNotificationHandler?.(message.method, message.params);
    }
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    this.assertOpen();
    const id = this.nextId;
    this.nextId += 1;
    const deadline = this.now() + this.requestTimeoutMs;
    const result = new Promise<unknown>((resolve, reject) => {
      const cancelTimer = this.scheduleTimeout(() => {
        const waiter = this.pending.get(id);
        if (!waiter) return;
        this.pending.delete(id);
        waiter.reject(
          new CursorAcpJsonRpcError(
            "request_timeout",
            `request ${method} timed out at ${deadline}`,
          ),
        );
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, cancelTimer });
    });
    this.write({
      jsonrpc: "2.0",
      id,
      method,
      ...(params !== undefined ? { params } : {}),
    });
    return result;
  }

  async notify(method: string, params?: unknown): Promise<void> {
    this.assertOpen();
    this.write({
      jsonrpc: "2.0",
      method,
      ...(params !== undefined ? { params } : {}),
    });
  }

  setIncomingRequestHandler(
    handler: (method: string, params: unknown) => Promise<unknown>,
  ): void {
    this.incomingRequestHandler = handler;
  }

  setIncomingNotificationHandler(
    handler: (method: string, params: unknown) => void,
  ): void {
    this.incomingNotificationHandler = handler;
  }

  async close(): Promise<void> {
    this.terminate(new CursorAcpJsonRpcError("closed", "transport closed"));
  }

  private write(message: Parameters<typeof encodeJsonRpcLine>[0]): void {
    this.sendLine(encodeJsonRpcLine(message));
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new CursorAcpJsonRpcError("closed", "transport closed");
    }
  }

  private terminate(error: Error): void {
    this.closed = true;
    this.failAll(error);
  }

  private failAll(error: Error): void {
    for (const waiter of this.pending.values()) {
      waiter.cancelTimer();
      waiter.reject(error);
    }
    this.pending.clear();
  }
}

export function createInMemoryAcpStdioPair(
  options: {
    client?: AcpStdioJsonRpcTransportOptions;
    agent?: AcpStdioJsonRpcTransportOptions;
  } = {},
): {
  client: InMemoryAcpStdioJsonRpcTransport;
  agent: InMemoryAcpStdioJsonRpcTransport;
} {
  const clientListeners: LineHandler[] = [];
  const agentListeners: LineHandler[] = [];
  const client = new InMemoryAcpStdioJsonRpcTransport((line) => {
    for (const listener of agentListeners) listener(line);
  }, options.client);
  const agent = new InMemoryAcpStdioJsonRpcTransport((line) => {
    for (const listener of clientListeners) listener(line);
  }, options.agent);
  clientListeners.push((line) => client.receiveLine(line));
  agentListeners.push((line) => agent.receiveLine(line));
  return { client, agent };
}
