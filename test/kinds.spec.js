'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')
const tcompare = require('tcompare')
const bytes = require('bytesish')

const test = it

const strict = (x, y) => assert.ok(tcompare.strict(x, y).match)

test('all kinds', done => {
  const schema = `
  type TestString string
  type TestInt int
  type TestFloat float
  type TestBytes bytes
  type TestMap map
  type TestList list
  type TestBool bool
  `
  const classes = main(parse(schema))

  let _test = (className, valid) => {
    const node = classes[className].encoder(valid)
    assert.strictEqual(node.encode(), valid)
  }
  _test('TestString', 'string')
  _test('TestInt', 120)
  _test('TestFloat', 1.2)
  _test('TestBytes', Buffer.from('asdf'))
  _test('TestMap', {})
  _test('TestList', [])
  _test('TestBool', true)

  _test = (className, invalid) => {
    let threw = true 
    try {
      classes[className].encoder(invalid)
      threw = false
    } catch(e) {
      assert.ok(true)
    }
    if (!threw) throw new Error(`${className} should have failed validation for ${invalid}`)
  }
  _test('TestString', 100)
  _test('TestInt', 'string')
  _test('TestFloat', 100)
  _test('TestMap', [])
  _test('TestList', {})
  _test('TestNull', 'asdf')
  _test('TestBool', 'asdf')
  for (let key of Object.keys(classes)) {
    // test undefined
    _test(key)
  }

  done()
})

test('all kinds in struct', done => {
  throw new Error('STOP')
  const schema = `
  type Test struct {
    string String
    int Int
    float Float
    bytes Bytes
    map Map
    list List
    null Null
  }
  `
  const classes = main(parse(schema))
  const hw = {
    string: 'test',
    int: 1,
    float: 1.1,
    bytes: bytes.native('test'),
    map: { hello: 'world' },
    list: [null],
    null: null
  }
  const t = new classes.Test(hw)

  strict(t.encode(), hw)

  strict(t.encode(), classes.Test.encoder(hw).encode())
  done()
})
