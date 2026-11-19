/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync(
  path.join(__dirname, '../supabase/migrations/202611170001_maps_places.sql'),
  'utf8',
);
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const G = '33333333-3333-4333-8333-333333333333';
const fixture = `
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated,service_role;
create table public.profiles(id uuid primary key,home_city text not null default '',home_city_id uuid);
create table public.cities(id uuid primary key default gen_random_uuid(),name text not null check(length(trim(name)) between 1 and 150),
 normalized_name text generated always as (lower(trim(name))) stored unique,country_code text,region text not null default '',
 latitude float8,longitude float8,provider_id text unique,created_at timestamptz default now(),check((latitude is null)=(longitude is null)),
 check(latitude between -90 and 90),check(longitude between -180 and 180));
create table public.city_aliases(alias text primary key,city_id uuid references cities);
create table public.places(id uuid primary key default gen_random_uuid(),city_id uuid not null references cities,name text not null check(length(trim(name)) between 1 and 200),
 normalized_name text generated always as(lower(trim(name))) stored,address text not null default '',latitude float8,longitude float8,provider_id text unique,
 category varchar,created_at timestamptz default now(),unique(city_id,normalized_name),check((latitude is null)=(longitude is null)),check(latitude between -90 and 90),check(longitude between -180 and 180));
create table public.communities(id uuid primary key);
create table public.memberships(user_id uuid,community_id uuid,primary key(user_id,community_id));
create function public.is_member(target uuid) returns boolean language sql stable security definer as $$select exists(select 1 from public.memberships where community_id=target and user_id=auth.uid())$$;
create table public.check_ins(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles,city text not null,city_id uuid not null references cities,
 arrival date not null,departure date not null,note text not null default '',created_at timestamptz default now(),updated_at timestamptz default now(),check(departure>=arrival));
alter table check_ins enable row level security;
create policy checkin_read on check_ins for select to authenticated using(user_id=auth.uid());
create policy checkin_insert on check_ins for insert to authenticated with check(user_id=auth.uid());
create policy checkin_update on check_ins for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create table public.check_in_shares(check_in_id uuid references check_ins,community_id uuid references communities,primary key(check_in_id,community_id));
create function public.can_view_checkin(target uuid) returns boolean language sql stable security definer as $$ select exists(select 1 from public.check_ins where id=target and user_id=auth.uid()) or exists(select 1 from public.check_in_shares where check_in_id=target and public.is_member(community_id)) $$;
create table public.saved_places(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles,city text not null,city_id uuid not null references cities,
 name text not null,place_id uuid not null references places,note text not null default '' check(length(note)<=1000),category varchar,created_at timestamptz default now(),updated_at timestamptz default now());
create table public.reviews(id uuid primary key default gen_random_uuid(),user_id uuid not null references profiles,community_id uuid not null references communities,
 city text not null,city_id uuid not null references cities,place text not null,place_id uuid not null references places,rating int check(rating between 1 and 5),body text not null,created_at timestamptz default now(),updated_at timestamptz default now());
create function public.link_location() returns trigger language plpgsql security definer as $$ begin return new; end $$;
create trigger location_link before insert or update on check_ins for each row execute function link_location();
create trigger location_link before insert or update on saved_places for each row execute function link_location();
create trigger location_link before insert or update on reviews for each row execute function link_location();
alter table saved_places enable row level security;
create policy saved_owner on saved_places for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
alter table reviews enable row level security;
create policy review_read on reviews for select to authenticated using(user_id=auth.uid() or is_member(community_id));
create policy review_update on reviews for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy review_insert on reviews for insert to authenticated with check(user_id=auth.uid() and is_member(community_id));
alter table places enable row level security;
create policy place_read on places for select to authenticated using(exists(select 1 from saved_places s where s.place_id=places.id) or exists(select 1 from reviews r where r.place_id=places.id));
alter table cities enable row level security;
create policy city_read on cities for select to authenticated using(exists(select 1 from saved_places s where s.city_id=cities.id) or exists(select 1 from check_ins t where t.city_id=cities.id and can_view_checkin(t.id)));
grant select,insert,update,delete on all tables in schema public to authenticated;
insert into profiles(id) values('${A}'),('${B}');
insert into communities values('${G}'); insert into memberships values('${A}','${G}');
`;
async function setup() {
  const db = new PGlite();
  await db.exec(fixture);
  await db.exec(migration);
  await db.exec(
    fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/202611190001_google_places_fallback.sql'),
      'utf8',
    ),
  );
  return db;
}
async function as(db, user) {
  await db.exec(`reset role; set request.jwt.claim.sub='${user}'; set role authenticated;`);
}
async function city(db) {
  return (await db.query("select (public.maps_save_city('Berlin, Germany')).id as id")).rows[0].id;
}
test('migration preserves selected identities and private saves across note/status changes', async () => {
  const db = await setup();
  try {
    await as(db, A);
    const c = await city(db);
    const save = await db.query("select maps_save_place($1,'Cafe','private',null,52.5,13.4) id", [
      c,
    ]);
    const sid = save.rows[0].id;
    const before = (await db.query('select * from saved_places where id=$1', [sid])).rows[0];
    await db.query(
      "update saved_places set note='changed',status='visited',visited_at=now() where id=$1",
      [sid],
    );
    const after = (await db.query('select * from saved_places where id=$1', [sid])).rows[0];
    assert.equal(after.place_id, before.place_id);
    const repeat = (
      await db.query("select maps_save_place($1,'Ignored','do not overwrite',$2) id", [
        c,
        before.place_id,
      ])
    ).rows[0].id;
    assert.equal(repeat, sid);
    assert.equal(
      (await db.query('select note from saved_places where id=$1', [sid])).rows[0].note,
      'changed',
    );
    await as(db, B);
    assert.equal((await db.query('select * from saved_places')).rows.length, 0);
    assert.equal((await db.query('select * from places')).rows.length, 0);
    await assert.rejects(
      db.query("select maps_save_place($1,'Cafe','',$2)", [c, before.place_id]),
      /unavailable/,
    );
  } finally {
    await db.close();
  }
});
test('different custom pins with identical names remain distinct; coordinate validation rejects bad pins', async () => {
  const db = await setup();
  try {
    await as(db, A);
    const c = await city(db);
    await db.query("select maps_save_place($1,'Cafe','',null,52.5,13.4)", [c]);
    await db.query("select maps_save_place($1,'Cafe','',null,52.6,13.5)", [c]);
    assert.equal((await db.query('select * from places')).rows.length, 2);
    await assert.rejects(db.query("select maps_save_place($1,'Bad','',null,91,13)", [c]));
  } finally {
    await db.close();
  }
});
test('trip writes validate shares and maintain selected city; review updates check destination membership', async () => {
  const db = await setup();
  try {
    await as(db, A);
    const c = await city(db);
    const trip = (
      await db.query(
        "select maps_save_checkin(null,$1,'2026-12-01','2026-12-02','',array[$2::uuid]) id",
        [c, G],
      )
    ).rows[0].id;
    assert.equal(
      (await db.query('select city_id from check_ins where id=$1', [trip])).rows[0].city_id,
      c,
    );
    await assert.rejects(
      db.query("select maps_save_checkin(null,$1,'2026-12-01','2026-12-02','',array[$2::uuid])", [
        c,
        B,
      ]),
      /groups/,
    );
    await db.query("select maps_save_place($1,'Cafe','')", [c]);
    const p = (await db.query('select place_id from saved_places')).rows[0].place_id;
    const review = (
      await db.query(
        "insert into reviews(user_id,community_id,city,city_id,place,place_id,rating,body) values($1,$2,'Berlin, Germany',$3,'Cafe',$4,5,'Good') returning id",
        [A, G, c, p],
      )
    ).rows[0].id;
    await assert.rejects(db.query('update reviews set community_id=$1 where id=$2', [B, review]));
  } finally {
    await db.close();
  }
});
test('direct resolvers and search budget cannot be called by clients; budget is shared', async () => {
  const db = await setup();
  try {
    await as(db, A);
    await assert.rejects(db.query("select resolve_city('Spam')"), /permission denied/);
    await assert.rejects(db.query('select maps_take_search_budget($1)', [A]), /permission denied/);
    await db.exec('reset role; set role service_role');
    for (let i = 0; i < 5; i++)
      assert.equal((await db.query('select maps_take_search_budget($1) ok', [A])).rows[0].ok, true);
    assert.equal((await db.query('select maps_take_search_budget($1) ok', [A])).rows[0].ok, false);
  } finally {
    await db.close();
  }
});
test('imports require fresh server-cached results and retain different provider identities', async () => {
  const db = await setup();
  try {
    await as(db, A);
    const c = await city(db);
    await assert.rejects(
      db.query("select maps_import_result('missing','osm:node:1',$1)", [c]),
      /expired/,
    );
    await db.exec('reset role');
    const results = [1, 2].map((n) => ({
      provider_id: `osm:node:${n}`,
      kind: 'place',
      city_id: c,
      name: 'Same cafe',
      latitude: 52.5,
      longitude: 13.4,
    }));
    await db.query("insert into maps_search_cache values('valid',$1,now()+interval '1 day')", [
      JSON.stringify({ results }),
    ]);
    await as(db, A);
    const one = (await db.query("select maps_import_result('valid','osm:node:1',$1) item", [c]))
      .rows[0].item;
    const two = (await db.query("select maps_import_result('valid','osm:node:2',$1) item", [c]))
      .rows[0].item;
    assert.notEqual(one.id, two.id);
  } finally {
    await db.close();
  }
});

