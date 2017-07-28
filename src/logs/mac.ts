import { LogEntry } from '../api';

export class LogParser {
    private validLineStart = /^[A-Z][a-z]{2} ( |\d)\d \d\d:\d\d:\d\d ([\w\-]+) BlockheadsServer/;

    constructor() {}

    parse(log: string): LogEntry[] {
        let result: LogEntry[] = [];


        // Note: Yes, this is a big complicated, and could be more nicely expressed by splitting it up.
        // however, since logs could potentially be very large, to be safe it's better to have
        // an O(N) solution here than to have an easy to read solution.
        let now = new Date();
        let currentYear = new Date().getFullYear();

        let temp: LogEntry | undefined;
        for (let line of log.split('\n')) {
            if (temp) {
                if (line.startsWith('\t')) {
                    //Remember to remove the leading tab
                    temp.raw += '\n' + line.substr(1);
                    temp.message += '\n' + line.substr(1);
                    // We know this won't pass the valid line test, so skip it
                    continue;
                } else {
                    // Not continued, add to the results and reset
                    // We might still have a valid new message though.
                    result.push(temp);
                    temp = undefined;
                }
            }

            if (this.validLineStart.test(line)) {
                // When a new year occurs, some logs may be from last year.
                // To handle this, assume all logs are from this year, and remove one year
                // from the date if the log timestamp is in the future.
                let time = new Date(line.substr(0, 15).replace(' ', ` ${currentYear}`));
                if (now < time) time.setFullYear(currentYear - 1);

                temp = {
                    raw: line,
                    timestamp: new Date(),
                    message: line.substr(line.indexOf(']') + 3)
                };
            }
        }

        return result;
    }
}