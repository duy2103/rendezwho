/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
const A = '11111111-1111-4111-8111-111111111111',
  B = '22222222-2222-4222-8222-222222222222',
  G = '33333333-3333-4333-8333-333333333333',
  C = '44444444-4444-4444-8444-444444444444';
async function setup() {
  const db = new PGlite();
  await db.exec(read('fixtures/social-base.sql'));
  await db.exec(read('../supabase/migrations/202611170001_maps_places.sql'));
  await db.exec(read('../supabase/migrations/202611190001_social_completion.sql'));
  await db.exec(read('../supabase/migrations/202611190002_push_delivery.sql'));
  return db;
}
async function as(db, id) {
  await db.exec(`reset role; set request.jwt.claim.sub='${id}'; set role authenticated;`);
}
async function seedChat(db) {
  await db.exec(
    `reset role; insert into memberships(user_id,community_id) values('${B}','${G}'); insert into conversations(id) values('${C}'); insert into conversation_members values('${C}','${A}'),('${C}','${B}'); set request.jwt.claim.sub='${A}'; insert into connections(sender_id,recipient_id,status) values('${A}','${B}','accepted');`,
  );
}
test('message retries are idempotent; blocks close chat and prevent direct inserts and requests', async () => {
  const db = await setup();
  try {
    await seedChat(db);
    await as(db, A);
    const first = (await db.query("select app_send_message($1,'Hello','retry-key-0001') id", [C]))
      .rows[0].id;
    assert.equal(
      (await db.query("select app_send_message($1,'Hello','retry-key-0001') id", [C])).rows[0].id,
      first,
    );
    await as(db, B);
    assert.equal((await db.query('select * from messages')).rows.length, 1);
    assert.equal((await db.query('select * from app_notifications')).rows.length, 1);
    await db.query('select app_set_block($1,true)', [A]);
    await assert.rejects(
      db.query("select app_send_message($1,'blocked','retry-key-0002')", [C]),
      /closed/,
    );
    await assert.rejects(
      db.query("insert into messages(sender_id,conversation_id,body) values($1,$2,'bypass')", [
        B,
        C,
      ]),
      /closed/,
    );
    await assert.rejects(
      db.query("insert into connections(sender_id,recipient_id,status) values($1,$2,'pending')", [
        B,
        A,
      ]),
      /unavailable/,
    );
    assert.equal((await db.query('select * from messages')).rows.length, 0);
    await db.query('select app_set_block($1,false)', [A]);
    await assert.rejects(
      db.query("select app_send_message($1,'still closed','retry-key-0003')", [C]),
      /closed/,
    );
  } finally {
    await db.close();
  }
});
test('outsiders cannot read chat, mark it read, report its content or call private helpers', async () => {
  const db = await setup();
  try {
    await seedChat(db);
    await as(db, A);
    const id = (await db.query("select app_send_message($1,'private','retry-key-0001') id", [C]))
      .rows[0].id;
    await db.exec(`reset role; insert into profiles(id) values('${G}');`);
    await as(db, G);
    assert.equal((await db.query('select * from messages')).rows.length, 0);
    await assert.rejects(
      db.query('select app_mark_conversation_read($1,$2)', [C, id]),
      /unavailable/,
    );
    await assert.rejects(db.query("select app_report('message',$1,'spam')", [id]), /unavailable/);
    await assert.rejects(
      db.query("select app_store_report('profile',$1,'fake','{}')", [A]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select app_notify($1,$2,'fake',$3,'x')", [A, B, C]),
      /permission denied/,
    );
    await assert.rejects(
      db.query('insert into app_moderators values($1)', [G]),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test('meetup capacity, host ownership, nonmember access and cancellation are enforced', async () => {
  const db = await setup();
  try {
    await db.exec(`insert into memberships(user_id,community_id) values('${B}','${G}');`);
    await as(db, A);
    const id = (
      await db.query(
        "select app_save_meetup(null,$1,'Coffee','','Cafe',now()+interval '2 days',now()+interval '3 days','Europe/Berlin',1) id",
        [G],
      )
    ).rows[0].id;
    await db.query('select app_rsvp($1,true)', [id]);
    await db.query('select app_rsvp($1,true)', [id]);
    await as(db, B);
    await assert.rejects(db.query('select app_rsvp($1,true)', [id]), /full/);
    await assert.rejects(db.query('select app_cancel_meetup($1)', [id]), /unavailable/);
    await db.exec(`reset role; delete from memberships where user_id='${B}';`);
    await as(db, B);
    assert.equal((await db.query('select * from app_meetups')).rows.length, 0);
    await assert.rejects(db.query('select app_rsvp($1,true)', [id]), /unavailable/);
    await as(db, A);
    await db.query('select app_cancel_meetup($1)', [id]);
    await assert.rejects(db.query('select app_rsvp($1,true)', [id]), /no longer/);
  } finally {
    await db.close();
  }
});
test('reports keep server evidence; moderator decisions require privileges and are audited', async () => {
  const db = await setup();
  try {
    await seedChat(db);
    await as(db, A);
    const message = (
      await db.query("select app_send_message($1,'bad message','retry-key-0001') id", [C])
    ).rows[0].id;
    await as(db, B);
    const report = (await db.query("select app_report('message',$1,'harassment') id", [message]))
      .rows[0].id;
    assert.equal((await db.query('select * from app_reports')).rows.length, 0);
    await assert.rejects(
      db.query("select app_resolve_report($1,'remove','violation')", [report]),
      /Moderator/,
    );
    await db.exec(`reset role; insert into app_moderators values('${B}');`);
    await as(db, B);
    assert.equal(
      (await db.query('select evidence from app_reports')).rows[0].evidence.body,
      'bad message',
    );
    await db.query("select app_resolve_report($1,'remove','Removed harassment')", [report]);
    assert.equal((await db.query('select * from app_moderation_log')).rows.length, 1);
    await as(db, A);
    assert.equal((await db.query('select * from messages')).rows.length, 0);
  } finally {
    await db.close();
  }
});
test('onboarding cannot elevate privileges; community management checks owner and moderator roles', async () => {
  const db = await setup();
  try {
    await as(db, B);
    await db.query("select app_finish_onboarding('Bee','Hello',null)");
    assert.ok(
      (await db.query('select onboarding_completed_at from profiles where id=$1', [B])).rows[0]
        .onboarding_completed_at,
    );
    await assert.rejects(db.query("select app_manage_community($1,'delete')", [G]), /unavailable/);
    await db.exec(
      `reset role; insert into memberships(user_id,community_id) values('${B}','${G}');`,
    );
    await as(db, A);
    await db.query("select app_manage_community($1,'role',$2,'moderator')", [G, B]);
    await as(db, B);
    await db.query("select app_manage_community($1,'edit',null,'New name','New description')", [G]);
    await assert.rejects(
      db.query("select app_manage_community($1,'role',$2,'member')", [G, A]),
      /not permitted/,
    );
    await assert.rejects(
      db.query("select app_manage_community($1,'delete')", [G]),
      /not permitted/,
    );
  } finally {
    await db.close();
  }
});
test('conversation summaries and read state are private and notification preferences are respected', async () => {
  const db = await setup();
  try {
    await seedChat(db);
    await as(db, A);
    const id = (await db.query("select app_send_message($1,'Hello','retry-key-0001') id", [C]))
      .rows[0].id;
    await as(db, B);
    const summary = (await db.query('select * from app_conversations()')).rows[0];
    assert.equal(summary.preview, 'Hello');
    assert.equal(Number(summary.unread), 1);
    await db.query('select app_mark_conversation_read($1,$2)', [C, id]);
    assert.equal(Number((await db.query('select * from app_conversations()')).rows[0].unread), 0);
    await db.query('insert into app_notification_preferences(user_id,messages) values($1,false)', [
      B,
    ]);
    await as(db, A);
    await db.query("select app_send_message($1,'Second','retry-key-0002')", [C]);
    await as(db, B);
    assert.equal((await db.query('select * from app_notifications')).rows.length, 1);
    await db.exec(`reset role; insert into profiles(id) values('${G}');`);
    await as(db, G);
    assert.equal((await db.query('select * from app_conversations()')).rows.length, 0);
  } finally {
    await db.close();
  }
});
test('suspensions stop privileged message sends and cannot be cleared by onboarding', async () => {
  const db = await setup();
  try {
    await seedChat(db);
    await db.exec(`reset role; insert into app_suspensions(user_id,reason) values('${A}','spam');`);
    await as(db, A);
    await assert.rejects(
      db.query("select app_send_message($1,'Hello','retry-key-0001')", [C]),
      /Invalid|unavailable/,
    );
    await assert.rejects(
      db.query("select app_finish_onboarding('New name','',null)"),
      /unavailable/,
    );
    await assert.rejects(
      db.query("select app_manage_community($1,'edit',null,'Renamed','')", [G]),
      /unavailable/,
    );
  } finally {
    await db.close();
  }
});

test('push queue is server-only, respects preferences and drops blocked notifications', async () => {
  const db = await setup();
  try {
    await seedChat(db);
    await as(db, B);
    await db.query("select app_register_push('ExpoPushToken[testtoken]',true)");
    await assert.rejects(db.query('select * from app_push_devices'), /permission denied/);
    await assert.rejects(db.query('select * from app_claim_push()'), /permission denied/);
    await as(db, A);
    await db.query("select app_send_message($1,'Hello','retry-key-0001')", [C]);
    await db.exec('reset role; set role service_role');
    assert.equal((await db.query('select * from app_claim_push()')).rows.length, 1);
    assert.equal((await db.query('select * from app_claim_push()')).rows.length, 0);
    await as(db, B);
    await db.query('select app_set_block($1,true)', [A]);
    await db.exec('reset role; set role service_role');
    assert.equal((await db.query('select * from app_push_deliveries')).rows.length, 0);
  } finally {
    await db.close();
  }
});
test('content filters apply inside privileged RPCs and ordinary users cannot alter them', async () => {
  const db = await setup();
  try {
    await seedChat(db);
    await as(db, A);
    await assert.rejects(
      db.query("select app_set_content_rule('blocked phrase',true)"),
      /Moderator/,
    );
    await db.exec(`reset role; insert into app_moderators values('${B}');`);
    await as(db, B);
    await db.query("select app_set_content_rule('blocked phrase',true)");
    await as(db, A);
    await assert.rejects(
      db.query("select app_send_message($1,'A BLOCKED PHRASE here','retry-key-0001')", [C]),
      /guidelines/,
    );
    await assert.rejects(
      db.query("select app_finish_onboarding('Member','blocked phrase',null)"),
      /guidelines/,
    );
  } finally {
    await db.close();
  }
});
test('leaving cancels hosted meetups and notifies remaining attendees', async () => {
  const db = await setup();
  try {
    await seedChat(db);
    await as(db, A);
    const id = (
      await db.query(
        "select app_save_meetup(null,$1,'Coffee','','Cafe',now()+interval '2 days',now()+interval '3 days','Europe/Berlin',2) id",
        [G],
      )
    ).rows[0].id;
    await as(db, B);
    await db.query('select app_rsvp($1,true)', [id]);
    await db.exec(`reset role; delete from memberships where user_id='${A}';`);
    await as(db, B);
    assert.ok(
      (await db.query('select cancelled_at from app_meetups where id=$1', [id])).rows[0]
        .cancelled_at,
    );
    assert.equal(
      (await db.query("select * from app_notifications where kind='meetup_cancelled'")).rows.length,
      1,
    );
  } finally {
    await db.close();
  }
});
