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
 * @param  {String}   username
 * @param  {Function} cb
 * @param  {String}   [sortBy='month']
 */
module.exports = function(username, cb, sortBy) {
  sortBy = sortBy || 'month';

  listPackagesForUser(username)
  .then(getCommaSeparatedPackages)
  .then(getCounts)
  .then(sortCounts.bind(null, sortBy))
  .done(cb);
};

function getCommaSeparatedPackages(packages) {
  return packages.map(function(p) {
    return p.name;
  }).join(',');
}

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
 * @param  {String} sortBy
 * @param  {Package[]} packages
 * @return {Package[]} Sorted list of Packages
 */
function sortCounts(sortBy, packages) {
  return packages.sort(function(p1, p2) {
    return p2.counts[sortBy] - p1.counts[sortBy];
  });
};