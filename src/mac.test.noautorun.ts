/**
 * Note: This file is not to be run automatically by a CI system as it depends
 * on the mac server setup on my PC -- Bibliofile
 */


import asyncTest from 'ava'

const test = asyncTest.serial

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

import { Api, watchChat, unwatchChat } from './mac'
import { WorldInfo } from './api'

const worldInfo: WorldInfo = {
    name: 'DEMO',
    id: '25f9fdcd6b17482ca5a1a0ff99f77653'
}

test('Should send messages', async t => {
    let api = new Api(worldInfo)

    api.send('Send me!')
    t.pass()
})

test('Should return a valid overview', async t => {
    let api = new Api(worldInfo)

    let overview = await api.getOverview()
    delete overview.last_activity

    t.deepEqual(overview, {
        name: 'DEMO',
        owner: 'SERVER',
        created: new Date('Jun 17, 2017, 9:02:03.600 PM'),
        credit_until: new Date(253402128000000),
        link: 'http://forums.theblockheads.net/',
        pvp: true,
        privacy: 'private',
        password: false,
        size: '1/16x',
        whitelist: false,
        online: ['BIBLIOCAM'],
        status: 'online'
    })
})

test('Should be able to restart the server', async t => {
    let api = new Api(worldInfo)
    await api.restart()
    t.pass()
})

test('Should be able to stop the server', async t => {
    let api = new Api(worldInfo)
    await api.stop()
    t.pass()
})

test('Should be able to start the server', async t => {
    let api = new Api(worldInfo)
    await api.start()
    t.pass()
})

test('Should get messages', async t => {
    let api = new Api(worldInfo)
    watchChat()
    await delay(10 * 1000)
    let messages = await api.getMessages()
    delete messages.nextId // Indeterminant
    t.deepEqual(messages, {
        log: [
            'Player Connected BIBLIOCAM | 172.16.32.5 | 441211d2ce999c603732064939ad0364',
            'BIBLIOCAM: Hi'
        ]
    })
    unwatchChat()
})