test('migration refuses duplicate bookmarks without deleting or altering existing rows', async () => {
  const db = new PGlite();
  try {
    await db.exec(fixture);
    const c = (await db.query("insert into cities(name) values('Berlin') returning id")).rows[0].id;
    const p = (
      await db.query("insert into places(city_id,name) values($1,'Cafe') returning id", [c])
    ).rows[0].id;
    for (const note of ['first note', 'second note'])
      await db.query(
        "insert into saved_places(user_id,city,city_id,name,place_id,note) values($1,'Berlin',$2,'Cafe',$3,$4)",
        [A, c, p, note],
      );
    await assert.rejects(db.exec(migration), /Duplicate bookmarks/);
    await db.exec('rollback');
    assert.equal((await db.query('select * from saved_places')).rows.length, 2);
  } finally {
    await db.close();
  }
});
test('legacy name-only forms still work and anonymous resolvers are blocked', async () => {
  const db = await setup();
  try {
    await as(db, A);
    await db.query(
      "insert into check_ins(user_id,city,arrival,departure) values($1,'Legacy city','2026-12-01','2026-12-02')",
      [A],
    );
    await db.query(
      "insert into saved_places(user_id,city,name,note) values($1,'Legacy city','Legacy cafe','Original')",
      [A],
    );
    const saved = (await db.query('select * from saved_places')).rows[0];
    await db.query("update saved_places set note='Only note changed' where id=$1", [saved.id]);
    assert.equal(
      (await db.query('select place_id from saved_places')).rows[0].place_id,
      saved.place_id,
    );
    await db.exec('reset role; set role anon');
    await assert.rejects(db.query("select resolve_city('Anon')"), /permission denied/);
  } finally {
    await db.close();
  }
});

