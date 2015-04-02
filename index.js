var q = require('q');
var Registry = require('npm-registry');
var npm = new Registry();

var listPackagesForUser = q.nbind(npm.users.list, npm.users);
var getDownloadTotals = q.nbind(npm.downloads.totals, npm.downloads);

function Package(options) {
  this.name = options.name || '';
  this.counts = options.counts || null;
}

/**
 * @param  {Object}   options
 * @param  {String}   options.username
 * @param  {String}   [options.sortBy='month']
 * @param  {Function} cb
 */
module.exports = function(options, cb) {
  if (!options.username) {
    cb(new Error('username not given'));
    return;
  }

  options.sortBy = options.sortBy || 'month';

  listPackagesForUser(options.username)
  .then(function(packageNames) {
    if (!packageNames || !packageNames.length) {
      throw new Error('The user ' + options.username + ' doesn\'t exist or has no packages');
    }

    // Need to fit package names into a single url
    // so we split the fetching of counts into chunks
    var sublists = splitListIntoSublistsOfSize(packageNames, 50);
    var getCountsForSublists = function(sublist) {
      return getCounts(getCommaSeparatedPackages(sublist));
    };

    return q.all(sublists.map(getCountsForSublists))
    .then(function(sets) {
      var merged = sets.reduce(function(prev, next) {
        return prev.concat(next);
      });

      return merged;
    });
  })
  .then(sortCounts.bind(null, options.sortBy))
  .then(function(packages) {
    cb(null, packages);
  }, function(err) {
    cb(err);
  });
};

/**
 * @param  {Object[]} list
 * @param  {Number} size - The sublist max size
 * @return {Object[][]}
 */
function splitListIntoSublistsOfSize(list, size) {
  var numTimes = Math.ceil(list.length / size, 10);
  var sublists = [];

  for (var i = 0; i < numTimes; i++) {
    sublists.push(list.slice(i*size, (i+1)*size));
  }

  return sublists;
}

/**
 * @param  {Object[]} packages
 * @return {String}
 */
function getCommaSeparatedPackages(packages) {
  return packages.map(function(p) {
    return p.name;
  }).join(',');
}

/**
 * @param  {String} commaSepNames
 * @return {Promise}
 */
function getCounts(commaSepNames) {
  var packageNames = commaSepNames.split(',');
  var packageStats = [];

  var lastDayStats;
  var lastWeekStats;
  var lastMonthStats;

  return getDownloadTotals('last-day', commaSepNames)
  .then(function(stats) {
    lastDayStats = stats[0];
    return getDownloadTotals('last-week', commaSepNames);
  })
  .then(function(stats) {
    lastWeekStats = stats[0];
    return getDownloadTotals('last-month', commaSepNames);
  })
  .then(function(stats) {
    lastMonthStats = stats[0];

    return packageNames.map(function(name) {
      return new Package({
        name: name,
        counts: {
          day: lastDayStats[name] ? lastDayStats[name].downloads : 0,
          week: lastWeekStats[name] ? lastWeekStats[name].downloads : 0,
          month: lastMonthStats[name] ? lastMonthStats[name].downloads : 0
        }
      });
    });
  });
}

/**
 * Sorts the given sortByField of the counts in descending order
 *
 * @param  {String} sortBy
 * @param  {Package[]} packages
 * @return {Package[]} Sorted list of Packages
 */
function sortCounts(sortBy, packages) {
  return packages.sort(function(p1, p2) {
    return p2.counts[sortBy] - p1.counts[sortBy];
  });
};