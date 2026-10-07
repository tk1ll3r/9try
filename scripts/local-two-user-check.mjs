import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright';
import { createServer } from 'vite';

// Explicit local-only integration gate. Never accepts a staging/production URL.
const url = process.env.LOCAL_SUPABASE_URL;
const key = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
if (!['http://127.0.0.1:54321', 'http://localhost:54321'].includes(url) || !key || !process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY || process.env.CONFIRM_LOCAL_TWO_USER_TEST !== 'yes') {
  throw new Error('Refusing to run: require localhost:54321, LOCAL_SUPABASE_SERVICE_ROLE_KEY, LOCAL_SUPABASE_PUBLISHABLE_KEY and CONFIRM_LOCAL_TWO_USER_TEST=yes.');
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const run = randomBytes(5).toString('hex');
const created = [];
let browser;
let vite;
const fail = (message, error) => { throw new Error(error ? `${message}: ${error.message}` : message); };
const asUser = token => createClient(url, process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY, {
  global: { headers: { Authorization: `Bearer ${token}` } },
  auth: { persistSession: false, autoRefreshToken: false },
});
try {
  const persons = [];
  for (const name of ['an', 'binh']) {
    const email = `${name}-${run}@example.test`;
    const password = randomBytes(32).toString('base64url');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name === 'an' ? 'An (test)' : 'Bình (test)' } });
    if (error || !data.user) fail('Could not create disposable Auth user', error);
    created.push(data.user.id);
    const { data: signedIn, error: signInError } = await admin.auth.signInWithPassword({ email, password });
    if (signInError || !signedIn.session) fail('Disposable user login failed', signInError);
    const client = asUser(signedIn.session.access_token);
    const username = `demo_${name}_${run}`;
    const { error: profileError } = await client.from('profiles').update({ username, display_name: name === 'an' ? 'An (test)' : 'Bình (test)' }).eq('id', data.user.id);
    if (profileError) fail('Profile setup failed', profileError);
    persons.push({ name, id: data.user.id, client, username, session: signedIn.session });
  }
  const [an, binh] = persons;
  const { data: task, error: taskError } = await an.client.from('personal_tasks').insert({ owner_id: an.id, title: `Local-only private task ${run}`, priority: 'medium' }).select('id').single();
  if (taskError || !task) fail('Task insert failed', taskError);
  const { data: anTask, error: ownError } = await an.client.from('personal_tasks').select('id').eq('id', task.id);
  const { data: binhTask, error: foreignError } = await binh.client.from('personal_tasks').select('id').eq('id', task.id);
  if (ownError || foreignError || anTask?.length !== 1 || binhTask?.length !== 0) fail('Task RLS isolation did not pass', ownError || foreignError);
  const { data: sessionId, error: sessionError } = await an.client.rpc('start_location_session', { p_duration_minutes: 30, p_recipient_usernames: [binh.username], p_approximate: true });
  if (sessionError || !sessionId) fail('Explicit recipient session failed', sessionError);
  const { error: positionError } = await an.client.from('location_positions').upsert({
    session_id: sessionId, latitude: 10.7725, longitude: 106.698, accuracy_m: 100,
    recorded_at: new Date().toISOString(),
  });
  if (positionError) fail('Could not insert disposable public-place coordinate', positionError);
  const { data: visible, error: visibleError } = await binh.client.rpc('list_visible_locations');
  if (visibleError || !visible?.some(row => row.session_id === sessionId)) fail('Recipient could not see authorized session', visibleError);
  const { data: foreignUpdate, error: updateError } = await binh.client.from('personal_tasks').update({ title: `Unauthorized ${run}` }).eq('id', task.id).select('id');
  if (updateError || foreignUpdate?.length) fail('Other user could update private task', updateError);
  const { data: unchanged, error: unchangedError } = await an.client.from('personal_tasks').select('title').eq('id', task.id).single();
  if (unchangedError || unchanged.title !== `Local-only private task ${run}`) fail('Private task was changed by another user', unchangedError);
  const anon = createClient(url, process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: anonymousTask, error: anonError } = await anon.from('personal_tasks').select('id').eq('id', task.id);
  if ((!anonError && anonymousTask?.length) || (anonError && anonError.code !== '42501')) fail('Anonymous caller could read private task', anonError);

  // Real isolated browser sessions: only public publishable key and individual
  // user JWTs enter a browser. The service key stays in this Node process.
  process.env.VITE_SUPABASE_URL = url;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.LOCAL_SUPABASE_PUBLISHABLE_KEY;
  process.env.VITE_ENABLE_DEMO = 'false';
  vite = await createServer({ server: { host: '127.0.0.1', port: 0, strictPort: false }, clearScreen: false });
  await vite.listen();
  const address = vite.httpServer?.address();
  if (!address || typeof address === 'string') fail('Could not start isolated Vite server');
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader'] });
  const contexts = await Promise.all(persons.map(() => browser.newContext()));
  try {
    const pages = await Promise.all(persons.map(async (person, index) => {
      const page = await contexts[index].newPage();
      await page.route('https://tiles.openfreemap.org/**', route => route.fulfill({ json: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e9e5d7' } }] } }));
      await page.addInitScript(({ session }) => {
        localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
        window.__gpsWatchCount = 0;
        navigator.geolocation.watchPosition = () => { window.__gpsWatchCount++; throw new Error('Local browser test must not start GPS'); };
      }, { session: person.session });
      return page;
    }));
    const [anPage, binhPage] = pages;
    const taskResponses = [];
    anPage.on('response', async response => {
      if (!response.url().includes('/rest/v1/personal_tasks')) return;
      try { const rows = await response.json(); taskResponses.push({ host: new URL(response.url()).host, status: response.status(), count: Array.isArray(rows) ? rows.length : undefined, authMatches: (await response.request().allHeaders()).authorization === `Bearer ${an.session.access_token}`, error: Array.isArray(rows) ? undefined : rows?.code }); }
      catch { taskResponses.push({ status: response.status(), unreadable: true }); }
    });
    await Promise.all([anPage.goto(`${origin}/me/organizer`), binhPage.goto(`${origin}/me/organizer`)]);
    await anPage.getByRole('heading', { name: 'Việc, ghi chú & thói quen' }).waitFor();
    await binhPage.getByRole('heading', { name: 'Việc, ghi chú & thói quen' }).waitFor();
    try { await anPage.getByText(`Local-only private task ${run}`).waitFor({ timeout: 10_000 }); }
    catch (error) {
      console.error('An browser headings:', (await anPage.locator('h1,h2').allTextContents()).join(' | ').slice(0, 300));
      console.error('An organizer alerts:', (await anPage.getByRole('alert').allTextContents()).join(' | ').slice(0, 300));
      console.error('An task responses:', JSON.stringify(taskResponses));
      console.error('An stored auth keys and owner match:', await anPage.evaluate(expected => ({ keys: Object.keys(localStorage).filter(k => k.startsWith('sb-')), ownerMatch: Object.values(localStorage).some(value => { try { return JSON.parse(value)?.user?.id === expected; } catch { return false; } }) }), an.id));
      console.error('An card UI:', (await anPage.locator('main').innerText()).slice(0, 650));
      throw error;
    }
    if (await binhPage.getByText(`Local-only private task ${run}`).count()) fail('Browser task privacy failed');
    await anPage.goto(origin);
    await anPage.getByRole('heading', { name: 'Hôm nay mình có gì?' }).waitFor();
    await anPage.getByRole('button', { name: `Hoàn thành: Local-only private task ${run}` }).waitFor();
    await anPage.getByRole('button', { name: `Hoàn thành: Local-only private task ${run}` }).click();
    await anPage.getByRole('button', { name: 'Hoàn tác' }).waitFor();
    await anPage.getByRole('button', { name: 'Hoàn tác' }).click();
    await anPage.getByRole('button', { name: `Hoàn thành: Local-only private task ${run}` }).waitFor();
    await Promise.all([anPage.goto(`${origin}/me/location`), binhPage.goto(`${origin}/me/location`)]);
    await anPage.getByRole('heading', { name: 'Chia sẻ vị trí', exact: true }).waitFor();
    await binhPage.getByRole('heading', { name: 'Chia sẻ vị trí', exact: true }).waitFor();
    await anPage.getByRole('button', { name: 'Dừng phiên này' }).waitFor();
    await binhPage.getByText('An (test)').first().waitFor();
    await binhPage.locator('.maplibregl-marker').first().waitFor();
    await anPage.reload();
    await anPage.getByRole('button', { name: 'Dừng phiên này' }).waitFor();
    if (await anPage.evaluate(() => window.__gpsWatchCount) !== 0) fail('Reload automatically restarted GPS');
    await anPage.getByRole('button', { name: 'Dừng phiên này' }).click();
    await anPage.getByText('Đã dừng phiên và xóa vị trí gần nhất.').waitFor();
    await binhPage.reload();
    await binhPage.getByRole('heading', { name: 'Chia sẻ vị trí', exact: true }).waitFor();
    await binhPage.getByText('Chưa có ai chia sẻ.').waitFor();
    if (await binhPage.locator('.maplibregl-marker').count()) fail('Stopped location still visible to recipient in browser');
  } finally { await Promise.all(contexts.map(context => context.close())); }
  const { data: positions, error: positionLookupError } = await admin.from('location_positions').select('session_id').eq('session_id', sessionId);
  if (positionLookupError || positions?.length) fail('Stop did not delete stored coordinate', positionLookupError);
  const { error: stopError } = await an.client.rpc('stop_location_session', { p_session_id: sessionId });
  if (stopError) fail('Session stop failed', stopError);
  const { data: revoked, error: revokedError } = await binh.client.rpc('list_visible_locations');
  if (revokedError || revoked?.some(row => row.session_id === sessionId)) fail('Stopped session still visible', revokedError);
  console.log('PASS: two disposable local Auth identities, isolated authenticated Chromium contexts, private-task RLS, Home complete/Undo, recipient marker, reload/no GPS and stop/deletion/revocation. No real Gmail or physical GPS tested.');
} finally {
  await browser?.close();
  await vite?.close();
  for (const id of created.reverse()) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) console.error('Cleanup failed for disposable local Auth user ID:', id);
  }
}
