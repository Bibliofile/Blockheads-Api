# Blockheads-Api

This repository provides a standardized API for interacting with Blockheads Worlds.

## Documentation
Available [here](https://bibliofile.github.io/Blockheads-Api/)

## Usage

1. Install with `npm install --save blockheads-api` or, if you prefer yarn, `yarn add blockheads-api`
2. Include the applicable module.

```typescript
// For cloud worlds
// The login method is not necessary if the code will be used on the portal website with a user already logged in.
import { login, getWorlds, Api } from 'blockheads-api/cloud';
// Cloud worlds require a `fetch` implementation. If the code is not used in a browser, you must set the function to use.
import { setFetch } from 'blockheads-api/cloud';
setFetch(require('fetch-cookie/node-fetch')(require('node-fetch')));

// For mac worlds
import { getWorlds, Api } from 'blockheads-api/mac';
// If you want to watch chat for mac worlds, you must explicitly say so.
import { watchChat, unwatchChat } from 'blockheads-api/mac';
// Will prevent your script from exiting once processing is done.
watchChat();
// Stops the syslog listener for chat
unwatchCHat();
```

## Examples

List all worlds
```typescript
import { getWorlds } from 'blockheads-api/cloud';
getWorlds().then(worlds => {
    for (let {name, id} of worlds) {
        console.log(`${name} (${id})`);
    }
});
```

Send a message to the first world found
```typescript
import { getWorlds, Api } from 'blockheads-api/cloud';
getWorlds().then(worlds => {
    let api = new Api(worlds[0]);
    api.send('Hello world!');
});
```