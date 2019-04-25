import * as tape from 'tape'

import { setFetch, login, getWorlds, Api } from './index'
import { readFile } from 'fs'

const tick = () => new Promise(r => setImmediate(r))

const getFile = (path: string) => new Promise((res, rej) => readFile(path, 'utf-8', (err, data) => err ? rej(err) : res(data)))

type requestArray = {
    url: string,
    init: RequestInit,
    reject: (err: any) => void,
    resolve: (result: Response) => void
}[]

class MockResponse implements Response {
    trailer: Promise<Headers>
    headers: Headers
    ok: boolean
    status: number
    statusText: string
    redirected: boolean = false
    type: ResponseType = 'cors'
    url: string = ''
    bodyUsed: boolean = false
    constructor(public readonly body: any, init: ResponseInit = {}) {
        this.status = init.status || 200
        this.statusText = init.statusText || 'OK'
        this.ok = this.status >= 200 && this.status < 300
        this.headers = {} as any
        this.trailer = Promise.resolve(this.headers)
    }

    clone(): Response {
        throw new Error('Method not implemented.')
    }
    arrayBuffer(): Promise<ArrayBuffer> {
        throw new Error('Method not implemented.')
    }
    blob(): Promise<Blob> {
        throw new Error('Method not implemented.')
    }
    async json(): Promise<any> {
        return JSON.parse(this.body)
    }
    async text(): Promise<string> {
        return this.body.toString()
    }
    formData(): Promise<FormData> {
        throw new Error('Method not implemented.')
    }
}

function makeResponse(body: any) {
    if (typeof body != 'string') body = JSON.stringify(body)
    return new MockResponse(body, { status: 200 })
}

function respondToLastRequest(requests: requestArray, body: any) {
    requests[requests.length - 1].resolve(makeResponse(body))
}

// /api, /login, /worlds/lists/:id, /login, /worlds/:id
function makeMockFetch() {
    const requests: requestArray = []
    function mockFetch(input?: RequestInfo | string, init: RequestInit | undefined = {}): Promise<Response> {
        if (typeof input != 'string') throw new Error('input must be a string')

        return new Promise((resolve, reject) => {
            requests.push({
                url: input.replace('http://portal.theblockheads.net', ''),
                init, resolve, reject
            })
        })
    }

    return {requests, mockFetch}
}

// Modified from https://github.com/substack/tape/issues/59
function beforeEach(test: typeof tape, handler: tape.TestCase) {
    return function (name: string, listener: (t: tape.Test) => void | Promise<void>) {
        test(`Cloud - index - ${name}`, t => {
            const end = t.end
            t.end = function () {
                t.end = end
                const result = listener(t)
                if (result instanceof Promise) {
                    result
                        .then(() => t.end())
                        .catch(err => t.end(err))
                } else {
                    t.end()
                }
            }

            handler(t)
        })
    }
}

const context: { requests: requestArray } = { requests: [] }

const test = beforeEach(tape, t => {
    const { requests, mockFetch } = makeMockFetch()
    setFetch(mockFetch)
    context.requests = requests
    t.end()
})


test(`login should throw if the seed request does not return correctly`, async t => {
    const prom = login('user', 'pass')
    t.is(context.requests[0].init.method, 'POST')
    respondToLastRequest(context.requests, {status: 'error'})

    try {
        await prom
        t.fail()
    } catch (err) {
        t.is(err.message, 'Bad API response.')
    }
})

test(`login should hash the password with the response seeds`, async t => {
    const prom = login('user', 'pass')
    prom.catch(t.fail)
    respondToLastRequest(context.requests, {status: 'ok', salt: 'salt1', salt2: 'salt2', seed: 'seed'})
    await tick()

    t.is(context.requests[1].init.body, `seed=seed&password=4e0baf7163c6b14bcc218b48cec1f17268f24d0b&username=USER`)
    t.is(context.requests[0].init.method, 'POST')
})

test(`login should throw if the password is invalid`, async t => {
    const prom = login('user', 'pass')
    prom.catch(() => { }) // See https://stackoverflow.com/a/40921505
    respondToLastRequest(context.requests, { status: 'ok', salt: 'salt1', salt2: 'salt2', seed: 'seed' })
    await tick()

    const html = await getFile(__dirname + '/test_data/invalid_password.html')
    respondToLastRequest(context.requests, html)

    try {
        await tick()
        await prom
        t.fail()
    } catch (err) {
        t.is(err.message, 'Invalid username or password.')
    }
})

test(`login should resolve if the password is valid`, async t => {
    const prom = login('user', 'pass')
    respondToLastRequest(context.requests, { status: 'ok', salt: 'salt1', salt2: 'salt2', seed: 'seed' })
    await tick()

    const html = await getFile(__dirname + '/test_data/worlds.html')
    respondToLastRequest(context.requests, html)

    await prom
    t.pass()
})

