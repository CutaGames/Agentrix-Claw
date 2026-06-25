import { memo, type ReactNode, type RefObject, type UIEventHandler } from "react";
import type { ChatMessage } from "../../services/store";
import MessageBubble from "../MessageBubble";
import EmptyChatState from "./EmptyChatState";
import TurnSummaryFooter from "./TurnSummaryFooter";
import { useChatPanelRuntimeStore } from "./runtimeStore";
import { useIsSimpleMode } from "../../services/userMode";

interface Props {
  messageListRef: RefObject<HTMLDivElement>;
  listEndRef: RefObject<HTMLDivElement>;
  messages: ChatMessage[];
  onScroll: UIEventHandler<HTMLDivElement>;
  onRetry: (messageId: string) => void;
  planPanel?: ReactNode;
  contextVisualizer?: ReactNode;
}

function MessageListImpl({
  messageListRef,
  listEndRef,
  messages,
  onScroll,
  onRetry,
  planPanel,
  contextVisualizer,
}: Props) {
  // Sprint Pre-launch P-3 (2026-05-23) — the per-turn summary footer
  // ("✓ 刚才 / → 下一步") is appended after the LAST settled assistant
  // message. We read workspaceChanges from the runtime store directly
  // so MessageList still memoizes on its own props (the footer subscribes
  // independently and re-renders when the change list updates).
  const showSummary = useIsSimpleMode();
  const lastAssistant = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && !m.streaming) return m;
      if (m.role === "user") return null;
    }
    return null;
  })();
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
      {showSummary && lastAssistant && <TurnSummaryFooterConnected message={lastAssistant} />}
      {planPanel}
      {contextVisualizer}
      <div ref={listEndRef} />
    </div>
  );
}

/**
 * Subscribes to `workspaceChanges` from the chat panel runtime store and
 * forwards to the dumb `<TurnSummaryFooter>`. Lives here (not a top-level
 * named export) because it's purely an integration shim.
 */
function TurnSummaryFooterConnected({ message }: { message: ChatMessage }) {
  const workspaceChanges = useChatPanelRuntimeStore((state) => state.workspaceChanges);
  return <TurnSummaryFooter message={message} workspaceChanges={workspaceChanges} />;
}

// Memoize the list so the 2s feedbackNow re-render and other parent state
// churn doesn't reconcile every bubble (which involves remark/highlight).
const MessageList = memo(MessageListImpl, (prev, next) => (
  prev.messageListRef === next.messageListRef &&
  prev.listEndRef === next.listEndRef &&
  prev.messages === next.messages &&
  prev.onScroll === next.onScroll &&
  prev.onRetry === next.onRetry &&
  prev.planPanel === next.planPanel &&
  prev.contextVisualizer === next.contextVisualizer
));

export default MessageList;