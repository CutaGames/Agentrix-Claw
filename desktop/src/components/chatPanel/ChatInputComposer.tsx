import { memo } from "react";
import type {
  CSSProperties,
  ChangeEventHandler,
  ClipboardEventHandler,
  KeyboardEventHandler,
  ReactNode,
  Ref,
} from "react";

type Props = {
  textareaRef: Ref<HTMLTextAreaElement>;
  fileInputRef: Ref<HTMLInputElement>;
  onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>;
  onAttachmentChange: ChangeEventHandler<HTMLInputElement>;
  onOpenFilePicker: () => void;
  attachDisabled: boolean;
  uploadingAttachments: boolean;
  sending: boolean;
  onSend: () => void;
  onStop: () => void;
  voiceButton: ReactNode;
  iconButtonStyle: CSSProperties;
};

function ChatInputComposerImpl({
  textareaRef,
  fileInputRef,
  onKeyDown,
  onPaste,
  onAttachmentChange,
  onOpenFilePicker,
  attachDisabled,
  uploadingAttachments,
  sending,
  onSend,
  onStop,
  voiceButton,
  iconButtonStyle,
}: Props) {
  const attachBusy = attachDisabled || uploadingAttachments;
  const primaryDisabled = !sending && uploadingAttachments;

  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        alignItems: "flex-end",
      }}
    >
      <textarea
        ref={textareaRef}
        defaultValue=""
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder="Type a message... (/ for commands)"
        rows={1}
        style={{
          flex: 1,
          background: "var(--bg-input)",
          color: "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          padding: "10px 14px",
          fontSize: 14,
          resize: "none",
          outline: "none",
          minHeight: 40,
          maxHeight: 120,
          fontFamily: "inherit",
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={onAttachmentChange}
        style={{ display: "none" }}
        accept="image/*,.pdf,.txt,.md,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
      />
      <button
        onClick={onOpenFilePicker}
        disabled={attachBusy}
        style={{
          ...iconButtonStyle,
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: "var(--bg-input)",
          border: "1px solid var(--border)",
          opacity: attachBusy ? 0.5 : 1,
        }}
        title="Attach image or file"
      >
        {uploadingAttachments ? "⏳" : "📎"}
      </button>
      {voiceButton}
      <button
        onClick={sending ? onStop : onSend}
        disabled={primaryDisabled}
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          background: sending
            ? "var(--danger)"
            : !uploadingAttachments
              ? "var(--accent)"
              : "var(--bg-input)",
          color: "white",
          border: "none",
          cursor: primaryDisabled ? "default" : "pointer",
          fontSize: 18,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "background 0.2s, transform 0.15s",
          flexShrink: 0,
          boxShadow: sending ? "0 0 0 1px rgba(248,113,113,0.35)" : "none",
        }}
        title={sending ? "Stop response" : "Send message"}
      >
        {sending ? "⏹" : uploadingAttachments ? "⏳" : "➤"}
      </button>
    </div>
  );
}

// Memoized: typing in the textarea fires no React state updates (it's
// uncontrolled), but parent re-renders (every 1-2s during streaming) used to
// reconcile the whole composer subtree. memo() with a custom comparator keeps
// the heavy DOM stable as long as the actual props haven't changed.
const ChatInputComposer = memo(ChatInputComposerImpl, (prev, next) =>
  prev.textareaRef === next.textareaRef &&
  prev.fileInputRef === next.fileInputRef &&
  prev.onKeyDown === next.onKeyDown &&
  prev.onPaste === next.onPaste &&
  prev.onAttachmentChange === next.onAttachmentChange &&
  prev.onOpenFilePicker === next.onOpenFilePicker &&
  prev.attachDisabled === next.attachDisabled &&
  prev.uploadingAttachments === next.uploadingAttachments &&
  prev.sending === next.sending &&
  prev.onSend === next.onSend &&
  prev.onStop === next.onStop &&
  prev.voiceButton === next.voiceButton &&
  prev.iconButtonStyle === next.iconButtonStyle
);

export default ChatInputComposer;