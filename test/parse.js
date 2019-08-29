'use strict'
const schema = require('ipld-schema')

module.exports = schemaString => schema.parse(schemaString)
