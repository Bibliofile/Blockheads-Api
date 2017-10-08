import * as ava from 'ava';
import { WorldOverview } from './api';
import { setFetch, login, getWorlds, Api } from './cloud';
import { readFile } from 'fs';

const tick = () => new Promise(r => setImmediate(r));

const getFile = (path: string) => new Promise((res, rej) => readFile(path, 'utf-8', (err, data) => err ? rej(err) : res(data)));

type requestArray = {
    url: string,
    init: RequestInit,
    reject: (err: any) => void,
    resolve: (result: Response) => void
}[];

class MockResponse implements Response {
    headers: Headers;
    ok: boolean;
    status: number;
    statusText: string;
    type: ResponseType = 'cors';
    url: string = '';
    bodyUsed: boolean = false;
    constructor(public readonly body: any, init: ResponseInit = {}) {
        this.status = init.status || 200;
        this.statusText = init.statusText || 'OK';
        this.ok = this.status >= 200 && this.status < 300;
    }

    clone(): Response {
        throw new Error('Method not implemented.');
    }
    arrayBuffer(): Promise<ArrayBuffer> {
        throw new Error('Method not implemented.');
    }
    blob(): Promise<Blob> {
        throw new Error('Method not implemented.');
    }
    async json(): Promise<any> {
        return JSON.parse(this.body);
    }
    async text(): Promise<string> {
        return this.body.toString();
    }
    formData(): Promise<FormData> {
        throw new Error('Method not implemented.');
    }
}

function makeResponse(body: any) {
    if (typeof body != 'string') body = JSON.stringify(body);
    return new MockResponse(body, { status: 200 });
}

function respondToLastRequest(requests: requestArray, body: any) {
    requests[requests.length - 1].resolve(makeResponse(body));
}

// /api, /login, /worlds/lists/:id, /login, /worlds/:id
function makeMockFetch() {
    let requests: requestArray = [];
    function mockFetch(input: RequestInfo, init: RequestInit = {}): Promise<Response> {
        if (typeof input != 'string') throw new Error('input must be a string');

        return new Promise((resolve, reject) => {
            requests.push({
                url: input.replace('http://portal.theblockheads.net', ''),
                init, resolve, reject
            });
        });
    }

    return {requests, mockFetch};
}


const baseTest = ava.test as ava.RegisterContextual<{requests: requestArray}>;
baseTest.beforeEach(t => {
    let { requests, mockFetch } = makeMockFetch();
    setFetch(mockFetch);
    t.context.requests = requests;
});

// Because we are mocking fetch, it is very difficult to test anything without using serial tests.
const test = baseTest.serial;


test(`login should throw if the seed request does not return correctly`, async t => {
    let prom = login('user', 'pass');
    respondToLastRequest(t.context.requests, {status: 'error'});

    try {
        await prom;
        t.fail();
    } catch (err) {
        t.is(err.message, 'Bad API response.');
    }
});

test(`login should hash the password with the response seeds`, async t => {
    login('user', 'pass');
    respondToLastRequest(t.context.requests, {status: 'ok', salt: 'salt1', salt2: 'salt2', seed: 'seed'});
    await tick();

    t.is(t.context.requests[1].init.body, `seed=seed&password=271d0274ba2611272725b7bd71d190255e5e04934e0baf7163c6b14bcc218b48cec1f17268f24d0b&username=USER`);
});

test(`login should throw if the password is invalid`, async t => {
    let prom = login('user', 'pass');
    respondToLastRequest(t.context.requests, { status: 'ok', salt: 'salt1', salt2: 'salt2', seed: 'seed' });
    await tick();

    let html = await getFile('./test_data/invalid_password.html');
    respondToLastRequest(t.context.requests, html);
    await tick();

    try {
        await prom;
        t.fail();
    } catch (err) {
        t.is(err.message, 'Invalid username or password.');
    }
});

test(`login should resolve if the password is valid`, async t => {
    let prom = login('user', 'pass');
    respondToLastRequest(t.context.requests, { status: 'ok', salt: 'salt1', salt2: 'salt2', seed: 'seed' });
    await tick();

    let html = await getFile('./test_data/worlds.html');
    respondToLastRequest(t.context.requests, html);

    await prom;
    t.pass();
});

test(`getWorlds should return an array of world names and ids`, async t => {
    let prom = getWorlds();
    respondToLastRequest(t.context.requests, await getFile('./test_data/worlds.html'));
    let worlds = await prom;
    t.deepEqual(worlds, [
        { name: 'AIRSTEDDING', id: '123' },
        { name: 'DEMO', id: '11' },
        { name: 'BIB\'S CRIB', id: '10'}
    ]);
});

test(`getLists should return the world lists`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123'});

    let prom = api.getLists();
    t.is(t.context.requests[0].url, `/worlds/lists/123`);
    respondToLastRequest(t.context.requests, await getFile('./test_data/lists.html'));
    let lists = await prom;

    t.deepEqual(lists, {
        adminlist: ['%#&!\'=', 'PERSON', 'BIBLIOFILE', '-bib_phile-2'],
        modlist: ['ME: TEST :', '-bib_phile-2','0x159'],
        whitelist: ['ME: TEST :', '-bib_phile-2', 'abcbib', 'dkswoa'],
        blacklist: ['test']
    });
});

