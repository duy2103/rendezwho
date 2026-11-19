import { useState } from 'react';
import type { Community, Member } from '../lib/data';
import { manageCommunity } from '../lib/social';
import { useMutation } from '../lib/useResource';
import { Button, Card, Copy, Field } from './ui';
export default function CommunityManagement({
  group,
  userId,
  members,
  onChanged,
  onDeleted,
}: {
  group: Community;
  userId: string;
  members: Member[];
  onChanged: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [confirmation, setConfirmation] = useState('');
  const [remove, setRemove] = useState<string | null>(null);
  const mutation = useMutation();
  const owner = group.owner_id === userId;
  if (!owner && !members.some((m) => m.user_id === userId && m.role === 'moderator')) return null;
  return (
    <>
      <Button
        title={open ? 'Close management' : 'Manage community'}
        secondary
        onPress={() => setOpen(!open)}
      />
      {open && (
        <Card>
          {!!mutation.error && <Copy error>{mutation.error}</Copy>}
          <Field label="Community name" value={name} onChangeText={setName} maxLength={100} />
          <Field
            label="Description"
            value={description}
            onChangeText={setDescription}
            maxLength={2000}
            multiline
          />
          <Button
            title="Save community"
            disabled={mutation.busy || !name.trim()}
            onPress={() =>
              void mutation.run(async () => {
                await manageCommunity(group.id, 'edit', null, name, description);
                await onChanged();
              })
            }
          />
          {members
            .filter(
              (m) =>
                m.user_id !== group.owner_id &&
                m.user_id !== userId &&
                (owner || m.role !== 'moderator'),
            )
            .map((member) => (
              <Card key={member.user_id}>
                <Copy>
                  {member.full_name} · {member.role}
                </Copy>
                {owner && (
                  <Button
                    title={member.role === 'moderator' ? 'Remove moderator role' : 'Make moderator'}
                    secondary
                    disabled={mutation.busy}
                    onPress={() =>
                      void mutation.run(async () => {
                        await manageCommunity(
                          group.id,
                          'role',
                          member.user_id,
                          member.role === 'moderator' ? 'member' : 'moderator',
                        );
                        await onChanged();
                      })
                    }
                  />
                )}
                {remove === member.user_id && (
                  <Copy>
                    Remove this member? Their shared trips and RSVPs in this community will be
                    removed.
                  </Copy>
                )}
                <Button
                  title={remove === member.user_id ? 'Confirm removal' : 'Remove member'}
                  secondary
                  disabled={mutation.busy}
                  onPress={() => {
                    if (remove !== member.user_id) {
                      setRemove(member.user_id);
                      return;
                    }
                    void mutation.run(async () => {
                      await manageCommunity(group.id, 'remove', member.user_id);
                      setRemove(null);
                      await onChanged();
                    });
                  }}
                />
                {remove === member.user_id && (
                  <Button title="Keep member" secondary onPress={() => setRemove(null)} />
                )}
              </Card>
            ))}
          {owner && (
            <>
              <Copy>
                Delete this community permanently, including its invitations and community content.
                Members’ private trips and bookmarks remain their own. Type DELETE to confirm.
              </Copy>
              <Field
                label="Deletion confirmation"
                value={confirmation}
                onChangeText={setConfirmation}
                autoCapitalize="characters"
              />
              <Button
                title="Delete community"
                disabled={mutation.busy || confirmation !== 'DELETE'}
                onPress={() =>
                  void mutation.run(async () => {
                    await manageCommunity(group.id, 'delete');
                    await onDeleted();
                  })
                }
              />
            </>
          )}
        </Card>
      )}
    </>
  );
}
