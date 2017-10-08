import {
    WorldInfo,
    WorldApi,
    WorldLists,
    WorldOverview,
    LogEntry,
    WorldPrivacy,
    WorldSizes
} from './api';

import { PortalLogParser } from './logs/portal';

import { sha1 } from './sha1';

const root = 'http://portal.theblockheads.net';
let request: typeof fetch;
try {
    request = fetch;
} catch {}

// Makes it possible to set the fetch function which the module uses. Necessary for terminal usage.
export function setFetch(fn: typeof fetch): void {
    request = fn;
}

function unescapeHTML(html: string) {
    let map: {[key: string]: string} = {
        '&lt;': '<',
        '&gt;': '>',
        '&amp;': '&',
        '&#39;': '\'',
        '&quot;': '"',
    };

    return html.replace(/(&.*?;)/g, (_, first: string) => map[first] as string);
}

function makeRequest (url: string, options: RequestInit = {}): Promise<Response> {
    let headers: {[k: string]: string} = {'X-Requested-With': 'XMLHttpRequest'};
    if (options.method == 'POST') {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }

    return request(`${root}${url}`, {
        mode: 'same-origin',
        credentials: 'same-origin',
        redirect: 'follow',
        headers,
        ...options
    });
}

function requestJSON(url: string, options?: RequestInit): Promise<{[key: string]: any}> {
    return makeRequest(url, options).then(r => r.json());
}

function requestPage(url: string, options?: RequestInit): Promise<string> {
    return makeRequest(url, options).then(r => r.text());
}

/**
 * Function to try to log in, if the log in fails, the returned promise will reject, otherwise it will resolve.
 *
 * @param username the username to try to log in with
 * @param password the password to try to log in with
 */
export async function login(username: string, password: string): Promise<void> {
    username = username.toLocaleUpperCase();

    let info = await requestJSON('/login', {
        method: 'POST',
        body: `username=${encodeURIComponent(username)}`,
    }) as {salt: string, salt2: string, seed: string, status: string};

    if (info.status != 'ok') throw new Error('Bad API response.');

    let hashedPass = sha1(info.salt + password);
    hashedPass += sha1(hashedPass + info.salt2);

    let body = `seed=${info.seed}&password=${hashedPass}&username=${encodeURIComponent(username)}`;

    let page = await requestPage('/login', {body});

    if (page.includes('Invalid username / password')) {
        throw new Error('Invalid username or password.');
    }
}

/**
 * Gets all worlds owned by the logged in user.
 */
export async function getWorlds(): Promise<WorldInfo[]> {
    let page = await requestPage('/worlds');
    let lines = page.split('\n');

    let worlds: WorldInfo[] = [];

    lines.forEach(line => {
        if (/\t\tupdateWorld/.test(line)) {
            let name = line.match(/name: '([^']+?)'/) as RegExpMatchArray;
            let id = line.match(/id: (\d+)/) as RegExpMatchArray;

            worlds.push({
                name: unescapeHTML(name[1]),
                id: id[1]
            });
        }
    });

    return worlds;
}

/** @inheritdoc */
export class Api implements WorldApi {
    private parser = new PortalLogParser();

    constructor(private info: WorldInfo) {}

    /** @inheritdoc */
    getLists = async (): Promise<WorldLists> => {
        let page = await requestPage(`/worlds/lists/${this.info.id}`);

        let getList = (name: string): string[] => {
            let names: string[] = [];
            let list = page.match(new RegExp(`<textarea name="${name}">([\\s\\S]*?)</textarea>`));
            if (list) {
                names = unescapeHTML(list[1])
                    .split(/\r?\n/);
            }

            // Remove duplicates / blank lines
            return Array.from(new Set(names)).filter(Boolean);
        };

        return {
            adminlist: getList('admins'),
            modlist: getList('modlist'),
            whitelist: getList('whitelist'),
            blacklist: getList('blacklist'),
        };
    }

    /** @inheritdoc */
    setLists = async (lists: WorldLists): Promise<void> => {
        let makeSafe = (list: string[]): string => encodeURIComponent(list.join('\n'));

        let body = `admins=${makeSafe(lists.adminlist)}`;
        body += `&modlist=${makeSafe(lists.modlist)}`;
        body += `&whitelist=${makeSafe(lists.whitelist)}`;
        body += `&blacklist=${makeSafe(lists.blacklist)}`;

        await requestJSON(`/worlds/lists/${this.info.id}`, {
            method: 'POST',
            body
        });
    }

