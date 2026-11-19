import { useState } from 'react';
import { reportContent, setBlock, type ReportKind } from '../lib/social';
import { useMutation } from '../lib/useResource';
import { Button, Card, Copy, Field } from './ui';
export default function SafetyActions({
  kind,
  target,
  userId,
  onChanged,
}: {
  kind: ReportKind;
  target: string;
  userId?: string;
  onChanged?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [notice, setNotice] = useState('');
  const mutation = useMutation();
  return (
    <>
      {!!notice && <Copy>{notice}</Copy>}
      <Button
        title={open ? 'Close safety options' : 'Report or block'}
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <Card>
          <Copy>
            Report harassment, spam, threats, or inappropriate content. Reports are reviewed by the
            moderation team.
          </Copy>
          <Field
            label="What happened?"
            value={reason}
            onChangeText={setReason}
            maxLength={2000}
            multiline
          />
          {!!mutation.error && <Copy error>{mutation.error}</Copy>}
          <Button
            title="Submit report"
            disabled={mutation.busy || reason.trim().length < 3}
            onPress={() =>
              void mutation.run(async () => {
                await reportContent(kind, target, reason);
                setReason('');
                setNotice('Report submitted.');
                setOpen(false);
              })
            }
          />
          {userId && (
            <>
              {confirmBlock && (
                <Copy>
                  Block this person? Connections and conversations will close, and their trips and
                  reviews will be hidden. Unblocking will not reconnect you.
                </Copy>
              )}
              <Button
                title={confirmBlock ? 'Confirm block' : 'Block this person'}
                secondary
                disabled={mutation.busy}
                onPress={() => {
                  if (!confirmBlock) {
                    setConfirmBlock(true);
                    return;
                  }
                  void mutation.run(async () => {
                    await setBlock(userId, true);
                    setConfirmBlock(false);
                    setOpen(false);
                    setNotice('Person blocked. Manage blocked accounts in your profile.');
                    await onChanged?.();
                  });
                }}
              />
            </>
          )}
        </Card>
      )}
    </>
  );
}
