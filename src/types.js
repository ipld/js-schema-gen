'use strict'
const CID = require('cids')
const bytes = require('bytesish')
const Block = require('@ipld/block')

const str = o => JSON.stringify(o)

class SchemaKindError extends Error {
  constructor (node) {
    super(`${str(node.value)} is not a valid ${node.constructor.name}`)
  }
}

const serializeObject = obj => {
  if (CID.isCID(obj)) return obj
  const ret = Array.isArray(obj) ? [] : {}
  for (const [k, v] of Object.entries(obj)) {
    ret[k] = v.encode()
  }
  return ret
}

// eslint-disable-next-line require-await
const keyGenerator = async function * (obj) {
  for (const key of Object.keys(obj)) {
    yield key
  }
}

const create = opts => {
  if (!opts.types) opts.types = {}
  let classes = {}

  classes.Node = class Node {
    constructor (value, schema) {
      // TODO: replace Buffer w/ bytes.valid()
      if (value && typeof value === 'object' && !Buffer.isBuffer(value) && !CID.isCID(value)) {
        if (Array.isArray(value)) value = value.slice()
        else value = { ...value }
      }
      this.value = value
      this.schema = schema
      this.opts = opts
    }

    async getNode (path = '') {
      path = path.split('/').filter(x => x)

      const resolveNode = async node => {
        if (!this.opts.getBlock) throw new Error('Cannot perform get() without getBlock method')
        const block = await this.opts.getBlock(node.value)
        if (!block) throw new Error(`Block:${node.value.toString()} not found`)
        let expected
        if (!node.schema.fieldSchema) {
          expected = node.schema.expectedType
        } else {
          expected = node.schema.fieldSchema.type.expectedType
        }
        const decoded = block.decode()
        if (!expected) {
          node = toNode(decoded)
        } else {
          node = classes[expected].decoder(decoded)
        }
        return node
      }
      let node = this

      // run with empty string in order to get block and cast as type
      if (!path.length && node.isLink) return resolveNode(node)

      while (path.length) {
        const prop = path.shift()
        const parent = node
        node = node.resolve(prop)
        if (!node) throw new Error(`${parent.constructor.name} does not contain property ${prop}`)
        if (node.isLink) {
          node = await resolveNode(node)
        }
      }
      return node
    }

    async get (path) {
      const node = await this.getNode(path)
      return node.encode()
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

    block () {
      const data = this.encode()
      return Block.encoder(data, opts.codec || 'dag-cbor')
    }

    decode () {
      // place holder, this will get more complicated when we support renames
      return this.encode()
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
      throw new Error('Cannot lookup sub-properties on kind')
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
      try {
        bytes.native(this.value)
      } catch (e) {
        throw new Error('Cannot convert to Bytes.')
      }
    }

    block () {
      return Block.encoder(bytes.native(this.value), 'raw')
    }

    read (start = 0, end) {
      const buffer = this.value
      const native = bytes.native(bytes.slice(buffer, start, end))

      // eslint-disable-next-line require-await
      return (async function * () { yield native })()
    }
  }

  classes.Map = class Map extends classes.Kind {
    constructor (...args) {
      super(...args)
      for (const [key, value] of Object.entries(this.value)) {
        if (!this.schema || !this.schema.valueType) {
          this.value[key] = toNode(value)
        } else if (typeof this.schema.valueType === 'string') {
          this.value[key] = classes[this.schema.valueType].create(value)
        } else {
          const valueType = this.schema.valueType
          if (valueType.kind === 'link') {
            this.value[key] = classes.Link.create(value, { type: valueType })
          } else if (valueType.kind === 'map') {
            this.value[key] = classes.Map.create(value, valueType)
          } else {
            throw new Error('Not Implemented')
          }
        }
      }
    }

    resolve (key) {
      return this.value[key]
    }

    __validate () {
      if (this.schema.valueType) {
        const typeing = this.schema.valueType
        for (const [key, value] of Object.entries(this.value)) {
          if (typeof typeing === 'string') {
            if (value.constructor.name !== typeing) {
              throw new Error(`Field value for "${key}" does not match required ${typeing} type`)
            }
          } else {
            if (typeof typeing !== 'object') throw new Error('Bad typeing info')
            if (typeing.kind === 'map') {
              // eslint-disable-next-line
              if (typeing.keyType !== 'String') throw new Error('Unsupported')
            } else if (typeing.kind === 'link') {
              // noop
            } else {
              throw new Error('Not Implemented')
            }
            // we don't need any more validation because these will already
            // be cast as proper types and validated below
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
      return serializeObject(this.value)
    }

    keys () {
      return keyGenerator(this.value)
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
      if (!CID.isCID(this.value)) throw new SchemaKindError(this)
    }

    get isLink () {
      return true
    }
  }

  const kindMap = {}

  /* Class.create() */
  for (const [className, Class] of Object.entries(classes)) {
    if (className !== 'Node' && className !== 'Kind') {
      const kind = className.toLowerCase()
      const schema = { kind }
      Class.create = (value, fieldSchema) => {
        if (value && value.isNode) {
          if (!(value instanceof Class)) throw new Error('Cannot re-type node')
          return value
        }
        let _schema
        if (fieldSchema) _schema = { ...schema, fieldSchema }
        else _schema = schema
        return new Class(value, _schema)
      }
      Class.decoder = Class.encoder = value => {
        const node = Class.create(value)
        node.validate()
        return node
      }
      kindMap[className.toLowerCase()] = Class
    }
  }
  classes = { ...classes, ...opts.types }

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
      if (CID.isCID(value)) return classes.Link.create(value)
      if (Array.isArray(value)) return classes.List.create(value)
      else return classes.Map.create(value)
    }
    throw new Error(`Cannot convert ${value} to kind`)
  }

  classes.Union = class Union extends classes.Node {
    constructor (...args) {
      super(...args)
      if (!this.schema) throw new Error('Missing schema for union')

      if (this.schema.representation.keyed) {
        const _keys = Object.keys(this.value)
        if (!_keys.length) throw new Error('Missing required union key')
        if (_keys.length !== 1) throw new Error('Union has too many keys')
        this.keyRep = Object.keys(this.value)[0]
        const keyed = this.schema.representation.keyed
        const className = keyed[this.keyRep]
        if (!className) throw new Error(`Unknown union key "${this.keyRep}"`)
        this.expected = className
        const val = this.value[this.keyRep]
        if (typeof className === 'object') {
          if (className.kind !== 'link') throw new Error('Unknown union type')
          this.value = classes.Link.create(val, { type: className })
        } else {
          if (!classes[className]) throw new Error(`Missing type "${className}"`)
          this.value = classes[className].create(val)
        }
      } else {
        throw new Error('not implemented')
      }
    }

    encode () {
      if (!this.schema.representation.keyed) throw new Error('not implemented')
      const ret = {}
      ret[this.keyRep] = this.value.encode()
      return ret
    }

    resolve (key) {
      if (!key) throw new Error('Traversals into unions must include key')
      if (key === '*') return this.value
      if (key !== this.keyRep) throw new Error(`Union contains ${this.keyRep} and not ${key}`)
      return this.value
    }

    _validate () {
      return this.value.validate()
    }
  }

  classes.Struct = class Struct extends classes.Node {
    constructor (...args) {
      super(...args)
      if (!this.schema) throw new Error('Missing schema for struct')
      for (const [field, value] of Object.entries(this.value)) {
        const schema = this.schema.fields[field]
        if (schema) {
          let Class
          if (typeof schema.type === 'object') {
            Class = kindMap[schema.type.kind]
            if (!Class) throw new Error(`No kind named ${schema.type.kind}`)
          } else {
            Class = classes[schema.type]
          }
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
      for (const value of Object.values(this.value)) {
        if (value.isNode) value.validate()
      }
    }

    encode () {
      if (!this.schema.representation.map) throw new Error('Not implemented')
      return serializeObject(this.value)
    }

    keys () {
      return keyGenerator(this.value)
    }
  }

  classes.Advanced = class Advanced extends classes.Node {
    constructor (value, schema, impl) {
      schema = { ...schema }
      const nodeType = schema.nodeType
      delete schema.nodeType

      super(null, schema)

      if (!nodeType) throw new Error('Missing nodeType')
      this.value = nodeType.create(value)
      for (const [key, method] of Object.entries(impl)) {
        this[key] = (...args) => method(this, ...args)
      }
    }

    encode () {
      return this.value.encode()
    }

    _validate () {
      return this.value._validate()
    }

    resolve (...args) {
      return this.value.resolve(...args)
    }
  }

  return classes
}

module.exports = create
module.exports.serializeObject = serializeObject
