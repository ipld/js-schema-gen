'use strict'
const CID = require('cids')
const bytes = require('bytesish')

const create = parsed => {
  const classes = {}
  const classSet = new Set()

  class Node {
    constructor (value) {
      this.parsed = this.validate(value)
      this.value = value
    }
  }

  class Kind extends Node {
    constructor (value) {
      super(value)
      if (value instanceof this.constructor) {
        this.parsed = true
        this.value = value.encode()
      } else {
        if (!this.parsed) throw new Error('Validation error')
      }
    }

    encode () {
      return this.value.encode ? this.value.encode() : this.value
    }
  }
  classes.Int = class Int extends Kind {
    validate (value) {
      return Number.isInteger(value)
    }
  }
  classes.Float = class Float extends Kind {
    validate (value) {
      return typeof value === 'number' && !Number.isInteger(value)
    }
  }
  classes.String = class String extends Kind {
    validate (value) {
      return typeof value === 'string'
    }
  }
  classes.Null = class Null extends Kind {
    validate (value) {
      return value === null
    }
  }
  classes.Boolean = class Boolean extends Kind {
    validate (value) {
      return typeof value === 'boolean'
    }
  }
  classes.Bytes = class Bytes extends Kind {
    validate (value) {
      return bytes.native(value)
    }

    encode () {
      return this.parsed
    }
  }
  classes.List = class List extends Kind {
    validate (value) {
      return Array.isArray(value)
    }
  }
  classes.Map = class Map extends Kind {
    validate (value) {
      return typeof value === 'object'
    }
  }
  classes.Link = class Link extends Kind {
    validate (value) {
      return CID.isCID(value)
    }
  }

  class Struct extends Node {
    validate (value) {
      const parsed = {}
      if (typeof value !== 'object') throw new Error('Invalid type')
      for (const [k, def] of Object.entries(this.def.fields)) {
        if (!def.optional && typeof value[k] === 'undefined') {
          throw new Error(`Missing required field "${k}"`)
        }
        if (typeof value[k] !== 'undefined') {
          if (value[k] === null) {
            if (def.nullable || def.type === 'Null') parsed[k] = null
            else throw new Error('Field is not nullable')
          } else {
            if (value[k].constructor && classSet.has(value[k].constructor)) {
              parsed[k] = value[k]
            } else {
              const CLS = classes[def.type]
              parsed[k] = new CLS(value[k])
            }
          }
        }
      }
      return parsed
    }

    encode () {
      const encoded = {}
      for (const [k, v] of Object.entries(this.value)) {
        if (typeof this.parsed[k] === 'undefined') encoded[k] = v.encode ? v.encode() : v
        else if (this.parsed[k] === null) encoded[k] = null
        else encoded[k] = this.parsed[k].encode()
      }
      return encoded
    }

    from (def) {
      return obj => {
        if (typeof obj !== 'object') throw new Error('Unsupported struct serialization')
        // TODO: handle any renames

        // eslint-disable-next-line new-cap
        return new this.cls(obj)
      }
    }
  }

  class Union extends Node {
    validate (value) {
      const parsed = {}
      if (typeof value !== 'object') throw new Error('Invalid encoding')
      const keys = Object.keys(value)
      if (keys.length !== 1) throw new Error('Map must only have one key')

      if (this.def.representation.keyed) {
        const key = keys[0]
        const val = value[key]
        const className = this.def.representation.keyed[key]
        parsed[key] = new classes[className](val)
      }
      return parsed
    }

    from (def) {
      const rep = def.representation
      return obj => {
        // should we throw if there is more than one key?
        if (typeof obj !== 'object') throw new Error('Unsupported union serialization')
        if (rep.keyed) {
          for (const [key, className] of Object.entries(rep.keyed)) {
            if (obj[key]) {
              const parsed = { }
              parsed[key] = new classes[className](obj[key])
              // eslint-disable-next-line new-cap
              return new this.cls(parsed)
            }
          }
          const keys = Object.keys(rep.keyed)
          throw new Error('Keyed union must have one of the following keys: ' + keys.join(', '))
        } else {
          throw new Error('Unsupported: only have support for keyed unions')
        }
      }
    }

    encode () {
      const [key, value] = Object.keys(this.parsed).map(k => ([k, this.parsed[k]]))[0]
      const ret = {}
      ret[key] = value.encode()
      return ret
    }
  }

  // Enum

  const kindMap = {
    struct: Struct,
    union: Union
  }

  const _eval = name => `
    const me = class ${name} extends baseClass {
      get def () {
        return def
      }
      get cls () {
        return me
      }
    }
    me.from = me.prototype.from(def)
    delete me.prototype.from
    return me
  `

  for (const [key, def] of Object.entries(parsed)) {
    // eslint-disable-next-line no-new-func
    const fn = new Function('baseClass', 'def', _eval(key))
    const baseClass = kindMap[def.kind]
    const _class = fn(baseClass, def)
    classes[key] = _class
  }
  Object.values(classes).forEach(cls => classSet.add(cls))

  return classes
}

module.exports = create
