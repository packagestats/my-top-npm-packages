var request = require('request');
var q = require('q');
var $ = require('jquery')(require('jsdom').jsdom().parentWindow);

function Package(options) {
  this.name = options.name || '';
  this.url = options.url || '';
  this.counts = options.counts || null;
}

/**
 * @param  {String}   username
 * @param  {Function} cb
 * @param  {String}   [sortBy='month']
 */
module.exports = function(username, cb, sortBy) {
  sortBy = sortBy || 'month';

  getProfilePageForUser(username)
  .then(getLinksForPackages)
  .then(getCountsForPackages)
  .then(sortCountsForPackages.bind(null, sortBy))
  .done(cb);
};

/**
 * @param  {String} username
 * @return {Promise} Resolves with the HTML content of that user's npm profile page
 */
function getProfilePageForUser(username) {
  var deferred = q.defer();

  request('https://www.npmjs.com/~' + username, function(error, response, body) {
    if (error) {
      deferred.reject(error);
      return;
    }

    if (response.statusCode == 200) {
      deferred.resolve(body);

    } else {
      deferred.reject();
    }
  });

  return deferred.promise;
}

/**
 * Grabs the list of all package links found on a user's npm profile page
 * @param  {String} profilePageHTML
 * @return {Object} - package name -> url hash
 */
function getLinksForPackages(profilePageHTML) {
  var $links = $(profilePageHTML).find('.content ul:first li a');
  var host = 'https://www.npmjs.com';
  var linkMap = {};

  $links.each(function(idx, el) {
    var href = host + el.href.replace('file://', '');
    // The text of the link is truncated, so we grab it from the url
    var packageName = href.split('package/')[1];
    linkMap[packageName] = host + el.href.replace('file://', '');
  });

  return linkMap;
}

/**
 * @param  {Object} linkMap - package name -> url hash
 * @return {Promise} - Resolves with a list of Packages
 */
function getCountsForPackages(linkMap) {
  var packages = Object.keys(linkMap);

  return q.all(packages.map(function(packageName) {
    var packageUrl = linkMap[packageName];

    return getCountsForPackage(packageUrl)
    .then(function(counts) {
      return new Package({
        url: packageUrl,
        name: packageName,
        counts: counts
      });
    });
  }));
}

/**
 * @param  {String} packageUrl
 * @return {Promise} Resolves with an object containing the download counts for a single package
 */
function getCountsForPackage(packageUrl) {
  var deferred = q.defer();

  request(packageUrl, function(error, response, body) {
    var counts = {
      day: null,
      week: null,
      month: null
    };

    if (error || response.statusCode !== 200) {
      deferred.resolve(counts);
      return;
    }

    var $stats = $(body).find('h3:contains("Stats")').next('ul').find('li').slice(0, 3);
    var getCountForIndex = function(idx) {
      try {
        var text = $stats.get(idx).textContent;
        var stripped = text.replace(',', '');
        return parseInt(stripped, 10);
      } catch(e) {
        return 0;
      }
    };

    var counts = {
      day: getCountForIndex(0),
      week: getCountForIndex(1),
      month: getCountForIndex(2),
    };

    deferred.resolve(counts);
  });

  return deferred.promise;
}

/**
 * Sorts the given sortByField of the counts in descending order
 * @param  {String} sortBy
 * @param  {Package[]} packages
 * @return {Package[]} Sorted list of Packages
 */
function sortCountsForPackages(sortBy, packages) {
  return packages.sort(function(p1, p2) {
    return p2.counts[sortBy] - p1.counts[sortBy];
  });
};