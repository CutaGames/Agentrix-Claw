import ApprovalSheet, { type PendingApprovalRequest } from "../ApprovalSheet";

interface Props {
  request: PendingApprovalRequest | null;
  rememberForSession: boolean;
  onRememberChange: (value: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  submitting: boolean;
}

export default function ApprovalModal({
  request,
  rememberForSession,
  onRememberChange,
  onApprove,
  onReject,
  submitting,
}: Props) {
  return (
    <ApprovalSheet
      request={request}
      rememberForSession={rememberForSession}
      onRememberChange={onRememberChange}
      onApprove={onApprove}
      onReject={onReject}
      submitting={submitting}
    />
  );
}