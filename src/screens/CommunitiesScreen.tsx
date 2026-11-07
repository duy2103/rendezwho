import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { Users, Plus, UserPlus } from 'lucide-react-native';
import { colors, fonts } from '../theme/tokens';
import Sheet from '../components/Sheet';
import { useAuth } from '../providers/AuthProvider';
import {
  createCommunity,
  createInvite,
  joinCommunity,
  leaveCommunity,
  listCommunities,
  listInvites,
  listMembers,
  requestConnection,
  transferCommunity,
  revokeInvite,
  type Community,
} from '../lib/data';
import { useMutation, useResource } from '../lib/useResource';
import { Button, Card, Copy, Field, Heading, Loading, Page } from '../components/ui';

function CommunityDetails({
  group,
  userId,
  onLeave,
  onRefresh,
}: {
  group: Community;
  userId: string;
  onLeave: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const invites = useResource(useCallback(() => listInvites(group.id), [group.id]));
  const mutation = useMutation();
  const members = useResource(useCallback(() => listMembers(group.id), [group.id]));
  const manager =
    group.owner_id === userId ||
    members.data?.some((m) => m.user_id === userId && m.role === 'moderator');
  const [transferTo, setTransferTo] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState(false);
  return (
    <Card>
      <Heading>{group.name}</Heading>
      <Copy>{group.description}</Copy>
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Copy>Members</Copy>
      {!!notice && <Copy>{notice}</Copy>}
      {!!members.error && <Copy error>{members.error}</Copy>}
      {members.data?.map((member) => (
        <Card key={member.user_id}>
          <Copy>
            {member.full_name} · {member.user_id === group.owner_id ? 'Owner' : member.role}
          </Copy>
          {member.user_id !== userId && (
            <>
              <Button
                title="Request connection"
                secondary
                disabled={mutation.busy}
                onPress={() =>
                  void mutation.run(async () => {
                    await requestConnection(member.user_id);
                    setNotice('Connection request sent or already pending/accepted.');
                  })
                }
              />
              {group.owner_id === userId && (
                <Button
                  title="Transfer ownership to this member"
                  secondary
                  onPress={() => setTransferTo(member.user_id)}
                />
              )}
            </>
          )}
        </Card>
      ))}
      {transferTo && (
        <Card>
          <Copy>
            Transfer ownership to {members.data?.find((m) => m.user_id === transferTo)?.full_name}?
            You will remain a member and lose owner permissions.
          </Copy>
          <Button
            title="Confirm transfer"
            disabled={mutation.busy}
            onPress={() =>
              void mutation.run(async () => {
                await transferCommunity(group.id, transferTo);
                setTransferTo(null);
                await onRefresh();
              })
            }
          />
          <Button
            title="Cancel transfer"
            secondary
            disabled={mutation.busy}
            onPress={() => setTransferTo(null)}
          />
        </Card>
      )}
      {manager && (
        <>
          <Copy>Invitation codes</Copy>
          {invites.loading && <Loading />}
          {!!invites.error && <Copy error>{invites.error}</Copy>}
          {invites.data
            ?.filter((i) => !i.revoked_at)
            .map((invite) => (
              <Card key={invite.id}>
                <Field
                  label="Invitation code"
                  value={invite.token}
                  editable={false}
                  selectTextOnFocus
                />
                <Copy>
                  {invite.expires_at
                    ? `Expires ${new Date(invite.expires_at).toLocaleDateString()}`
                    : 'No expiry'}{' '}
                  · {invite.use_count} uses
                </Copy>
                <Button
                  title="Revoke invitation"
                  secondary
                  disabled={mutation.busy}
                  onPress={() =>
                    void mutation.run(async () => {
                      await revokeInvite(invite.id);
                      await invites.reload();
                    })
                  }
                />
              </Card>
            ))}
          <Button
            title="Create 7-day invitation"
            secondary
            disabled={mutation.busy}
            onPress={() =>
              void mutation.run(async () => {
                await createInvite(group.id);
                await invites.reload();
              })
            }
          />
        </>
      )}
      {group.owner_id === userId ? (
        <Copy>
          You own this community. Transfer ownership before leaving or deleting your account.
        </Copy>
      ) : leaving ? (
        <>
          <Copy>
            Leaving removes your trip shares and RSVPs here. Your reviews and hosted meetups remain.
          </Copy>
          <Button
            title="Confirm leave"
            disabled={mutation.busy}
            onPress={() =>
              void mutation.run(async () => {
                await leaveCommunity(group.id);
                await onLeave();
              })
            }
          />
          <Button
            title="Cancel"
            secondary
            disabled={mutation.busy}
            onPress={() => setLeaving(false)}
          />
        </>
      ) : (
        <Button title="Leave community" secondary onPress={() => setLeaving(true)} />
      )}
    </Card>
  );
}
export default function Communities() {
  const id = useAuth().session!.user.id;
  const resource = useResource(useCallback(() => listCommunities(id), [id]));
  const mutation = useMutation();
  const [flow, setFlow] = useState<'create' | 'join' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [token, setToken] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const group = resource.data?.find((g) => g.id === selected);
  if (group)
    return (
      <Page title={group.name} subtitle={group.description}>
        <Button title="← All communities" secondary onPress={() => setSelected(null)} />
        <CommunityDetails
          key={group.id}
          group={group}
          userId={id}
          onRefresh={resource.reload}
          onLeave={async () => {
            setSelected(null);
            await resource.reload();
          }}
        />
      </Page>
    );
  return (
    <Page
      title="My Communities"
      subtitle="Share differently with every part of your world."
      onRefresh={resource.reload}
      refreshing={resource.loading && !!resource.data}
    >
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Button
            title="Join group"
            secondary
            icon={<UserPlus size={16} color={colors.tealDeep} />}
            onPress={() => setFlow('join')}
          />
        </View>
        <View style={{ flex: 1.4 }}>
          <Button
            title="Create community"
            icon={<Plus size={17} color={colors.ink} />}
            onPress={() => setFlow('create')}
          />
        </View>
      </View>
      {!!mutation.error && <Copy error>{mutation.error}</Copy>}
      <Sheet
        title="Create a community"
        visible={flow === 'create'}
        onClose={() => {
          if (!mutation.busy) setFlow(null);
        }}
      >
        <Field label="Community name" value={name} onChangeText={setName} maxLength={100} />
        <Field
          label="Description"
          value={description}
          onChangeText={setDescription}
          maxLength={1000}
          multiline
        />
        <Button
          title="Create community"
          disabled={mutation.busy || !name.trim()}
          onPress={() =>
            void mutation.run(async () => {
              const created = await createCommunity(name, description);
              setName('');
              setDescription('');
              await resource.reload();
              setSelected(created);
              setFlow(null);
            })
          }
        />
        <Button title="Cancel" secondary onPress={() => setFlow(null)} />
      </Sheet>
      <Sheet
        title="Join a community"
        visible={flow === 'join'}
        onClose={() => {
          if (!mutation.busy) setFlow(null);
        }}
      >
        <Field
          label="Invitation code"
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button
          title="Join community"
          disabled={mutation.busy || !token.trim()}
          onPress={() =>
            void mutation.run(async () => {
              const joined = await joinCommunity(token);
              setToken('');
              await resource.reload();
              setSelected(joined);
              setFlow(null);
            })
          }
        />
        <Button title="Cancel" secondary onPress={() => setFlow(null)} />
      </Sheet>
      {resource.loading && <Loading />}
      {!!resource.error && <Copy error>{resource.error}</Copy>}
      {resource.data?.length === 0 && <Copy>You have not joined any communities yet.</Copy>}
      {resource.data?.map((item) => (
        <Card key={item.id}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <View
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                backgroundColor: colors.soft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Users size={20} color={colors.ink} />
            </View>
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.ink, flex: 1 }}>
              {item.name}
            </Text>
          </View>
          <Copy>{item.description}</Copy>
          <Button title="Open group →" secondary onPress={() => setSelected(item.id)} />
        </Card>
      ))}
    </Page>
  );
}
