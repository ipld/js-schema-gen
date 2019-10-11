const createTypes = require('./types')

const parse = (schema, opts) => {
  const types = createTypes(opts)

  const kinds = Object.keys(types).map(k => k.toLowerCase())
  const classes = {}

  const createClass = (className, _schema) => {
    if (types[className]) throw new Error(`Name conflict, cannot define ${className} twice.`)
    const kindName = _schema.kind.toUpperCase()[0] + _schema.kind.slice(1)
    const Base = types[kindName]
    if (!Base) throw new Error(`Unknown kind ${_schema.kind}`)
    const Class = class Dynamic extends Base {}
    Object.defineProperty(Class, 'name', { value: className })
    return Class
  }

  const advancedLayouts = {}

  if (schema.advanced) {
    for (const [className, _schema] of Object.entries(schema.advanced)) {
      const Class = createClass(className, _schema)
      advancedLayouts[className] = Class
      Class.testing = 'asdf'
    }
  }

  if (schema.types) {
    for (let [className, _schema] of Object.entries(schema.types)) {
      let Class
      if (_schema.representation && _schema.representation.advanced) {
        const advName = _schema.representation.advanced
        if (!advancedLayouts[advName]) throw new Error(`Missing advanced layout ${advName}`)
        if (!classes[advName]) throw new Error(`Missing advanced layout schema ${advName}`)
        if (!opts.advanced[advName]) throw new Error(`Missing implementation of advanced layout ${advName}`)
        const Base = advancedLayouts[advName]
        const nodeType = classes[advName]
        Class = class Dynamic extends Base {}
        Object.defineProperty(Class, 'name', { value: className })
        Class.create = value => {
          if (value && value.isNode) {
            if (!value instanceof Class) throw new Error('Cannot re-type node')
            return value
          }
          return new Class(value, Object.assign(_schema, {nodeType}), opts.advanced[advName])
        }
      } else {
        Class = createClass(className, _schema)
        Class.create = (value, fieldSchema) => {
          if (value && value.isNode) {
            if (!value instanceof Class) throw new Error('Cannot re-type node')
            return value
          }
          let __schema
          if (fieldSchema) __schema = Object.assign(_schema, {fieldSchema})
          else __schema = _schema
          return new Class(value, __schema)
        }
        Class.testing = 'base'
      }
      Class.decoder = (value) => {
        // TODO: rename aliased properties to their public names
        const node = Class.create(value)
        node.validate()
        return node
      }
      Class.encoder = (value) => {
        const node = Class.create(value)
        node.validate()
        return node
      }
      types[className] = classes[className] = Class
    }
  }
  return classes
}

module.exports = parse