test('two users can explicitly choose the same custom city without sharing private places', async () => {
  const db = await setup();
  try {
    await as(db, A);
    const first = await city(db);
    await db.query("select maps_save_place($1,'Private cafe','secret')", [first]);
    await as(db, B);
    const second = await city(db);
    assert.equal(first, second);
    await db.query(
      "select maps_save_checkin(null,$1,'2026-12-01','2026-12-02','',array[]::uuid[])",
      [second],
    );
    assert.equal((await db.query('select * from places')).rows.length, 0);
  } finally {
    await db.close();
  }
});

test('Google bookmarks store only references and user labels, with private ownership', async () => {
  const db = await setup();
  try {
    await as(db, A);
    const c = await city(db);
    await db.exec('reset role');
    await db.query(
      "insert into maps_search_cache values('google:test', $1::jsonb, now()+interval '10 minutes')",
      [JSON.stringify({ results: [{ provider_id: 'google:ChIJ_test', city_id: c }] })],
    );
    await as(db, A);
    const result = await db.query(
      "select maps_save_google_place('google:test','google:ChIJ_test',$1,'My cafe','Meet here') id",
      [c],
    );
    const row = (
      await db.query(
        'select p.* from places p join saved_places s on s.place_id=p.id where s.id=$1',
        [result.rows[0].id],
      )
    ).rows[0];
    assert.equal(row.name, 'My cafe');
    assert.equal(row.google_place_id, 'ChIJ_test');
    assert.equal(row.latitude, null);
    assert.equal(row.longitude, null);
    assert.ok(!row.address);
    assert.equal(
      (
        await db.query(
          "select maps_save_google_place('google:test','google:ChIJ_test',$1,'Duplicate','') id",
          [c],
        )
      ).rows[0].id,
      result.rows[0].id,
    );
    await assert.rejects(
      db.query("select maps_save_google_place('google:test','google:forged',$1,'Fake','')", [c]),
      /Search again/,
    );
    await as(db, B);
    assert.equal((await db.query('select * from places where id=$1', [row.id])).rows.length, 0);
    await assert.rejects(db.query('select maps_take_google_budget(4500)'), /permission denied/);
    await db.exec('reset role; set role service_role');
    assert.equal(
      (await db.query('select maps_take_google_budget(1) allowed')).rows[0].allowed,
      true,
    );
    assert.equal(
      (await db.query('select maps_take_google_budget(1) allowed')).rows[0].allowed,
      false,
    );
  } finally {
    await db.close();
  }
});