test(`getWorlds should return an array of world names and ids`, async t => {
    const prom = getWorlds()
    respondToLastRequest(context.requests, await getFile(__dirname + '/test_data/worlds.html'))
    const worlds = await prom
    t.deepEqual(worlds, [
        { name: 'AIRSTEDDING', id: '123' },
        { name: 'DEMO', id: '11' },
        { name: 'BIB\'S CRIB', id: '10'}
    ])
})

test(`getLists should return the world lists`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123'})

    const prom = api.getLists()
    t.is(context.requests[0].url, `/worlds/lists/123`)
    respondToLastRequest(context.requests, await getFile(__dirname + '/test_data/lists.html'))
    const lists = await prom

    t.deepEqual(lists, {
        adminlist: ['%#&!\'=', 'PERSON', 'BIBLIOFILE', '-bib_phile-2'],
        modlist: ['ME: TEST :', '-bib_phile-2','0x159'],
        whitelist: ['ME: TEST :', '-bib_phile-2', 'abcbib', 'dkswoa'],
        blacklist: ['test']
    })
})

test(`getLists should return empty lists if not logged in`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123'})

    const prom = api.getLists()
    respondToLastRequest(context.requests, await getFile(__dirname + '/test_data/invalid_password.html'))
    const lists = await prom

    t.deepEqual(lists, {
        adminlist: [],
        modlist: [],
        whitelist: [],
        blacklist: []
    })
})

test(`setLists should encode names`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })

    api.setLists({ adminlist: ['%#&!&\'='], modlist: [], whitelist: [], blacklist: []}).catch(t.fail)
    t.is(context.requests[0].init.body, `admins=%25%23%26!%26\'%3D&modlist=&whitelist=&blacklist=`)
    t.is(context.requests[0].url, `/worlds/lists/123`)
})

test(`getOverview should correctly return the world overview`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })

    const prom = api.getOverview()
    t.is(context.requests[0].url, '/worlds/123')

    respondToLastRequest(context.requests, await getFile(__dirname + '/test_data/overview.html'))
    const overview = await prom

    t.deepEqual(overview, {
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
        status: 'offline'
    })
})

test(`getOverview should correctly return the world overview with online players`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })

    const prom = api.getOverview()

    respondToLastRequest(context.requests, await getFile(__dirname + '/test_data/overview2.html'))
    const overview = await prom

    t.deepEqual(overview, {
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
        status: 'online'
    })
})

test(`getLogs should return the parsed logs`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })

    const prom = api.getLogs()

    t.is(context.requests[0].url, '/worlds/logs/123')
    // We aren't testing the log parser here
    respondToLastRequest(context.requests, '')
    const logs = await prom
    t.deepEqual(logs, [])
})

test(`getMessages should return the nextId and the log`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.getMessages()

    t.is(context.requests[0].url, `/api`)
    t.is(context.requests[0].init.body, `command=getchat&worldId=123&firstId=0`)
    const response = { status: 'ok', log: ['a'], nextId: 1 }
    respondToLastRequest(context.requests, response)

    const result = await prom
    t.deepEqual(result, {nextId: response.nextId, log: response.log})
})

test(`getMessages should reset the nextId if the api returns an error`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.getMessages(123)
    respondToLastRequest(context.requests, { status: 'error' })
    const result = await prom
    t.deepEqual(result, { nextId: 0, log: [] })
})

test(`getMessages should not reset the nextId if there is a network error`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.getMessages(123)

    context.requests[0].reject(new Error('Fake Network error'))

    const result = await prom
    t.deepEqual(result, { nextId: 123, log: [] })
})

test(`send should encode the message`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.send('Hello &')
    t.is(context.requests[0].url, '/api')
    t.is(context.requests[0].init.body, `command=send&worldId=123&message=Hello%20%26`)
    respondToLastRequest(context.requests, { status: 'ok' })
    await prom
})

test(`send should throw if unable to send`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.send('Hello')
    respondToLastRequest(context.requests, { status: 'error' })
    try {
        await prom
        t.fail()
    } catch (_) {
        t.pass()
    }
})

test(`start should start the world`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.start()
    t.is(context.requests[0].init.body, `command=start&worldId=123`)
    respondToLastRequest(context.requests, {status: 'ok'})
    await prom
})

test(`stop should stop the world`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.stop()
    t.is(context.requests[0].init.body, `command=stop&worldId=123`)
    respondToLastRequest(context.requests, {status: 'ok'})
    await prom
})

test(`restart should restart the world`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.restart()
    t.is(context.requests[0].init.body, `command=reboot&worldId=123`)
    respondToLastRequest(context.requests, {status: 'ok'})
    await prom
})

test(`getStatus should get the world status`, async t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    const prom = api.getStatus()
    t.is(context.requests[0].init.body, `command=status&worldId=123`)
    respondToLastRequest(context.requests, { status: 'ok', worldStatus: 'online'})
    t.is(await prom, 'online')
})

test(`name should return the world name`, t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    t.is(api.name, 'AIRSTEDDING')
})

test(`id should return the world id`, t => {
    const api = new Api({ name: 'AIRSTEDDING', id: '123' })
    t.is(api.id, '123')
})
