'use strict'
const assert = require('assert')
const { it } = require('mocha')
const main = require('../')
const parse = require('./parse')
const bytes = require('bytesish')

const test = it

test('read bytes', async () => {
  const schema = `
  type TestBytes bytes
  `
  const classes = main(parse(schema))
  const b = classes.TestBytes.encoder(Buffer.from('asdf'))

  let chunk
  for await (chunk of b.read()) {
    // noop
  }

  assert.strictEqual(bytes.toString(chunk), 'asdf')
})
