const CID = require('cids')
const bytes = require('bytesish')
const validate = require('./validate')
const resolve = require('./resolve')

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
    get (path) {
      resolve(this, path, classes, opts)
    }
    get isNode () {
      return true
    }
    validate () {
      if (this.schema.nullable && this.value === null) return true
      return this._validate()
    }
  }

  classes.Kind = class Kind extends classes.Node {
    encode () {
      // TODO: alias properties from public to encoded names
      return this.value
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
      if (!this.schema.valueType) return
      for (let [key, value] of Object.entries(this.value)) {
        if (typeof this.schema.valueType === 'string') {
          this.value[key] = classes[this.schema.valueType].create(value)
        } else {
          const valueType = this.schema.valueType
          if (!valueType.kind === 'map') throw new Error('Not Implemented')
          this.value[key] = new classes.Map(value, valueType)
        }
      }
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
      Class.create = value => {
        if (value && value.isNode) {
          if (!value instanceof Class) throw new Error('Cannot re-type node')
          return value
        }
        return new Class(value, schema)
      }
      Class.decoded = Class.encoder = value => {
        const node = Class.create(value)
        node.validate()
        return node
      }
    }
  }

  classes.Struct = class Struct extends classes.Node {
    constructor (...args) {
      super(...args)
      if (!this.schema) return // empty schema, no casting or validatino
      for (const [field, schema] of Object.entries(this.schema.fields)) {
        const Class = classes[schema.type]
        if (!Class) throw new Error(`No type named ${schema.type}`)
        console.log({schema})
        this.value[field] = new Class(this.value[field], schema)
      }
    }
    _validate () {
      for (const [key, value] of Object.entries(this.value)) {
        console.log({key, value})
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
