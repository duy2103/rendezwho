import { listContentRules, setContentRule } from '../lib/social';
import { useCallback, useState } from 'react';
import { isModerator, listReports, resolveReport, type ModerationReport } from '../lib/social';
import { useResource, useMutation } from '../lib/useResource';
import { Button, Card, Copy, Field, Page } from '../components/ui';
function Report({ report, reload }: { report: ModerationReport; reload: () => Promise<void> }) {
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState('reviewing');
  const [confirm, setConfirm] = useState(false);
  const mutation = useMutation();
  return (
    <Card>
      <Copy>
        {report.target_type} · {report.status} · {new Date(report.created_at).toLocaleString()}
      </Copy>
      <Copy>{report.reason}</Copy>
      {Object.entries(report.evidence).map(([key, value]) => (
        <Copy key={key}>
          {key}: {value}
        </Copy>
      ))}
      {!!report.resolution && <Copy>Previous decision: {report.resolution}</Copy>}
      {['reviewing', 'resolved', 'dismissed', 'remove', 'suspend'].map((value) => (
        <Button
          key={value}
          title={`${decision === value ? '✓ ' : ''}${value}`}
          secondary
          onPress={() => {
            setDecision(value);
            setConfirm(false);
          }}
        />
      ))}
      <Field
        label="Decision explanation / audit note"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={2000}
      />
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      {confirm && (
        <Copy>
          Confirm “{decision}”? Removal and suspension affect the reported user immediately.
        </Copy>
      )}
      <Button
        title={confirm ? 'Confirm decision' : 'Review decision'}
        disabled={mutation.busy || note.trim().length < 3}
        onPress={() => {
          if (!confirm) {
            setConfirm(true);
            return;
          }
          void mutation.run(async () => {
            await resolveReport(report.id, decision, note);
            setConfirm(false);
            setNote('');
            await reload();
          });
        }}
      />
    </Card>
  );
}
function ContentRules() {
  const rules = useResource(useCallback(() => listContentRules(), []));
  const [phrase, setPhrase] = useState('');
  const mutation = useMutation();
  return (
    <Card>
      <Copy>
        Content filtering: messages, profiles, communities, reviews and meetups containing these
        phrases cannot be published. Use precise phrases to avoid blocking ordinary conversation.
      </Copy>
      {!!rules.error && <Copy error>{rules.error}</Copy>}
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Field label="Phrase to filter" value={phrase} onChangeText={setPhrase} maxLength={100} />
      <Button
        title="Add content filter"
        disabled={mutation.busy || phrase.trim().length < 3}
        onPress={() =>
          void mutation.run(async () => {
            await setContentRule(phrase, true);
            setPhrase('');
            await rules.reload();
          })
        }
      />
      {rules.data?.map((rule) => (
        <Button
          key={rule.phrase}
          title={`Remove filter: ${rule.phrase}`}
          secondary
          disabled={mutation.busy}
          onPress={() =>
            void mutation.run(async () => {
              await setContentRule(rule.phrase, false);
              await rules.reload();
            })
          }
        />
      ))}
    </Card>
  );
}
export default function Moderation() {
  const [limit, setLimit] = useState(50);
  const resource = useResource(
    useCallback(async () => {
      if (!(await isModerator())) throw new Error('Moderator access required.');
      return listReports(limit);
    }, [limit]),
  );
  return (
    <Page
      title="Moderation queue"
      onRefresh={() => void resource.reload()}
      refreshing={resource.loading}
    >
      {!!resource.error && <Copy error>{resource.error}</Copy>}
      {resource.data && <ContentRules />}
      {resource.data?.length === 0 && <Copy>No reports.</Copy>}
      {resource.data?.map((report) => (
        <Report key={report.id} report={report} reload={resource.reload} />
      ))}
      {resource.data?.length === limit && (
        <Button title="Load older reports" onPress={() => setLimit(limit + 50)} />
      )}
    </Page>
  );
}
