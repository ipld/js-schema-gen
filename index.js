'use strict'
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
    encode () {
      return this.value
    }
    from (def) {
      return new kindMap[def.kind](this.value)
    }
  }
  classes.Int = class Int extends Kind {
    validate (value) {
      return Number.isInteger(value)
    }
  }
  classes.String = class String extends Kind {
    validate (value) {
      return typeof value === 'string'
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
            if (def.nullable) parsed[k] = null
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
      let encoded = {}
      for (let [k, v] of Object.entries(this.value)) {
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
        return new this.cls(obj)
      }
    }
  }

  class Union extends Node {
    validate () {
      for (const [k, def] of Object.entries(this.def)) {
        console.log(k, def)
      }
    }

    from (def) {
      const rep = def.representation
      return obj => {
        // should we throw if there is more than one key?
        if (typeof obj !== 'object') throw new Error('Unsupported union serialization')
        if (rep.keyed) {
          for (const [key, className] of Object.entries(rep.keyed)) {
            if (obj[key]) return classes[className].from(obj[key])
          }
          const keys = Object.keys(rep.keyed)
          throw new Error('Keyed union must have one of the following keys: ' + keys.join(', '))
        } else {
          throw new Error('Unsupported: only have support for keyed unions')
        }
      }
    }
  }

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

  for (const [key, def] of Object.entries(parsed.schema)) {
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
