'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')
const tcompare = require('tcompare')
const Block = require('@ipld/block')

const test = it

const strict = (x, y) => assert.ok(tcompare.strict(x, y).match)

const storage = () => {
  const db = {}
  const get = cid => db[cid.toString()]
  const put = async b => {
    db[(await b.cid()).toString()] = b
  }
  return { get, put, db, getBlock: get }
}

test('basic struct', async () => {
  const schema = `
  type Test struct {
    b &Bytes
  }
  `
  const classes = main(parse(schema))
  const b = Block.encoder(Buffer.from('asdf'), 'raw')
  let origin = { b: await b.cid() }
  const t = new classes.Test(origin)

  strict(t.encode(), origin)

  strict(t.encode(), classes.Test.encoder(origin).encode())
})

test('struct in struct', async () => {
  const schema = `
  type A struct {
    b &B
  }
  type B struct {
    c &C
  }
  type C struct {
    name String
  }
  `
  const { getBlock, put } = storage()
  const classes = main(parse(schema), { getBlock })

  const c = (new classes.C({name: 'hello'})).block()
  const b = (new classes.B({c: await c.cid()})).block()
  await Promise.all([put(c), put(b)])

  const a = new classes.A({b: await b.cid()})

  strict(await a.get('b/c/name'), 'hello')
})
