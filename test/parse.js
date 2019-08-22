'use strict'
const schema = require('../../js-ipld-schema')

module.exports = schemaString => schema.parse(schemaString)
