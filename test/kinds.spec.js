'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')
const tcompare = require('tcompare')
const bytes = require('bytesish')

const test = it

const strict = (x, y) => assert.ok(tcompare.strict(x, y).match)

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
