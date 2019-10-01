const CID = require('cids')
const bytes = require('bytesish')
const validate = require('./validate')
const resolve = require('./resolve')

const str = o => Object.stringify(o)

class SchemaKindError extends Error {
  constructor (node) {
    super(`${str(node.value)} is not a valid ${node.constructor.name}`)
  }
}

const create = opts => {
  const classes = {}

  classes.Node = class Node {
    constructor (value, schema) {
      this.value = value
      this.schema = schema
    }
    get (path) {
      resolve(this, path, classes, opts)
    }
  }
  classes.Kind = class Kind extends classes.Node {
    encode () {
      // TODO: alias properties from public to encoded names
      return this.value
    }
  }
  classes.Int = class Int extends classes.Kind {
    validate () {
      if (!Number.isInteger(this.value)) throw new SchemaKindError(this)
    }
  }
  classes.Float = class Float extends classes.Kind {
    validate () {
      if (typeof this.value !== 'number' || Number.isInteger(this.value)) {
        throw new SchemaKindError(this)
      }
    }
  }
  classes.String = class String extends classes.Kind {
    validate () {
      if (typeof this.value !== 'string') throw new SchemaKindError(this)
    }
  }
  classes.Null = class Null extends classes.Kind {
    validate () {
      if (this.value !== null) throw new SchemaKindError(this)
    }
  }
  classes.Bool = class Bool extends classes.Kind {
    validate () {
      if (typeof this.value !== 'boolean') throw new SchemaKindError(this)
    }
  }
  classes.Bytes = class Bytes extends classes.Kind {
    validate () {
      bytes.native(this.value)
    }
  }
  classes.Map = class Map extends classes.Kind {
    validate () {
      if (typeof this.value !== 'object' ||
          Array.isArray(this.value) ||
          this.value === null
      ) {
        throw new SchemaKindError(this)
      }
    }
  }
  classes.List = class List extends classes.Map {
    validate () {
      if (!Array.isArray(this.value)) throw new SchemaKindError(this)
    }
  }
  classes.Link = class Link extends classes.Kind {
    validate () {
      if (!CID.isCID(value)) throw new SchemaKindError(this)
    }
  }

  classes.Base = class Base extends classes.Node {
  }

  return classes
}

module.exports = create
