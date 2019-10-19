'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')
const tcompare = require('tcompare')
const Block = require('@ipld/block')
const CID = require('cids')

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

test('serializer', done => {
  const cid = new CID('QmWATWQ7fVPP2EFGu71UkfnqhYXDYH566qy47CnJDgvs8u')
  const serialize = require('../src/types').serializeObject
  const cid2 = serialize(cid)
  assert.strictEqual(cid.toString(), cid2.toString())
  assert.deepStrictEqual([], serialize([]))
  done()
})

test('basic struct', async () => {
  const schema = `
  type Test struct {
    b &Bytes
  }
  `
  const classes = main(parse(schema))
  const b = Block.encoder(Buffer.from('asdf'), 'raw')
  const origin = { b: await b.cid() }
  const t = classes.Test.encoder(origin)

  strict(t.encode(), origin)

  strict(t.encode(), classes.Test.encoder(origin).encode())
})

test('link in map', async () => {
  const schema = `
  type TestInt int
  type TestMap {String:&TestInt}
  `
  const { getBlock, put } = storage()
  const classes = main(parse(schema), { getBlock })
  const intBlock = Block.encoder(12, 'dag-cbor')
  await put(intBlock)
  const testMap = classes.TestMap.encoder({ test: await intBlock.cid() })
  const node = await testMap.getNode('test')
  strict(node.constructor.name, 'TestInt')
  strict(node.encode(), 12)
})

test('link resolve', async () => {
  const schema = `
  type L &Int
  `
  const { getBlock, put } = storage()
  const classes = main(parse(schema), { getBlock })
  const intBlock = Block.encoder(12, 'dag-cbor')
  await put(intBlock)
  const l = classes.L.encoder(await intBlock.cid())
  assert.strictEqual(12, await l.get())
})

test('link without expected type', async () => {
  const schema = `
  type Test struct {
    b Link
  }
  `
  const { getBlock, put } = storage()
  const classes = main(parse(schema), { getBlock })

  const b = Block.encoder(Buffer.from('asdf'), 'raw')
  const origin = { b: await b.cid() }
  const t = classes.Test.encoder(origin)

  await Promise.all([put(b), put(t.block())])

  strict(t.encode(), origin)

  strict(t.encode(), classes.Test.encoder(origin).encode())
  strict('asdf', (await t.get('b')).toString())
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

  const c = (classes.C.encoder({ name: 'hello' })).block()
  const b = (classes.B.encoder({ c: await c.cid() })).block()
  await Promise.all([put(c), put(b)])

  const a = classes.A.encoder({ b: await b.cid() })

  strict(await a.get('b/c/name'), 'hello')
})

test('must base getBlock for multiblock get', async () => {
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
  const classes = main(parse(schema), { })
  const c = (classes.C.encoder({ name: 'hello' })).block()
  const b = (classes.B.encoder({ c: await c.cid() })).block()
  const a = classes.A.encoder({ b: await b.cid() })

  try {
    await a.get('b/c/name')
    throw new Error('should have thrown')
  } catch (e) {
    if (e.message !== 'Cannot perform get() without getBlock method') throw e
  }
})
