const path = require('path')

module.exports = ({ config }) => {
  config.module.rules.push({
    test: /\.(ts|tsx)$/,

    use: [
      {
        loader: require.resolve('awesome-typescript-loader')
      }
    ]
  })

  const alias = (config.resolve && config.resolve.alias) || {}

  alias['js-component$'] = path.resolve(
    __dirname,
    '../src/main/js-component.ts'
  )

  config.resolve.alias = alias
  config.resolve.extensions.push('.ts')

  return config
}
