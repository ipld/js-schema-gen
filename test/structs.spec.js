'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')

const test = it

test('basic struct', done => {
  const schema = `
  type Test struct {
    name String
    i Int
  }
  `
  const classes = main(parse(schema))
  const hw = { name: 'hello world', i: 1 }
  const t = classes.Test.encoder(hw)

  assert.deepEqual(t.encode(), hw)
  done()
})

test('nullable', done => {
  const schema = `
  type Test struct {
    name nullable String
  }
  `
  const classes = main(parse(schema))
  let t = classes.Test.encoder({ name: 'hello world' })

  assert.deepEqual(t.encode(), { name: 'hello world' })
  t = classes.Test.encoder({ name: null })
  assert.deepEqual(t.encode(), { name: null })
  done()
})

test('properties w/o schema', done => {
  const schema = `
  type Test struct {
    name String
  }
  `
  const hw = { name: 'hello', test: 'world' }
  const classes = main(parse(schema))
  const t = classes.Test.encoder(hw)
  assert.deepEqual(t.encode(), hw)
  done()
})

test('struct in struct', async () => {
  const schema = `
  type A struct {
    b B
  }
  type B struct {
    c C
  }
  type C struct {
    name String
  }
  `
  const hw = { b: { c: { name: 'hello' } } }
  const classes = main(parse(schema))

  const a = classes.A.encoder(hw)
  assert.deepEqual(a.encode(), hw)
  let x = await a.get('b/c/name')
  assert.deepEqual(x, 'hello')

  x = await a.getNode('b/c/name')
  assert.equal(x.value, 'hello')
  assert.equal(x.constructor.name, 'String')

  x = await a.getNode('b')
  assert.equal(x.constructor.name, 'B')
})
