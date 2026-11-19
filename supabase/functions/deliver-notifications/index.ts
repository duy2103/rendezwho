import { createClient } from 'npm:@supabase/supabase-js@2';
// Schedule with an Authorization: Bearer <PUSH_WORKER_SECRET> header.
// No notification text, travel dates, or sender identity is placed on the lock screen.
Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('PUSH_WORKER_SECRET');
  if (request.method !== 'POST' || !secret || request.headers.get('authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  async function expo(path: string, body: unknown) {
    const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('Push service unavailable');
    const json = await response.json();
    if (json.errors?.length) throw new Error('Push service rejected the request');
    return json.data;
  }
  const ensure = (result: { error: unknown }) => { if (result.error) throw new Error('Delivery state could not be saved'); };
  try {
    // Receipts arrive asynchronously; retry retrieval on subsequent worker runs.
    const pending = await client.from('app_push_deliveries').select('id,token,ticket,claimed_at').not('ticket', 'is', null).is('finished_at', null).lt('claimed_at', new Date(Date.now() - 15 * 60000).toISOString()).limit(100);
    ensure(pending);
    if (pending.data?.length) {
      const receipts = await expo('getReceipts', { ids: pending.data.map(item => item.ticket) });
      for (const item of pending.data) {
        const receipt = receipts?.[item.ticket];
        if (!receipt) {
          if (Date.parse(item.claimed_at) < Date.now() - 86400000) ensure(await client.from('app_push_deliveries').update({ finished_at: new Date().toISOString(), last_error: 'Receipt unavailable after 24 hours' }).eq('id', item.id));
          continue;
        }
        if (receipt.details?.error === 'DeviceNotRegistered') ensure(await client.from('app_push_devices').delete().eq('token', item.token));
        else ensure(await client.from('app_push_deliveries').update({ finished_at: new Date().toISOString(), last_error: receipt.status === 'ok' ? null : String(receipt.details?.error ?? 'Delivery failed') }).eq('id', item.id));
      }
    }
    const jobs = await client.rpc('app_claim_push'); ensure(jobs);
    if (!jobs.data?.length) return Response.json({ submitted: 0 });
    const tickets = await expo('send', jobs.data.map((job: { token: string; user_id: string; kind: string; target_id: string; notification_id: string }) => ({
      to: job.token, title: 'Rendezwho', body: 'You have an update in your travel network.',
      data: { userId: job.user_id, kind: job.kind, target: job.target_id, notification: job.notification_id },
    })));
    if (!Array.isArray(tickets) || tickets.length !== jobs.data.length) throw new Error('Unexpected delivery response');
    for (let index = 0; index < jobs.data.length; index++) {
      const job = jobs.data[index]; const ticket = tickets[index];
      if (ticket.status === 'ok' && ticket.id) ensure(await client.from('app_push_deliveries').update({ ticket: ticket.id }).eq('id', job.delivery_id));
      else if (ticket.details?.error === 'DeviceNotRegistered') ensure(await client.from('app_push_devices').delete().eq('token', job.token));
      else ensure(await client.from('app_push_deliveries').update({ last_error: String(ticket.details?.error ?? 'Submission failed'), finished_at: ticket.details?.error === 'MessageTooBig' ? new Date().toISOString() : null }).eq('id', job.delivery_id));
    }
    return Response.json({ submitted: jobs.data.length });
  } catch {
    // Bounded retries are controlled by the database lease. Never expose tokens in errors.
    return Response.json({ error: 'Notification delivery failed. Retry later.' }, { status: 503 });
  }
});