    /** @inheritdoc */
    getOverview = async (): Promise<WorldOverview> => {
        let page = await requestPage(`/worlds/${this.info.id}`);
        let firstMatch = (r: RegExp, fallback = ''): string => {
            let m = page.match(r);
            return m ? m[1] : fallback;
        };

        let privacy = firstMatch(/^\$\('#privacy'\).val\('(.*?)'\)/m, 'public') as WorldPrivacy;

        let online: string[] = [];
        let match = page.match(/^\t<tr><td class="left">(.*?)(?=<\/td>)/gm);
        if (match) {
            online = online.concat(match.map(s => s.substr(22)));
        }

        // This is very messy, refactoring welcome.
        return {
            name: firstMatch(/^\t<title>(.*?) Manager \| Portal<\/title>$/m),

            owner: firstMatch(/^\t\t<td class="right">Owner:<\/td>\r?\n\t\t<td>(.*?)<\/td>$/m),
            created: new Date(firstMatch(/^\t\t<td>Created:<\/td><td>(.*?)<\/td>$/m) + ' GMT-0000'),
            last_activity: new Date(firstMatch(/^\t\t<td>Last Activity:<\/td><td>(.*?)<\/td>$/m) + ' GMT-0000'),
            credit_until: new Date(firstMatch(/^\t\t<td>Credit Until:<\/td><td>(.*?)<\/td>$/m) + ' GMT-0000'),
            link: firstMatch(/^\t<tr><td>Link:<\/td><td><a href="(.*)">\1<\/a>/m),

            pvp: !!firstMatch(/^\$\('#pvp'\)\./m),
            privacy,
            password: firstMatch(/^\t\t<td>Password:<\/td><td>(Yes|No)<\/td><\/tr>$/m) == 'Yes',
            size: (<WorldSizes>firstMatch(/^\t\t<td>Size:<\/td><td>(.*?)<\/td>$/m)),
            whitelist: firstMatch(/<td>Whitelist:<\/td><td>(Yes|No)<\/td>/m) == 'Yes',

            online,
        };
    }

    /** @inheritdoc */
    getLogs = (): Promise<LogEntry[]> => {
        return requestPage(`/worlds/logs/${this.info.id}`)
            .then(log => log.split('\n'))
            .then(lines => this.parser.parse(lines));
    }

    /** @inheritdoc */
    getMessages = (lastId: number = 0): Promise<{nextId: number, log: string[]}> => {
        return requestJSON('/api', {
            method: 'POST',
            body: `command=getchat&worldId=${this.info.id}&firstId=${lastId}`
        })
        .then(({status, log, nextId}: {status: string, log: string[], nextId: number}) => {
            if (status != 'ok') return {log: [], nextId: 0}; // Reset, world likely offline.
            return {nextId, log};
        }, () => ({log: [], nextId: lastId})); //Network error, don't reset nextId
    }

    /** @inheritdoc */
    send = (message: string): Promise<void> => {
        return requestJSON('/api', {
            method: 'POST',
            body: `command=send&worldId=${this.info.id}&message=${encodeURIComponent(message)}`
        }).then(result => {
            if (result.status == 'ok') return;
            throw new Error(`Unable to send ${message}`);
        });
    }

    /** @inheritdoc */
    start = (): Promise<void> => {
        return requestJSON('/api', {
            method: 'POST',
            body: `command=start&worldId=${this.info.id}`
        })
        .then(() => undefined, console.error);
    }

    /** @inheritdoc */
    stop = (): Promise<void> => {
        return requestJSON('/api', {
            method: 'POST',
            body: `command=stop&worldId=${this.info.id}`
        })
        .then(() => undefined, console.error);
    }

    /** @inheritdoc */
    restart = (): Promise<void> => {
        return requestJSON('/api', {
            method: 'POST',
            body: `command=reboot&worldId=${this.info.id}`
        })
        .then(() => undefined, console.error);
    }
}
