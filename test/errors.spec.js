'use strict'
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')

const test = it

const parseError = (schema, errorMessage, opts) => {
  try {
    main(schema, opts)
  } catch (e) {
    if (e.message === errorMessage) return true
    throw e
  }
  throw new Error('should have thrown')
}

test('empty schema parse should work', done => {
  main({})
  done()
})

test('cannot overwrite existing type', done => {
  const schema = `
  type String string
  `
  parseError(parse(schema), 'Name conflict, cannot define String twice.')
  done()
})

test('cannot use unknown kind', done => {
  const schema = `
  type TestString string
  `
  const parsed = parse(schema)
  parsed.types.TestString.kind = 'missing'
  parseError(parsed, 'Unknown kind missing')
  done()
})

test('cannot create node from invalid nodes', done => {
  const schema = `
  type TestString string
  type TestInt int
  `
  const classes = main(parse(schema))
  try {
    classes.TestString.create(classes.TestInt.encoder(1))
    throw new Error('should have thrown')
  } catch (e) {
    if (e.message !== 'Cannot re-type node') throw e
  }
  const n = classes.TestString.encoder('hello')
  classes.TestString.create(n)
  done()
})

test('cannot create node from invalid nodes from advanded layout', done => {
  const schema = `
  type TestInt int
  type DataLayout map
  advanced DataLayout
  type Data bytes representation advanced DataLayout
  `
  const classes = main(parse(schema), { advanced: { DataLayout: {} } })
  try {
    classes.Data.create(classes.TestInt.encoder(1))
    throw new Error('should have thrown')
  } catch (e) {
    if (e.message !== 'Cannot re-type node') throw e
  }
  const n = classes.Data.encoder(Buffer.from('asdf'))
  classes.Data.create(n)
  done()
})

test('must provide advanced layout definition', done => {
  const schema = `
  type Data bytes representation advanced DataLayout
  `
  parseError(parse(schema), 'Missing advanced layout DataLayout')
  done()
})

test('must provide advanced layout schema', done => {
  const schema = `
  advanced DataLayout
  type Data bytes representation advanced DataLayout
  `
  parseError(parse(schema), 'Missing advanced layout schema DataLayout')
  done()
})

test('must provide advanced layout implementation', done => {
  const schema = `
  type DataLayout map
  advanced DataLayout
  type Data bytes representation advanced DataLayout
  `
  parseError(parse(schema), 'Missing implementation of advanced layout DataLayout')
  parseError(parse(schema), 'Missing implementation of advanced layout DataLayout')
  done()
})

test('struct representation not map', done => {
  const schema = `
  type TestStruct struct {} representation tuple
  `
  const classes = main(parse(schema))
  try {
    classes.TestStruct.encoder({}).encode()
    throw new Error('should have thrown')
  } catch (e) {
    if (e.message !== 'Not implemented') throw e
  }
  done()
})
