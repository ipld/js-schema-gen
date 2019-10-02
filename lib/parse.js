const createTypes = require('./types')

const parse = (schema, opts) => {
  const types = createTypes(opts)

  if (schema.advanced) {
    throw new Error('not implemented')
  }

  const kinds = Object.keys(types).map(k => k.toLowerCase())
  const classes = {}

  if (schema.types) {
    for (let [className, _schema] of Object.entries(schema.types)) {
      if (types[className]) throw new Error(`Name conflict, cannot define ${className} twice.`)
      const kindName = _schema.kind.toUpperCase()[0] + _schema.kind.slice(1)
      const Base = types[kindName]
      if (!Base) throw new Error(`Unknown kind ${_schema.kind}`)
      const Class = class Dynamic extends Base {}
      Object.defineProperty(Class, 'name', { value: className })
      Class.create = value => {
        if (value && value.isNode) {
          if (!value instanceof Class) throw new Error('Cannot re-type node')
          return value
        }
        return new Class(value, _schema)
      }
      Class.decoder = value => {
        // TODO: rename aliased properties to their public names
        const node = Class.create(value, _schema)
        node.validate()
        return node
      }
      Class.encoder = value => {
        const node = Class.create(value, _schema)
        node.validate()
        return node
      }
      
      types[className] = classes[className] = Class 
    }
  }
  return classes
}

module.exports = parse
