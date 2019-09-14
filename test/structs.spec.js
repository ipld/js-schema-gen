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
  type Test struct {
    name String
    i Int
  }
  `
  const classes = main(parse(schema))
  const hw = { name: 'hello world', i: 1 }
  const t = new classes.Test(hw)

  strict(t.encode(), hw)

  strict(t.encode(), classes.Test.encoder(hw).encode())
  done()
})

test('nullable', done => {
  const schema = `
  type Test struct {
    name nullable String
  }
  `
  const classes = main(parse(schema))
  let t = new classes.Test({ name: 'hello world' })

  strict(t.encode(), { name: 'hello world' })
  t = new classes.Test({ name: null })
  strict(t.encode(), { name: null })

  strict(t.encode(), classes.Test.encoder({ name: null }).encode())
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
  const t = new classes.Test(hw)
  strict(t.encode(), hw)
  strict(t.encode(), classes.Test.encoder(hw).encode())
  done()
})

test('struct in struct', done => {
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

  const a = new classes.A(hw)
  strict(a.encode(), hw)
  strict(a.encode(), classes.A.encoder(hw).encode())

  strict(a.get('b/c/name'), 'hello')
  done()
})
