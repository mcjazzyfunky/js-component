'use strict'

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./dist/js-component.cjs.production.js')
} else {
  module.exports = require('./dist/js-component.cjs.development.js')
}
