/**
 * Package structure
 *
 * @param {Object} options
 */
function Package(options) {
  /**
   * The name of the package
   * @type {String}
   */
  this.name = options.name || '';

  /**
   * The hole filled npm download data
   * @type {Object[]}
   */
  this.downloads = options.downloads || [];

  /**
   * Specific period counts (day, week, month)
   * @type {Object}
   */
  this.counts = options.counts || null;
}

module.exports = Package;