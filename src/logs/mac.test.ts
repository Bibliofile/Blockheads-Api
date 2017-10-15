import test from 'ava';

import { LogParser } from './mac';
import { LogEntry } from '../api';

const logs = `Oct  5 19:48:57 biblios-Mac loginwindow[92]: -[SFLListManager(ServiceReplyProtocol) notifyChanges:toListWithIdentifier:] Notified of item changes to list with identifier com.apple.LSSharedFileList.RecentApplications
Oct  5 19:49:03 biblios-Mac BlockheadsServer[20241]: loading world with size:32
Oct  5 19:49:03 biblios-Mac BlockheadsServer[20241]: using seed:1497754914
Oct  5 19:49:03 biblios-Mac BlockheadsServer[20241]: save delay:10
Oct  5 19:49:03 biblios-Mac BlockheadsServer[20241]: World load complete.
Oct  5 19:49:05 biblios-Mac WindowServer[155]: send_datagram_available_ping: pid 191 failed to act on a ping it dequeued before timing out.
Oct  5 19:49:07 biblios-Mac BlockheadsServer[20241]: DEMO - SERVER: Demo world message
Oct  5 19:49:14 biblios-Mac BlockheadsServer[20241]: DEMO - Player Connected BIBLIOPHILE¡ | 172.16.32.21 | b5c4a20c70767d697af545d82c321bdf
Oct  5 19:49:22 biblios-Mac kernel[0]: gfx: surf 493ee0f: SetIDMode: id=789184770 mode=0x24
Oct  5 19:49:22 biblios-Mac kernel[0]: gfx: surf 493ee0f: clientClose:
Oct  5 19:49:22 biblios-Mac kernel[0]: gfx: surf 493ee0f: SetIDMode: id=789184675 mode=0x24
Oct  5 19:49:22 biblios-Mac kernel[0]: gfx: surf 493ee0f: clientClose:
Oct  5 19:49:22 biblios-Mac BlockheadsServer[20241]: DEMO - SERVER: Message UNIQUE_STRING
Oct  5 19:49:23 biblios-Mac BlockheadsServer[20241]: DEMO - BIBLIOPHILE¡: Multi
	Line
	Message
Oct  5 19:49:27 biblios-Mac BlockheadsServer[20241]: DEMO - Client disconnected:b5c4a20c70767d697af545d82c321bdf
Oct  5 19:49:27 biblios-Mac BlockheadsServer[20241]: DEMO - Player Disconnected BIBLIOPHILE¡
Oct  5 19:49:28 biblios-Mac BlockheadsServer[20241]: Exiting World.
Oct  5 19:49:32 biblios-Mac BlockheadsServer[20241]: loading world with size:128
Oct  5 19:49:32 biblios-Mac BlockheadsServer[20241]: using seed:1489463736
Oct  5 19:49:32 biblios-Mac BlockheadsServer[20241]: save delay:10
Oct  5 19:49:32 biblios-Mac BlockheadsServer[20241]: World load complete.
Oct  5 19:49:33 biblios-Mac WindowServer[155]: send_datagram_available_ping: pid 191 failed to act on a ping it dequeued before timing out.
Oct  5 19:49:35 biblios-Mac BlockheadsServer[20241]: GLITCH TESTS - SERVER: Different world
Oct  5 19:49:37 biblios-Mac BlockheadsServer[20241]: Exiting World.`;

let parse = () => new LogParser('DEMO').parse(logs);

test(`Should skip non-blockheads messages`, t => {
    let parsed = parse();
    t.not(parsed[0].raw, logs.split('\n')[0]);
});

test(`Should not include messages without a name prefix`, t => {
    let parsed = parse();
    let hasWorldLoad = parsed.some(msg => msg.message == 'loading world with size:32');
    let hasSeed = parsed.some(msg => msg.message == 'using seed:1497754914');
    let hasExit = parsed.some(msg => msg.message == 'Exiting World.');

    t.true([hasWorldLoad, hasSeed, hasExit].every(result => !result));
});

test(`Should strip the world name from log entries`, t => {
    let parsed = parse();
    // Server chat message
    let { message } = parsed.find(({ message }) => message.includes('UNIQUE_STRING')) as LogEntry;
    t.false(message.startsWith('DEMO'));
});

test(`Should not strip the world name from leave messages`, t => {
    let parsed = parse();
    let shouldBeFound = parsed.find(({ message }) => message == 'DEMO - Player Disconnected BIBLIOPHILE¡');
    let shouldBeFound2 = parsed.find(({ message }) => message == 'DEMO - Client disconnected:b5c4a20c70767d697af545d82c321bdf');
    t.truthy(shouldBeFound);
    t.truthy(shouldBeFound2);
});

test(`Should not strip the world name from join messages`, t => {
    let parsed = parse();
    let { message } = parsed.find(({ message }) => message.includes('172.16.32.21')) as LogEntry;
    t.true(message.startsWith('DEMO'));
});

test(`Should only include messages from the correct world`, t => {
    let parsed = parse();
    let shouldNotBeFound = parsed.find(({ message }) => message.includes('Different world'));
    t.falsy(shouldNotBeFound);
});

function twoDigits(n: number): string {
    return n < 10 ? `0${n}` : n.toString();
}

function twoChars(n: number): string {
    return n < 10 ? ` ${n}` : n.toString();
}

test(`Should not return messages with a date in the future`, t => {
    // Create a log message from the future
    let d = new Date(Date.now() + 1000);
    let month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    let time = `${twoDigits(d.getHours())}:${twoDigits(d.getMinutes())}:${twoDigits(d.getSeconds())}`;
    let log = `${month} ${twoChars(d.getDate())} ${time} biblios-Mac BlockheadsServer[20241]: DEMO - SERVER: Demo world message`;

    let parsed = new LogParser('DEMO').parse(log);

    t.is(parsed.length, 1);
    t.true(parsed[0].timestamp < new Date());
});

test(`Should return an empty array for empty input`, t => {
    let parsed = new LogParser('DEMO').parse('');
    t.deepEqual(parsed, []);
});