import * as tape from 'tape'

import { LogParser } from './logs'

const test = (name: string, test: (t: tape.Test) => void | Promise<void>) => {
  tape(`Cloud - logs - ${name}`, t => {
    const result = test(t)
    if (result instanceof Promise) {
      result.then(() => t.end()).catch(err => t.end(err))
    } else {
      t.end()
    }
  })
}

test(`Array mutation`, t => {
  const parser = new LogParser()
  const messages = ['2016-11-27 19:28:49.280 blockheads_server161p1[11900] SERVER: Ah']
  const clone = messages.slice(0)

  parser.parse(messages)

  t.deepEqual(messages, clone)
})


test(`Chat messages`, t => {
  const parser = new LogParser()
  const messages = ['2016-11-27 19:28:49.280 blockheads_server161p1[11900] SERVER: Ah']

  const result = parser.parse(messages)

  t.deepEqual(result, [{
    raw: messages[0],
    timestamp: new Date('2016-11-27T19:28:49.280Z'),
    message: 'SERVER: Ah'
  }])
})

test(`Join messages`, t => {
  const message = '2015-11-11 04:10:04.694 blockheads_server161b3p1[24373] WORLD - Player Connected PERSON | 0.0.0.0 | 8b0a44048f58988b486bdd0d245b22a8'

  const result = new LogParser().parse([message])

  t.deepEqual(result, [{
    raw: message,
    timestamp: new Date('2015-11-11T04:10:04.694Z'),
    message: 'WORLD - Player Connected PERSON | 0.0.0.0 | 8b0a44048f58988b486bdd0d245b22a8'
  }])
})

test('Multiline messages', t => {
  const message = `2016-07-18 18:28:23.603 blockheads_server161p1[12844] SERVER:
/HELP - display this message.
/PLAYERS - list currently active players.`

  const result = new LogParser().parse(message.split('\n'))

  t.deepEqual(result, [{
    raw: message,
    timestamp: new Date('2016-07-18T18:28:23.603Z'),
    message: `SERVER:
/HELP - display this message.
/PLAYERS - list currently active players.`
  }])
})

test('Multiple messages', t => {
  const messages = [
    `2017-01-26 03:40:36.013 blockheads_server161p1[22438] WORLD - Player Connected BIBLIOPHILE | 0.0.0.0 | 99d616273e72ffd7e2ec5e19a78f13af`,
    `2017-01-26 03:44:55.607 blockheads_server161p1[22438] SERVER: Hi`,
    `2017-01-26 04:29:52.643 blockheads_server161p1[22438] WORLD - Client disconnected:99d616273e72ffd7e2ec5e19a78f13af`,
    `2017-01-26 04:29:52.643 blockheads_server161p1[22438] WORLD - Player Disconnected BIBLIOPHILE`
  ]

  const parsed = new LogParser().parse(messages)

  t.deepEqual(parsed, [
    { raw: messages[0], timestamp: new Date(messages[0].substr(0, 23).replace(' ', 'T') + 'Z'), message: messages[0].substr(54) },
    { raw: messages[1], timestamp: new Date(messages[1].substr(0, 23).replace(' ', 'T') + 'Z'), message: messages[1].substr(54) },
    { raw: messages[2], timestamp: new Date(messages[2].substr(0, 23).replace(' ', 'T') + 'Z'), message: messages[2].substr(54) },
    { raw: messages[3], timestamp: new Date(messages[3].substr(0, 23).replace(' ', 'T') + 'Z'), message: messages[3].substr(54) },
  ])
})

test('Invalid first message', t => {
  const messages = [
    `Invalid message`,
    `2017-01-26 03:40:36.013 blockheads_server161p1[22438] WORLD - Player Connected BIBLIOPHILE | 0.0.0.0 | 99d616273e72ffd7e2ec5e19a78f13af`,
  ]

  const parsed = new LogParser().parse(messages)

  t.deepEqual(parsed, [
    { raw: messages[1], timestamp: new Date(messages[1].substr(0, 23).replace(' ', 'T') + 'Z'), message: messages[1].substr(54) },
  ])
})
