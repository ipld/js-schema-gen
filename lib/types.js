const CID = require('cids')
const bytes = require('bytesish')
const validate = require('./validate')
const resolve = require('./resolve')
const toNative = require('./node-to-native')

const str = o => JSON.stringify(o)

class SchemaKindError extends Error {
  constructor (node) {
    super(`${str(node.value)} is not a valid ${node.constructor.name}`)
  }
}

const create = opts => {
  const classes = {}

  classes.Node = class Node {
    constructor (value, schema) {
      if (value && value.schema) throw new Error('here')
      if (typeof schema === 'function') throw new Error('func')
      // TODO: replace Buffer w/ bytes.valid() 
      if (value && typeof value === 'object' && !Buffer.isBuffer(value)) {
        if (Array.isArray(value)) value = value.slice()
        else value = Object.assign({}, value)
      } 
      this.value = value
      this.schema = schema
      this.opts = opts
    }
    async getNode (path) {
      path = path.split('/').filter(x => x)
      let node = this
      while (path.length) {
        const prop = path.shift()
        node = node.resolve(prop)
        if (node.isLink) {
          if (!this.opts.getBlock) throw new Error('Cannot perform get() without getBlock method')
          const block = this.opts.getBlock(node.value)
          const expected = node.schema.type.expectedType
          const node = _create(classes[expected], block.decode(), this.schema)
          return node.get(result.remaining.join('/'))
        }
      }
      return node
    }
    async get (path) {
      let node = await this.getNode(path)
      return toNative(node)
    }
    get isNode () {
      return true
    }
    validate () {
      if (this.schema.fieldSchema &&
          this.schema.fieldSchema.nullable &&
          this.value === null) return true
      return this._validate()
    }
  }

  classes.Kind = class Kind extends classes.Node {
    get isKind () {
      return true
    }
    encode () {
      // TODO: alias properties from public to encoded names
      return this.value
    }
    resolve (prop) {
      if (prop) throw new Error('Cannot lookup sub-properties on kind')
    }
  }
  classes.Int = class Int extends classes.Kind {
    _validate () {
      if (!Number.isInteger(this.value)) throw new SchemaKindError(this)
    }
  }
  classes.Float = class Float extends classes.Kind {
    _validate () {
      if (typeof this.value !== 'number' || Number.isInteger(this.value)) {
        throw new SchemaKindError(this)
      }
    }
  }
  classes.String = class String extends classes.Kind {
    _validate () {
      if (typeof this.value !== 'string') throw new SchemaKindError(this)
    }
  }
  classes.Null = class Null extends classes.Kind {
    _validate () {
      if (this.value !== null) throw new SchemaKindError(this)
    }
  }
  classes.Bool = class Bool extends classes.Kind {
    _validate () {
      if (typeof this.value !== 'boolean') throw new SchemaKindError(this)
    }
  }
  classes.Bytes = class Bytes extends classes.Kind {
    _validate () {
      bytes.native(this.value)
    }
  }

  const mapEncode = node => {
    const ret = {}
    for (const [key, value] of Object.entries(node.value)) {
      if (value.isNode) ret[key] = value.encode()
      else ret[key] = value
    }
    // TODO: handle aliasing public to alias fields
    return ret
  }


  classes.Map = class Map extends classes.Kind {
    constructor (...args) {
      super(...args)
      for (let [key, value] of Object.entries(this.value)) {
        if (!this.schema || !this.schema.valueType) {
          this.value[key] = toNode(value)
        } else if (typeof this.schema.valueType === 'string') {
          this.value[key] = classes[this.schema.valueType].create(value)
        } else {
          const valueType = this.schema.valueType
          if (!valueType.kind === 'map') throw new Error('Not Implemented')
          this.value[key] = new classes.Map(value, valueType)
        }
      }
    }
    resolve (key) {
      return this.value[key]
    }
    __validate () {
      if (this.schema.valueType) {
        let typeing = this.schema.valueType
        for (let [key, value] of Object.entries(this.value)) {
          if (typeof typeing === 'string') {
            if (value.constructor.name !== typeing) {
              throw new Error(`Field value for "${key}" does not match required ${typeName} type`)
            }
          } else {
            if (typeof typeing !== 'object') throw new Error('Bad typeing info')
            if (typeing.keyType !== 'String') throw new Error('Unsupported')
            if (typeing.kind !== 'map') throw new Error('Not implemented') 
            // we don't need more validation because this will already be cast to a 
            // map that validates the values properly
          }
          if (value.isNode) value.validate()
        }
      }
    }
    _validate () {
      if (typeof this.value !== 'object' ||
          Array.isArray(this.value) ||
          this.value === null
      ) {
        throw new SchemaKindError(this)
      }
      this.__validate()
    }
    encode () {
      return mapEncode(this)
    }
  }
  classes.List = class List extends classes.Map {
    _validate () {
      if (!Array.isArray(this.value)) throw new SchemaKindError(this)
      this.__validate()
    }
    encode () {
      return this.value.map(value => value.isNode ? value.encode() : value)
    }
  }
  classes.Link = class Link extends classes.Kind {
    _validate () {
      if (!CID.isCID(value)) throw new SchemaKindError(this)
    }
  }

  /* Class.create() */
  for (let [className, Class] of Object.entries(classes)) {
    if (className !== 'Node' && className !== 'Kind') {
      const kind = className.toLowerCase()
      const schema = { kind }
      Class.create = (value, fieldSchema) => {
        if (value && value.isNode) {
          if (!value instanceof Class) throw new Error('Cannot re-type node')
          return value
        }
        let _schema
        if (fieldSchema) _schema = Object.assign(schema, {fieldSchema})
        else _schema = schema
        return new Class(value, _schema)
      }
      Class.decoded = Class.encoder = value => {
        const node = Class.create(value)
        node.validate()
        return node
      }
    }
  }

  const toNode = value => {
    if (value === null) return classes.Null.create(value)
    if (Buffer.isBuffer(value)) return classes.Bytes.create(value)
    if (typeof value === 'string') return classes.String.create(value)
    if (typeof value === 'boolean') return classes.Boolean.create(value)
    if (typeof value === 'number') {
      if (Number.isInteger(value)) return classes.Int.create(value)
      else return classes.Float.create(value)
    }
    if (typeof value === 'object') {
      if (Array.isArray(value)) return classes.List.create(value)
      else return classes.Map.create(value)
    }
    throw new Error(`Cannot convert ${value} to kind`)
  }

  classes.Struct = class Struct extends classes.Node {
    constructor (...args) {
      super(...args)
      if (!this.schema) throw new Error('Missing schema for struct')
      if (!this.schema) this.schema = {fields: {}}
      for (const [field, value] of Object.entries(this.value)) {
        const schema = this.schema.fields[field]
        if (schema) {
          const Class = classes[schema.type]
          if (!Class) throw new Error(`No type named ${schema.type}`)
          this.value[field] = Class.create(value, schema)
        } else {
          this.value[field] = toNode(value)
        }
      }
    }
    resolve (key) {
      return this.value[key]
    }
    _validate () {
      for (const [key, value] of Object.entries(this.value)) {
        if (value.isNode) value.validate()
      }
    }
    encode () {
      return mapEncode(this)
    }
  }

  return classes
}

module.exports = create
