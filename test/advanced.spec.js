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
  let passed = false
  const TestAdvanced = { test: node => { passed = node.value } }
  const classes = main(parse(schema), { advanced: { TestAdvanced } })
  const hw = { name: 'hello world', i: 1 }
  const t = classes.TestMap.encoder(hw)
  t.test()
  strict(hw, passed)
  done()
})

test('advanced bytes', done => {
  const schema = `
  advanced DataLayout
  type Data bytes representation advanced DataLayout
  `
  let passed = false
  const DataLayout = { test: node => { passed = node.value } }
  const classes = main(parse(schema), { advanced: { DataLayout } })
  const hw = { name: 'hello world', i: 1 }
  const t = classes.Data.encoder(hw)
  t.test()
  strict(hw, passed)
  done()
})

test('schema in advanced', done => {
  const layoutSchema = `
  type TestLayout struct {
    name String
    i Int
  }`
  const schema = `
  advanced TestLayout
  type Test { String: &Any } representation advanced TestLayout
  `
  const testLayout = parse(layoutSchema)
  let passed = false
  const TestLayout = { test: node => { passed = node.value }, schema: testLayout }
  const classes = main(parse(schema), { advanced: { TestLayout } })
  const hw = { name: 'hello world', i: 1 }
  const t = classes.Test.encoder(hw)
  t.test()
  strict(hw, passed)

  try {
    classes.Test.encoder({ name: 'test', i: 'invalid' })
    throw new Error('Should have thrown')
  } catch (e) {
    strict(e.message, 'Validation error')
  }

  done()
})
