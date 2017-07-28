const fs = require('fs');
const path = require('path');

// Package root
let root = path.resolve(__dirname, '..');

// Move everything into the current directory so require('blockheads-api/cloud') will work correctly.
fs.readdirSync(`${root}/src`)
    .filter(file => file != 'install.js')
    .forEach(file => {
        fs.renameSync(`${root}/src/${file}`, `${root}/${file}`);
    })