// Once Node 8 LTS is out, update this to use util.promisify()

import * as fs from 'fs';
import * as zlib from 'zlib';
import { spawn, spawnSync } from 'child_process';
import { LogParser } from './logs/mac';
import { WorldInfo, WorldApi, WorldLists, WorldSizes, WorldOverview, LogEntry } from './api';

const plist = require('simple-plist') as {
    readFile: (file: string, callback: (err: Error | null, data: Object) => void) => void,
    readFileSync: (file: string) => Object
};

interface WorldV2 {
    creationDate: Date;
    saveDate: Date;
    worldName: string;
    worldSize: number;
    pvpDisabled: boolean;
    hostPort: string;
}

const root = `/Users/${process.env['USER']}/Library/Containers/com.majicjungle.BlockheadsServer/Data/Library/Application Support/TheBlockheads/`;

function getFile(file: string): Promise<string> {
    return new Promise((resolve, reject) => {
        fs.readFile(file, 'utf8', (err, data) => {
            if (err) reject(err);
            resolve(data);
        });
    });
}
function saveFile(file: string, data: any): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        fs.writeFile(file, data, 'utf8', err => {
            if (err) reject(err);
            resolve();
        });
    });
}

function getWorldInfo(id: string): Promise<WorldV2> {
    return new Promise<WorldV2>((resolve, reject) => {
        plist.readFile(root + id + '/worldv2', (err, data) => {
            if (err) reject(err);
            resolve(data as WorldV2);
        });
    });
}

/**
 * Gets all worlds owned by the logged in user.
 */
export function getWorlds(): Promise<WorldInfo[]> {
    return new Promise<WorldInfo[]>((resolve, reject) => {
        fs.readdir(root, async (err, files) => {
            if (err) {
                return reject(err);
            }

            let files2 = await Promise.all(files.map(getWorldInfo));

            let worlds: WorldInfo[] = [];
            for (let i = 0; i < files2.length; i++) {
                worlds.push({name: files2[i].worldName, id: files[i]});
            }
            resolve(worlds);
        });
    });
}

/** @inheritdoc */
export class Api implements WorldApi {
    constructor(private info: WorldInfo) {}

    /** @inheritdoc */
    getLists = async (): Promise<WorldLists> => {
        let lists = await Promise.all([
            getFile(root + this.info.id + '/adminlist.txt'),
            getFile(root + this.info.id + '/modlist.txt'),
            getFile(root + this.info.id + '/whitelist.txt'),
            getFile(root + this.info.id + '/blacklist.txt'),
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
    setLists = (lists: WorldLists): Promise<void> => {
        let names = Object.keys(lists).reduce((carry, key: keyof WorldLists) => {
            lists[key].unshift('First line is ignored.');
            carry[key] = lists[key].join('\n');
            return carry;
        }, {} as {[k: string]: string});

        return Promise.all([
            saveFile(root + this.info.id + '/adminlist.txt', names.adminlist),
            saveFile(root + this.info.id + '/modlist.txt', names.modlist),
            saveFile(root + this.info.id + '/whitelist.txt', names.whitelist),
            saveFile(root + this.info.id + '/blacklist.txt', names.blacklist),
        ]).then(() => this.send('/load-lists'));
    }

    /** @inheritdoc */
    getOverview = async (): Promise<WorldOverview> => {
        let info = await getWorldInfo(this.info.id);
        let online: string[] = JSON.parse(spawnSync('osascript', [
            '-l', 'JavaScript',
            __dirname + '/scripts/online.scpt',
        ]).stdout);

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
            whitelist: (await getFile(root + this.info.id + '/whitelist.txt')).split('\n').length > 2,
            online, // TODO: Get online players from app
        };
    }

    /** @inheritdoc */
    getLogs(): Promise<LogEntry[]> {
        // Notes: /private/var/log contains system.log (text) and system.log.#.gz.
        // system.log.0.gz is newer than system.log.1.gz.
        // readdir returns the files in the order of 0..1..2
        let files = fs.readdirSync('/private/var/log/')
            .filter(name => name.startsWith('system.log.'));

        // Reduce to a single string, oldest line on top
        let log = files.reduceRight((carry, file) => {
            let compressed = fs.readFileSync(`/private/var/log/${file}`);
            return carry + zlib.gunzipSync(compressed).toString('utf8');
        }, '');
        log += fs.readFileSync('/private/var/log/system.log');


        return Promise.resolve(new LogParser().parse(log));
        // Mac servers do not save logs.
        // TODO: Pull logs from /private/var/log/system.log* to get the past week of logs.
        // Ref: http://forums.theblockheads.net/t/mac-server-app-saving-server-logs/51210
    }

    /** @inheritdoc */
    send = (message: string): void => {
        spawn('osascript', [
            '-l', 'JavaScript',
            __dirname + '/scripts/send.scpt',
            this.info.name,
            message
        ]);
    }

    /** @inheritdoc */
    getMessages(lastId: number = 0): Promise<{nextId: number, log: string[]}> {
        console.warn('Api#getMessages() has yet to be implemented.');
        return Promise.resolve({nextId: lastId, log: []}); //TODO
    }

    /** @inheritdoc */
    start = (): void => {
        spawn('osascript', [
            '-l', 'JavaScript',
            __dirname + '/scripts/start.scpt',
            this.info.name,
        ]);
    }

    /** @inheritdoc */
    stop = (): void => {
        spawn('osascript', [
            '-l', 'JavaScript',
            __dirname + '/scripts/stop.scpt',
            this.info.name,
        ]);
    }

    /** @inheritdoc */
    restart = (): void => {
        spawn('osascript', [
            '-l', 'JavaScript',
            __dirname + '/scripts/restart.scpt',
            this.info.name,
        ]);
    }
}