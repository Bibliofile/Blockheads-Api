// Once Node 8 LTS is out, update this to use util.promisify()

const promisify = require('util.promisify') as (fn: Function) => Function;
import {readFile, writeFile, readdir } from 'fs';

// This is ugly. Would be great to fix.
function readFileAsync (filename: string): Promise<Buffer>;
function readFileAsync(filename: string, encoding: string): Promise<string>;
function readFileAsync(filename: string, encoding?: string) {
    return promisify(readFile)(filename, encoding);
}
let writeFileAsync = promisify(writeFile) as (filename: string, encoding: string) => Promise<string>;
let readdirAsync = promisify(readdir) as (path: string | Buffer) => Promise<string[]>;

import { exec } from 'child_process';
let execAsync = promisify(exec) as (command: string) => Promise<[string, string]>;

import * as zlib from 'zlib';
import { LogParser } from './logs/mac';
import { WorldInfo, WorldApi, WorldLists, WorldSizes, WorldOverview, LogEntry } from './api';

const plist = require('simple-plist') as {
    readFile: (file: string, callback: (err: Error | null, data: Object) => void) => void,
    readFileSync: (file: string) => Object
};
let readPlistAsync = promisify(plist.readFile) as (file: string) => Promise<Object>;

interface WorldV2 {
    creationDate: Date;
    saveDate: Date;
    worldName: string;
    worldSize: number;
    pvpDisabled: boolean;
    hostPort: string;
}

const root = `/Users/${process.env.USER}/Library/Containers/com.majicjungle.BlockheadsServer/Data/Library/Application Support/TheBlockheads/saves/`;
let getWorldInfo = (id: string) => readPlistAsync(`${root}${id}/worldv2`) as Promise<WorldV2>;


// Getting messages.
const maxRecordedLogs = 2000;
let sysLog: [number, string][] = [];
let logId = 0;
let tail = exec('tail -fF -n 0 /private/var/log/system.log');

tail.stdout.on('data', data => {
    if (Buffer.isBuffer(data)) data = data.toString('utf8');

    let lines = data.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        while (lines[i + 1] && lines[i + 1].startsWith('\t')) {
            line += '\n' + lines[++i].slice(1); // Remove tab
        }

        if (/^\w\w\w ( |\d)\d \d\d:\d\d:\d\d ([\w-]+) BlockheadsServer\[\d+]: /.test(line)) {
            sysLog.push([logId++, line]);
        }
    }
});

if (sysLog.length > maxRecordedLogs) sysLog = sysLog.slice(sysLog.length - maxRecordedLogs);


/**
 * Gets all worlds owned by the logged in user.
 */
export const getWorlds = async (): Promise<WorldInfo[]> => {
    let files = await readdirAsync(root);
    files = files.filter(worldFolder => !worldFolder.startsWith('.'));
    let worlds = await Promise.all(files.map(getWorldInfo));

    return worlds.map((world, i) => {
        return {
            name: world.worldName,
            id: files[i]
        };
    });
};

/** @inheritdoc */
export class Api implements WorldApi {
    constructor(private info: WorldInfo) {}

    /** @inheritdoc */
    getLists = async (): Promise<WorldLists> => {
        let lists = await Promise.all([
            readFileAsync(root + this.info.id + '/adminlist.txt', 'utf8'),
            readFileAsync(root + this.info.id + '/modlist.txt', 'utf8'),
            readFileAsync(root + this.info.id + '/whitelist.txt', 'utf8'),
            readFileAsync(root + this.info.id + '/blacklist.txt', 'utf8'),
        ]);

        // Remove duplicates and empty lines
        // First line of each file is explanatory, so remove that too
        let lists2 = lists.map(list => {
            return Array.from(new Set(list.split('\n').slice(1))).filter(Boolean);
        });

        return {
            adminlist: lists2[0],
            modlist: lists2[1],
            whitelist: lists2[2],
            blacklist: lists2[3],
        };
    }

