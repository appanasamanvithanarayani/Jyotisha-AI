/* Manual local check. Start isolated Chrome CDP on 127.0.0.1:9229 first.
   Usage: node evaluations/LOCAL_BROWSER_FLOW_SMOKE.cjs 8766 */
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const port = Number(process.argv[2] || 8766);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  const pages = await (await fetch('http://127.0.0.1:9229/json')).json();
  const page = pages.find(item => item.type === 'page' && (item.url === 'about:blank' || item.url === `http://127.0.0.1:${port}/`));
  if (!page) throw new Error('Isolated blank Chrome page not found');
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {socket.onopen = resolve; socket.onerror = reject;});
  let id = 0;
  const pending = new Map();
  const exceptions = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
    if (pending.has(message.id)) {pending.get(message.id)(message);pending.delete(message.id);}
  };
  const send = (method, params = {}) => new Promise(resolve => {
    const next = ++id; pending.set(next, resolve);
    socket.send(JSON.stringify({id: next, method, params}));
  });
  const evaluate = async expression => {
    const response = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
    if (response.result.exceptionDetails) throw new Error(response.result.exceptionDetails.text);
    return response.result.result.value;
  };
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.navigate', {url: `http://127.0.0.1:${port}/`});
    await wait(700);
    const locale = ['en','te','hi'].includes(process.argv[3]) ? process.argv[3] : 'en';
    const city = process.argv[4] || 'bengaluru';
    await evaluate(`document.getElementById('welcome-next').click();document.getElementById('language-choice').value='${locale}';document.getElementById('language-next').click();document.getElementById('welcome-city').value=${JSON.stringify(city)};document.getElementById('welcome-form').requestSubmit();true`);
    await wait(2500);
    const state = JSON.parse(await evaluate(`JSON.stringify({
      title:document.getElementById('panchang-title').textContent,
      today:document.getElementById('today-date').textContent,
      values:[...document.querySelectorAll('#today-values .panchang-value span')].map(x=>x.textContent),
      calendarDays:document.querySelectorAll('.calendar-day').length,
      calendarError:document.getElementById('calendar-error').textContent,
      cityError:document.getElementById('city-error').textContent,
      cityErrorVisible:!document.getElementById('city-error').hidden,
      status:document.getElementById('panchang-result').textContent,
      cityInput:document.querySelector('#panchang-form [name="place"]').value,
      drawerInitiallyOpen:document.getElementById('calendar-drawer').open
    })`));
    if (process.argv[5] !== 'error') state.drawerOpened = await evaluate("document.querySelector('#calendar-drawer > summary').click();document.getElementById('calendar-drawer').open");
    state.exceptions = exceptions;
    console.log(JSON.stringify(state, null, 2));
    const failed = process.argv[5] === 'error' ?
      (!state.cityErrorVisible || !state.cityError || !state.drawerInitiallyOpen || exceptions.length) :
      (!state.today || state.values.length !== 6 || state.calendarDays !== 31 ||
       state.calendarError || state.drawerInitiallyOpen || !state.drawerOpened || exceptions.length);
    if (failed) {
      process.exitCode = 1;
    }
  } finally {socket.close();}
}
main().catch(error => {console.error(error);process.exitCode = 1;});
