import { readFile, writeFile, readdir } from 'fs'
import * as zlib from 'zlib'
import { LogParser } from './logs'
import { WorldInfo, WorldApi, WorldLists, WorldSizes, WorldOverview, LogEntry, WorldStatus } from 'blockheads-api-interface'
import { promisify } from 'util'
import { spawn, exec, ChildProcess } from 'child_process'

function readFileBuffer(path: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        readFile(path, (err, data) => err ? reject(err) : resolve(data))
    })
}

function readFileString(path: string): Promise<string> {
    return readFileBuffer(path).then(data => data.toString('utf8'))
}

function writeFileAsync(path: string, data: any): Promise<void> {
    return new Promise((resolve, reject) => {
        writeFile(path, data, err => err ? reject(err) : resolve())
    })
}

function readDirAsync(path: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
        readdir(path, (err, files) => err ? reject(err) : resolve(files))
    })
}

function spawnAsync(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        let stdout = ''
        const child = spawn(command, args)
        child.on('message', message => stdout += message.toString('utf8'))
        child.on('error', reject)
        child.on('exit', code => code ? reject(code) : resolve(stdout))
    })
}
function runScript(script: string, ...args: string[]): Promise<string> {
    return spawnAsync('osascript', [
        '-l', 'JavaScript',
        `${__dirname}/scripts/${script}`,
        ...args
    ])
}

const plist = require('simple-plist') as {
    readFile: (file: string, callback: (err: Error | null, data: Object) => void) => void,
    readFileSync: (file: string) => Object
}
const readPlistAsync = promisify(plist.readFile) as (path: string) => Object

interface WorldV2 {
    creationDate: Date
    saveDate: Date
    worldName: string
    worldWidthMacro: number
    pvpDisabled: boolean
    hostPort: string
}

const root = `/Users/${process.env.USER}/Library/Containers/com.majicjungle.BlockheadsServer/Data/Library/Application Support/TheBlockheads/saves/`
const getWorldInfo = (id: string) => readPlistAsync(`${root}${id}/worldv2`) as Promise<WorldV2>


// Getting messages.
const maxSavedLogs = 2000
let sysLog: [number, string][] = []
let tail: ChildProcess
let logId = 0

/**
 * Starts a tail process to watch for chat messages. If not called, the getMessages() method on the Api class will never return any messages.
 */
export function watchChat() {
    unwatchChat()

    tail = exec('tail -fF -n 0 /private/var/log/system.log')
    tail.stdout.on('data', data => {
        if (Buffer.isBuffer(data)) data = data.toString('utf8')

        const lines = data.split('\n')
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i]
            while (lines[i + 1] && lines[i + 1].startsWith('\t')) {
                line += '\n' + lines[++i].slice(1) // Remove tab
            }

            if (/^\w\w\w ( |\d)\d \d\d:\d\d:\d\d ([\w-]+) BlockheadsServer\[\d+]: /.test(line)) {
                sysLog.push([logId++, line.slice(line.indexOf(': ') + 2)])
            }
        }

        if (sysLog.length > maxSavedLogs) sysLog = sysLog.slice(sysLog.length - maxSavedLogs)
    })
}

/**
 * Stops watching chat.
 */
export function unwatchChat() {
    if (tail) tail.kill()
}


/**
 * Gets all worlds owned by the logged in user.
 */
export const getWorlds = async (): Promise<WorldInfo[]> => {
    let files = await readDirAsync(root)
    files = files.filter(worldFolder => !worldFolder.startsWith('.'))
    const worlds = await Promise.all(files.map(getWorldInfo))

    return worlds.map((world, i) => {
        return {
            name: world.worldName,
            id: files[i]
        }
    })
}

/** @inheritdoc */
export class Api implements WorldApi {
    constructor(private info: WorldInfo) { }

    /** @inheritdoc */
    get name() {
        return this.info.name
    }

    /** @inheritdoc */
    get id() {
        return this.info.id
    }

    /** @inheritdoc */
    getLists = async (): Promise<WorldLists> => {
        const lists = await Promise.all([
            readFileString(root + this.info.id + '/adminlist.txt'),
            readFileString(root + this.info.id + '/modlist.txt'),
            readFileString(root + this.info.id + '/whitelist.txt'),
            readFileString(root + this.info.id + '/blacklist.txt'),
        ])

        // Remove duplicates and empty lines
        // First line of each file is explanatory, so remove that too
        const lists2 = lists.map(list => {
            return Array.from(new Set(list.split('\n').slice(1))).filter(Boolean)
        })

        return {
            adminlist: lists2[0],
            modlist: lists2[1],
            whitelist: lists2[2],
            blacklist: lists2[3],
        }
    }

