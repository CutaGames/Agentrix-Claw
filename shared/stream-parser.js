"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentrixStreamParser = void 0;
class AgentrixStreamParser {
    constructor(callbacks) {
        this.callbacks = callbacks;
        this.buffer = '';
        this.isDone = false;
    }
    feed(rawChunk) {
        if (this.isDone)
            return;
        this.buffer += rawChunk;
        let boundary = this.buffer.indexOf('\n\n');
        while (boundary >= 0) {
            const rawEvent = this.buffer.slice(0, boundary);
            this.buffer = this.buffer.slice(boundary + 2);
            this.processRawEvent(rawEvent);
            if (this.isDone)
                return;
            boundary = this.buffer.indexOf('\n\n');
        }
    }
    end() {
        if (this.buffer.trim()) {
            this.processRawEvent(this.buffer);
        }
        this.buffer = '';
        this.isDone = true;
    }
    reset() {
        this.buffer = '';
        this.isDone = false;
    }
    processRawEvent(raw) {
        const lines = raw.split('\n');
        const dataLines = [];
        for (const line of lines) {
            if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        }
        if (dataLines.length === 0)
            return;
        const data = dataLines.join('\n').trim();
        if (data === '[DONE]') {
            this.isDone = true;
            return;
        }
        let parsed;
        try {
            parsed = JSON.parse(data);
        }
        catch {
            this.callbacks.onLegacyChunk?.({ chunk: data });
            this.callbacks.onTextDelta?.({ type: 'text_delta', text: data });
            return;
        }
        if (parsed && typeof parsed.type === 'string') {
            this.dispatchStructuredEvent(parsed);
            return;
        }
        if (parsed.chunk !== undefined || parsed.meta || parsed.error) {
            this.callbacks.onLegacyChunk?.(parsed);
            if (parsed.meta) {
                this.callbacks.onMeta?.(parsed.meta);
            }
            if (typeof parsed.chunk === 'string' && parsed.chunk.length > 0) {
                this.callbacks.onTextDelta?.({ type: 'text_delta', text: parsed.chunk });
            }
            if (parsed.error) {
                this.callbacks.onError?.({
                    type: 'error',
                    error: parsed.error,
                    retriable: false,
                });
            }
            return;
        }
        this.callbacks.onLegacyChunk?.(parsed);
    }
    dispatchStructuredEvent(event) {
        switch (event.type) {
            case 'text_delta':
                this.callbacks.onTextDelta?.(event);
                break;
            case 'thinking':
                this.callbacks.onThinking?.(event);
                break;
            case 'tool_start':
                this.callbacks.onToolStart?.(event);
                break;
            case 'tool_progress':
                this.callbacks.onToolProgress?.(event);
                break;
            case 'tool_result':
                this.callbacks.onToolResult?.(event);
                break;
            case 'tool_error':
                this.callbacks.onToolError?.(event);
                break;
            case 'approval_required':
                this.callbacks.onApprovalRequired?.(event);
                break;
            case 'usage':
                this.callbacks.onUsage?.(event);
                break;
            case 'turn_info':
                this.callbacks.onTurnInfo?.(event);
                break;
            case 'done':
                this.callbacks.onDone?.(event);
                this.isDone = true;
                break;
            case 'error':
                this.callbacks.onError?.(event);
                break;
        }
    }
}
exports.AgentrixStreamParser = AgentrixStreamParser;
//# sourceMappingURL=stream-parser.js.map