test(`getLists should return empty lists if not logged in`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123'});

    let prom = api.getLists();
    respondToLastRequest(t.context.requests, await getFile('./test_data/invalid_password.html'));
    let lists = await prom;

    t.deepEqual(lists, {
        adminlist: [],
        modlist: [],
        whitelist: [],
        blacklist: []
    });
});

test(`setLists should encode names`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });

    api.setLists({ adminlist: ['%#&!&\'='], modlist: [], whitelist: [], blacklist: []});
    t.is(t.context.requests[0].init.body, `admins=%25%23%26!%26\'%3D&modlist=&whitelist=&blacklist=`);
    t.is(t.context.requests[0].url, `/worlds/lists/123`);
});

test(`getOverview should correctly return the world overview`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });

    let prom = api.getOverview();
    t.is(t.context.requests[0].url, '/worlds/123');

    respondToLastRequest(t.context.requests, await getFile('./test_data/overview.html'));
    let overview = await prom;

    t.deepEqual<WorldOverview>(overview, {
        name: 'AIRSTEDDING',
        owner: 'BIBLIOPHILE',
        created: new Date('14 Jun 2015, 10:07 +0000'),
        last_activity: new Date('05 Oct 2017, 21:05 +0000'),
        credit_until: new Date('03 Feb 2018, 14:31 +0000'),
        link: 'http://theblockheads.net/join.php?id=6576223991974faf62774361d6cdd1cc',
        pvp: false,
        privacy: 'searchable',
        password: false,
        size: '4x',
        whitelist: true,
        online: [],
    });
});

test(`getOverview should correctly return the world overview with online players`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });

    let prom = api.getOverview();

    respondToLastRequest(t.context.requests, await getFile('./test_data/overview2.html'));
    let overview = await prom;

    t.deepEqual<WorldOverview>(overview, {
        name: 'AIRSTEDDING',
        owner: 'BIBLIOPHILE',
        created: new Date('14 Jun 2015, 10:07 +0000'),
        last_activity: new Date('07 Oct 2017, 17:28 +0000'),
        credit_until: new Date('03 Feb 2018, 14:31 +0000'),
        link: 'http://theblockheads.net/join.php?id=6576223991974faf62774361d6cdd1cc',
        pvp: false,
        privacy: 'searchable',
        password: false,
        size: '4x',
        whitelist: true,
        online: ['BIBLIOPHILE'],
    });
});

test(`getLogs should return the parsed logs`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });

    let prom = api.getLogs();

    t.is(t.context.requests[0].url, '/worlds/logs/123');
    // We aren't testing the log parser here
    respondToLastRequest(t.context.requests, '');
    let logs = await prom;
    t.deepEqual(logs, []);
});

test(`getMessages should return the nextId and the log`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });
    let prom = api.getMessages();

    t.is(t.context.requests[0].url, `/api`);
    t.is(t.context.requests[0].init.body, `command=getchat&worldId=123&firstId=0`);
    let response = { status: 'ok', log: ['a'], nextId: 1 };
    respondToLastRequest(t.context.requests, response);

    let result = await prom;
    t.deepEqual(result, {nextId: response.nextId, log: response.log});
});

test(`getMessages should reset the nextId if the api returns an error`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });
    let prom = api.getMessages(123);
    respondToLastRequest(t.context.requests, { status: 'error' });
    let result = await prom;
    t.deepEqual(result, { nextId: 0, log: [] });
});

test(`getMessages should not reset the nextId if there is a network error`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });
    let prom = api.getMessages(123);

    t.context.requests[0].reject(new Error('Fake Network error'));

    let result = await prom;
    t.deepEqual(result, { nextId: 123, log: [] });
});

test(`send should encode the message`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });
    let prom = api.send('Hello &');
    t.is(t.context.requests[0].url, '/api');
    t.is(t.context.requests[0].init.body, `command=send&worldId=123&message=Hello%20%26`);
    respondToLastRequest(t.context.requests, { status: 'ok' });
    await prom;
});

test(`send should throw if unable to send`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });
    let prom = api.send('Hello');
    respondToLastRequest(t.context.requests, { status: 'error' });
    try {
        await prom;
        t.fail();
    } catch {
        t.pass();
    }
});

test(`start should start the world`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });
    let prom = api.start();
    t.is(t.context.requests[0].init.body, `command=start&worldId=123`);
    respondToLastRequest(t.context.requests, {status: 'ok'});
    await prom;
});

test(`stop should stop the world`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });
    let prom = api.stop();
    t.is(t.context.requests[0].init.body, `command=stop&worldId=123`);
    respondToLastRequest(t.context.requests, {status: 'ok'});
    await prom;
});

test(`restart should restart the world`, async t => {
    let api = new Api({ name: 'AIRSTEDDING', id: '123' });
    let prom = api.restart();
    t.is(t.context.requests[0].init.body, `command=reboot&worldId=123`);
    respondToLastRequest(t.context.requests, {status: 'ok'});
    await prom;
});