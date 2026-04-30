import type { ReactNode, RefObject, UIEventHandler } from "react";
import type { ChatMessage } from "../../services/store";
import MessageBubble from "../MessageBubble";
import EmptyChatState from "./EmptyChatState";

interface Props {
  messageListRef: RefObject<HTMLDivElement>;
  listEndRef: RefObject<HTMLDivElement>;
  messages: ChatMessage[];
  onScroll: UIEventHandler<HTMLDivElement>;
  onRetry: (messageId: string) => void;
  planPanel?: ReactNode;
  contextVisualizer?: ReactNode;
}

export default function MessageList({
  messageListRef,
  listEndRef,
  messages,
  onScroll,
  onRetry,
  planPanel,
  contextVisualizer,
}: Props) {
  return (
    <div
      ref={messageListRef}
      onScroll={onScroll}
      style={{
        flex: 1,
        overflowY: "auto",
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {messages.length === 0 && <EmptyChatState />}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} onRetry={onRetry} />
      ))}
      {planPanel}
      {contextVisualizer}
      <div ref={listEndRef} />
    </div>
  );
}