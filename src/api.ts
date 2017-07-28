/**
 * An entry in the world log, parsed into a standard format.
 */
export interface LogEntry {
    /**
     * The raw, unparsed, string.
     */
    raw: string;
    /**
     * The time the message was logged.
     */
    timestamp: Date;
    /**
     * The message which was logged.
     */
    message: string;
}

/**
 * Information about a world
 */
export interface WorldInfo {
    /**
     * The name of the world
     */
    name: string;
    /**
     * The world's ID. For cloud worlds, this will be a numeric string. For mac worlds this will be the folder which the world is stored under.
     */
    id: string;
}

/**
 * The lists used by the server to check permissions.
 */
export interface WorldLists {
    /**
     * Player names on the adminlist.
     */
    adminlist: string[];
    /**
     * Player names on the modlist.
     */
    modlist: string[];
    /**
     * Player names on the whitelist.
     */
    whitelist: string[];
    /**
     * Player names on the blacklist. Will be stripped of device IDs.
     */
    blacklist: string[];
}

/**
 * The possible sizes that a world can be.
 */
export type WorldSizes = '1/16x' | '1/4x' | '1x' | '4x' | '16x';

/**
 * The possible privacy settings for a world.
 */
export type WorldPrivacy = 'public' | 'searchable' | 'private';

/**
 * General information about a world.
 */
export interface WorldOverview {
    /**
     * The name of the world.
     */
    name: string;

    /**
     * The owner's name.
     */
    owner: string;
    /**
     * When the world was created.
     */
    created: Date;
    /**
     * When the world was last joined.
     */
    last_activity: Date;
    /**
     * The time that the server's credit will expire. Set to year 9999 for mac servers.
     */
    credit_until: Date;
    /**
     * The link to join the server.
     */
    link: string;

    /**
     * Whether or not PVP is enabled.
     */
    pvp: boolean;
    /**
     * The privacy of the world. Always private for mac servers.
     */
    privacy: WorldPrivacy;
    /**
     * Whether or not a password is set for the world. Always false for mac servers.
     */
    password: boolean;
    /**
     * The size of the world.
     */
    size: WorldSizes;
    /**
     * Whether or not the server is whitelisted.
     */
    whitelist: boolean;

    /**
     * The names of players currently online.
     */
    online: string[];
}

/**
 * The API used to interact with the portal or mac server.
 */
export interface WorldApi {
    /**
     * Gets the current server lists.
     */
    getLists(): Promise<WorldLists>;
    /**
     * Sets the world's lists
     */
    setLists(lists: WorldLists): Promise<void>;

    /**
     * Gets the current world overview and online players
     */
    getOverview(): Promise<WorldOverview>;
    /**
     * Gets the server logs in a parsed format.
     */
    getLogs(): Promise<LogEntry[]>;
    /**
     * Sends a message to the server.
     */
    send(message: string): void;
    /**
     * Gets messages since the last timestamp
     */
    getMessages(lastId: number): Promise<{nextId: number, log: string[]}>;

    /**
     * Starts a world if it is not already running
     */
    start(): void;
    /**
     * Stops a world if it is running
     */
    stop(): void;
    /**
     * Restarts a world, has no effect if the world is offline.
     */
    restart(): void;
}