    /** @inheritdoc */
    setLists = async (lists: WorldLists): Promise<void> => {
        const names = Object.keys(lists).reduce((carry, key: keyof WorldLists) => {
            lists[key].unshift('First line is ignored.')
            carry[key] = lists[key].join('\n')
            return carry
        }, {} as { [k: string]: string })

        await Promise.all([
            writeFileAsync(root + this.info.id + '/adminlist.txt', names.adminlist),
            writeFileAsync(root + this.info.id + '/modlist.txt', names.modlist),
            writeFileAsync(root + this.info.id + '/whitelist.txt', names.whitelist),
            writeFileAsync(root + this.info.id + '/blacklist.txt', names.blacklist),
        ])

        this.send('/load-lists')
    }

    /** @inheritdoc */
    getOverview = async (): Promise<WorldOverview> => {
        const [info, online, whitelist] = await Promise.all([
            getWorldInfo(this.info.id),
            runScript('online.scpt', this.info.name),
            readFileString(`${root}${this.info.id}/whitelist.txt`)
        ])
        const onlinePlayers: string[] = JSON.parse(online)

        const size: WorldSizes = ({
            '32': '1/16x',
            '128': '1/4x',
            '512': '1x',
            '2048': '4x',
            '8192': '16x',
        } as { [k: string]: WorldSizes })[info.worldWidthMacro]

        return {
            name: info.worldName,
            owner: 'SERVER',
            created: info.creationDate,
            last_activity: info.saveDate,
            credit_until: new Date(253402128000000),
            link: 'http://forums.theblockheads.net/', // Not ideal...
            pvp: !info.pvpDisabled,
            privacy: 'private',
            password: false, // Mac servers can't set passwords
            size,
            whitelist: whitelist.split('\n').length > 2,
            online: onlinePlayers,
            status: 'online' // TODO: Fix this, needs a new JavaScript for Automation script
        }
    }

    /** @inheritdoc */
    getLogs = async (): Promise<LogEntry[]> => {
        // Notes: /private/var/log contains system.log (text) and system.log.#.gz.
        // system.log.0.gz is newer than system.log.1.gz.
        // readdir returns the files in the order of 0..1..2
        const files = (await readDirAsync('/private/var/log/'))
            .filter(name => name.startsWith('system.log.'))

        const logs = await Promise.all(files.map(file => readFileBuffer(`/private/var/log/${file}`)))

        // Reduce to a single string, oldest line on top
        let log = logs.reduceRight((carry, log) => {
            return carry + zlib.gunzipSync(log).toString('utf8')
        }, '')
        log += await readFileString('/private/var/log/system.log')

        return new LogParser(this.info.name).parse(log)
    }

    /** @inheritdoc */
    getStatus = (): Promise<WorldStatus> => {
        const status: WorldStatus = 'online'
        // Todo, needs a new script to interact with the world app
        return Promise.resolve(status)
    }

    /** @inheritdoc */
    send = (message: string): Promise<void> => {
        return runScript('send.scpt', this.info.name, message)
            .then(output => {
                if (output.includes('fail')) {
                    throw new Error('Unable to send message')
                }
            })
    }

    /** @inheritdoc */
    getMessages(lastId: number = 0): Promise<{ nextId: number, log: string[] }> {
        const nextId = sysLog.length ? sysLog[sysLog.length - 1][0] + 1 : 0

        const log = sysLog
            .filter(entry => entry[0] >= lastId)
            .map(entry => entry[1])
            .filter(message => message.startsWith(this.info.name))
            .map(message => {
                if (message.startsWith(`${this.info.name} - Player Connected`) ||
                    message.startsWith(`${this.info.name} - Player Disconnected`)
                ) {
                    return message
                }
                return message.slice(this.info.name.length + 3)
            })

        return Promise.resolve({ nextId, log })
    }

    /** @inheritdoc */
    start = (): Promise<void> => {
        return runScript('start.scpt', this.info.name)
            .then(() => void 0, console.error)
    }

    /** @inheritdoc */
    stop = (): Promise<void> => {
        return runScript('stop.scpt', this.info.name)
            .then(() => undefined, console.error)
    }

    /** @inheritdoc */
    restart = (): Promise<void> => {
        return runScript('restart.scpt', this.info.name)
            .then(() => undefined, console.error)
    }
}