    /** @inheritdoc */
    setLists = async (lists: WorldLists): Promise<void> => {
        let names = Object.keys(lists).reduce((carry, key: keyof WorldLists) => {
            lists[key].unshift('First line is ignored.');
            carry[key] = lists[key].join('\n');
            return carry;
        }, {} as {[k: string]: string});

        await Promise.all([
            writeFileAsync(root + this.info.id + '/adminlist.txt', names.adminlist),
            writeFileAsync(root + this.info.id + '/modlist.txt', names.modlist),
            writeFileAsync(root + this.info.id + '/whitelist.txt', names.whitelist),
            writeFileAsync(root + this.info.id + '/blacklist.txt', names.blacklist),
        ]);

        this.send('/load-lists');
    }

    /** @inheritdoc */
    getOverview = async (): Promise<WorldOverview> => {
        let [info, [online], whitelist] = await Promise.all([
            getWorldInfo(this.info.id),
            execAsync(`osascript -l JavaScript "${__dirname}/scripts/online.scpt" ${JSON.stringify(this.info.name)}`),
            readFileAsync(`${root}${this.info.id}/whitelist.txt`, 'utf8')
        ]);
        let onlinePlayers: string[] = JSON.parse(online);

        let size: WorldSizes;
        switch(info.worldSize) {
            case 512 * 1/16:
                size = '1/16x';
                break;
            case 512 * 1/4:
                size = '1/4x';
                break;
            case 512 * 1:
                size = '1x';
                break;
            case 512 * 4:
                size = '4x';
                break;
            case 512 * 16:
                size = '16x';
                break;
            default:
                size = '1x';
        }

        return {
            name: info.worldName,
            owner: 'SERVER',
            created: info.creationDate,
            last_activity: info.saveDate,
            credit_until: new Date('12/30/9999'),
            link: 'http://forums.theblockheads.net/', // Not ideal...
            pvp: !info.pvpDisabled,
            privacy: 'private',
            password: false, // Mac servers can't set passwords
            size,
            whitelist: whitelist.split('\n').length > 2,
            online: onlinePlayers,
        };
    }

    /** @inheritdoc */
    getLogs = async (): Promise<LogEntry[]> => {
        // Notes: /private/var/log contains system.log (text) and system.log.#.gz.
        // system.log.0.gz is newer than system.log.1.gz.
        // readdir returns the files in the order of 0..1..2
        let files = (await readdirAsync('/private/var/log/'))
            .filter(name => name.startsWith('system.log.'));

        let logs = await Promise.all(files.map(file => readFileAsync(`/private/var/log/${file}`)));

        // Reduce to a single string, oldest line on top
        let log = logs.reduceRight((carry, log) => {
            return carry + zlib.gunzipSync(log).toString('utf8');
        }, '');
        log += await readFileAsync('/private/var/log/system.log');

        return new LogParser().parse(log);
    }

    /** @inheritdoc */
    send = (message: string): void => {
        execAsync(`osascript -l JavaScript "${__dirname}/scripts/send.scpt" ${JSON.stringify(this.info.name)} ${JSON.stringify(message)}`)
            .catch(console.error);
    }

    /** @inheritdoc */
    getMessages(lastId: number = 0): Promise<{nextId: number, log: string[]}> {
        let nextId = sysLog.length ? sysLog[sysLog.length][0] : 0;

        let log = sysLog
            .filter(entry => entry[0] >= lastId)
            .map(entry => entry[1])
            .filter(message => message.startsWith(this.info.name))
            .map(message => message.slice(this.info.name.length));

        return Promise.resolve({ nextId, log });
    }

    /** @inheritdoc */
    start = (): void => {
        execAsync(`osascript -l JavaScript "${__dirname}/scripts/start.scpt" ${JSON.stringify(this.info.name)}`)
            .catch(console.error);
    }

    /** @inheritdoc */
    stop = (): void => {
        execAsync(`osascript -l JavaScript "${__dirname}/scripts/stop.scpt" ${JSON.stringify(this.info.name)}`)
            .catch(console.error);
    }

    /** @inheritdoc */
    restart = (): void => {
        execAsync(`osascript -l JavaScript "${__dirname}/scripts/restart.scpt" ${JSON.stringify(this.info.name)}`)
            .catch(console.error);
    }
}