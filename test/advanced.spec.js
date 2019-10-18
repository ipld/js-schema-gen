'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')
const tcompare = require('tcompare')

const test = it

const strict = (x, y) => assert.ok(tcompare.strict(x, y).match)

test('basic advanced layout', done => {
  const schema = `
  type TestAdvanced map
  advanced TestAdvanced
  type TestMap { String: &Any } representation advanced TestAdvanced
  `
  let passed = false
  const TestAdvanced = { test: node => { passed = node.value } }
  const classes = main(parse(schema), { advanced: { TestAdvanced } })
  const hw = { name: 'hello world', i: 1 }
  const t = classes.TestMap.encoder(hw)
  t.test()
  strict(hw, passed.encode())
  done()
})

test('advanced bytes (no read)', done => {
  const schema = `
  type DataLayout map
  advanced DataLayout
  type Data bytes representation advanced DataLayout
  `
  let passed = false
  const DataLayout = { test: node => { passed = node.value } }
  const classes = main(parse(schema), { advanced: { DataLayout } })
  const hw = { name: 'hello world', i: 1 }
  const t = classes.Data.encoder(hw)
  t.test()
  strict(hw, passed.encode())
  done()
})

test('advanced types passed into another schema', async () => {
  const schema = `
  type DataLayout map
  advanced DataLayout
  type Data bytes representation advanced DataLayout
  `
  let passed = false
  const DataLayout = { test: node => { passed = node.value } }
  const types = main(parse(schema), { advanced: { DataLayout } })
  const classes = main(parse('type Test {String:Data}'), { types })
  const hw = { test: { name: 'hello world', i: 1 } }
  const t = classes.Test.encoder(hw)
  const node = await t.getNode('test')
  node.test()
  strict(hw.test, passed.encode())
})
