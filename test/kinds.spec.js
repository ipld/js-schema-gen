'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')

const test = it

const s = o => JSON.stringify(o)

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
    assert.deepStrictEqual(node.encode(), valid)
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
    } catch (e) {
      assert.ok(true)
    }
    if (!threw) throw new Error(`${className} should have failed validation for ${s(invalid)}`)
  }
  _test('TestString', 100)
  _test('TestInt', 'string')
  _test('TestFloat', 100)
  _test('TestMap', [])
  _test('TestList', {})
  _test('TestNull', 'asdf')
  _test('TestBool', 'asdf')
  for (const key of Object.keys(classes)) {
    // test undefined
    _test(key)
  }

  done()
})

test('all kinds in struct', done => {
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
    bytes: Buffer.from('test'),
    map: { hello: 'world' },
    list: [null],
    null: null
  }
  const t = classes.Test.encoder(hw)
  assert.deepStrictEqual(t.encode(), hw)
  done()
})

test('advanced features', done => {
  const schema = `
    type Foo string
    type Bar [Foo]
    type Baz [{String:Foo}]
  `
  const classes = main(parse(schema))

  let _test = (className, value) => {
    const node = classes[className].encoder(value)
    assert.deepStrictEqual(node.encode(), value)
  }
  _test('Bar', ['asdf'])
  _test('Bar', [])
  _test('Baz', [{ adf: 'asdf' }])
  _test('Baz', [])

  _test = (className, invalid) => {
    let threw = true
    try {
      classes[className].encoder(invalid)
      threw = false
    } catch (e) {
      // noop
    }
    if (!threw) {
      throw new Error(`${className} should throw with ${s(invalid)}`)
    }
  }

  _test('Bar', [100])
  _test('Bar', { should: 'fail' })
  _test('Baz', [['asdf']])
  _test('Baz', [null])

  done()
})
