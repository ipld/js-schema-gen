const toNative = node => {
  if (node.isKind) {
    const className = node.constructor.name
    if (className === 'Map' || className === 'List') {
      let ret = className === 'Map' ? {} : []
      for (let [k, v] of Object.entries(node.value)) {
        ret[k] = toNative(v)
      }
      return ret
    }
    return node.value
  } else if (node.toDataModel) {
    return node.toDataModel()
  }
  console.error({node})
  throw new Error('not implemented')
}

module.exports = toNative
