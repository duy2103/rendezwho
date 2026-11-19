const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function invitationToken(input: string): string {
  const value = input.trim();
  if (uuid.test(value)) return value.toLowerCase();
  try {
    const url = new URL(value);
    const native =
      url.protocol === 'rendezwho:' &&
      url.hostname === 'join' &&
      (url.pathname === '' || url.pathname === '/');
    const configured = process.env.EXPO_PUBLIC_JOIN_BASE_URL;
    const base = configured ? new URL(configured) : null;
    const web =
      base &&
      url.protocol === 'https:' &&
      url.origin === base.origin &&
      url.pathname === base.pathname;
    const tokens = url.searchParams.getAll('token');
    if ((native || web) && tokens.length === 1 && uuid.test(tokens[0]))
      return tokens[0].toLowerCase();
  } catch {
    /* Invalid input is reported below. */
  }
  throw new Error('Enter the full invitation code or a Rendezwho join link.');
}
export function invitationLink(token: string) {
  const valid = invitationToken(token);
  const base = process.env.EXPO_PUBLIC_JOIN_BASE_URL;
  if (base) {
    const url = new URL(base);
    if (url.protocol !== 'https:') throw new Error('Join links require HTTPS.');
    url.searchParams.set('token', valid);
    return url.toString();
  }
  return `rendezwho://join?token=${encodeURIComponent(valid)}`;
}
