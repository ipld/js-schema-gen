'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')
const tcompare = require('tcompare')

const test = it

const strict = (x, y) => assert.ok(tcompare.strict(x, y).match)

test('basic struct', done => {
  const schema = `
  advanced TestAdvanced
  type TestMap { String: &Any } representation advanced TestAdvanced
  `
  class TestAdvanced extends main.AdvancedMap {
  }
  const classes = main(parse(schema), { advanced: { TestAdvanced } })
  const hw = { name: 'hello world', i: 1 }
  const t = classes.TestMap.encoder(hw)
  assert.ok(t instanceof TestAdvanced)
  done()
})

