var q = require('q');
var debug = require('debug')('my-top-npm-packages');
var Registry = require('npm-registry');
var npm = new Registry();

var moment = require('moment');

var listPackagesForUser = q.nbind(npm.users.list, npm.users);
var getDownloadTotals = q.nbind(npm.downloads.totals, npm.downloads);
var getDownloadRange = q.nbind(npm.downloads.range, npm.downloads);

/**
 * Format of the date that npm uses
 * @type {String}
 */
var DAY_FORMAT = 'YYYY-MM-DD';

var _today = moment().utc();
var _yesterday = moment(_today).subtract(1, 'day');
var _dayBefore = moment(_yesterday).subtract(1, 'day');

// Counts are not available for today
var _startOfThisWeek = moment(_yesterday).subtract(1, 'week');
var _startOfLastWeek = moment(_startOfThisWeek).subtract(1, 'week');

var _startOfLastMonth = moment(_yesterday).subtract(1, 'month');

var today = _today.format(DAY_FORMAT);
var yesterday = _yesterday.format(DAY_FORMAT);
var dayBefore = _dayBefore.format(DAY_FORMAT);
var startOfThisWeek = _startOfThisWeek.format(DAY_FORMAT);
var startOfLastWeek = _startOfLastWeek.format(DAY_FORMAT);

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

/**
 * @param  {Object}   options
 * @param  {String}   options.username
 * @param  {String}   [options.sortBy='month']
 * @param  {Function} cb
 */
function getTopPackages(options, cb) {
  if (!options.username) {
    debug('npm username not give');
    cb(new Error('npm username not given'));
    return;
  }

  debug('computing stats for ' + options.username);

  listPackagesForUser(options.username)
  .then(function(packages) {
    debug('done pulling package list for ' + options.username);
    return packages;
  })
  .then(getCountsForPackages)
  .then(sortCounts.bind(null, options.sortBy))
  .then(function(packages) {
    debug('done getting top packages for ' + options.username);
    cb(null, packages);
  }, function(err) {
    debug('error: ', err.message || err);
    cb(err);
  });
};

/**
 * @param  {Object[]} packages
 * @param  {Boolean} [isForUser=true] - Whether or not this query is for an npm user
 * @return {Promise * Package[]}
 */
function getCountsForPackages(packages, isForUser) {
  isForUser = typeof isForUser === 'undefined' ? true : isForUser;

  packages = packages instanceof Array ? packages : [packages];

  // TODO: This should be moved out to earlier in the chain to avoid isForUser
  // since that's only for the error message
  if (!packages || !packages.length) {
    var msg = 'No stats for that ' + (isForUser ? 'npm username' : 'package');
    debug(msg);
    throw new Error(msg);
  }

  debug('number of packages: ' + packages.length);

  // Need to fit package names into a single url
  // so we split the fetching of counts into chunks
  var chunkSize = 50;
  debug('splitting packages into chunks of ' + chunkSize);

  var sublists = splitListIntoSublistsOfSize(packages, 50);
  debug('generated ' + sublists.length + ' chunks');

  var getCountsForSublists = function(sublist) {
    debug('generating comma separated package names');
    var commaSep = getCommaSeparatedPackages(sublist);

    debug('getting counts for a batch of ' + sublist.length + ' packages');
    return getCounts(commaSep);
  };

  return q.all(sublists.map(getCountsForSublists))
  .then(function(sets) {
    debug('flattening lists of ' + sets.length + ' results');
    var merged = sets.reduce(function(prev, next) {
      return prev.concat(next);
    });

    debug('flattened into ' + merged.length + ' results');
    return merged;
  });
}

/**
 * @param  {String} commaSepNames
 * @return {Promise}
 */
function getCounts(commaSepNames) {
  var packageNames = commaSepNames.split(',');
  var packageStats = [];

  var lastDayStats = {};
  var lastWeekStats = {};
  var lastMonthStats = {};

  var query = 'last-month';

  debug('grabbing the ' + query + ' stats for the batch of ' + packageNames.length);
  return getDownloadRange(query, commaSepNames)
  .then(function(stats) {
    debug('finished getting the stats for the batch of ' + packageNames.length);
    stats = stats[0];

    // In the case of a single package, normalize the format
    if (stats.downloads) {
      debug('normalizing output for a single package');
      var _stats = {};

      _stats[stats.package] = {
        downloads: stats.downloads
      };

      stats = _stats;
    }

    return Object.keys(stats).map(function(packageName) {
      var downloads = stats[packageName].downloads;
      var oldNumDays = downloads.length;
      debug('computing stats for package: ' + packageName);
      debug('number of days in download stats: ' + oldNumDays);

      debug('filling in missing days');

      fillInMissingDays(downloads);

      debug('done filling in missing days');
      debug('number of days in stats: ' + downloads.length);
      debug('filled in ' + (downloads.length - oldNumDays) + ' days');

      return new Package({
        name: packageName,
        downloads: downloads,
        counts: {
          day: getLastDayStats(downloads),
          week: getLastWeekStats(downloads),
          month: getLastMonthStats(downloads)
        }
      });
    });
  });
}

/**
 * Sorts the given sortByField of the counts in descending order
 *
 * @param  {String} [sortBy=null] - Returns the packages if not given
 * @param  {Package[]} packages
 * @return {Package[]} Sorted list of Packages
 */
function sortCounts(sortBy, packages) {
  if (!sortBy || (sortBy && !packages)) { return packages; }

  return packages.sort(function(p1, p2) {
    return p2.counts[sortBy].count - p1.counts[sortBy].count;
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
 * @param  {Object[]} stats - List of stat objects for a package
 * @return {Object} stat
 * @return {Object} stat.count
 * @return {Object} stat.delta
 * @return {Object} stat.percent
 */
function getLastDayStats(stats) {
  var lastDayCount = stats[stats.length - 1].downloads;
  var dayBeforeCount = stats[stats.length - 2].downloads;

  var delta = lastDayCount - dayBeforeCount;
  // If the day before is zero, percentage change doesn't make sense
  var percent = dayBeforeCount ? (delta / dayBeforeCount) * 100 : 0;

  debug('computed the stats for the last day');
  return {
    count: lastDayCount,
    increased: delta > 0,
    decreased: delta < 0,
    delta: delta,
    percent: Math.round(percent * 100) / 100
  };
}

function sum(list) {
  return list.reduce(function(prev, next) {
    return prev + next;
  }, 0);
}

function getLastWeekStats(stats) {
  var daysPerWeek = 7;
  // Not subtracting 1 to avoid including an extra day
  var lastElementIndex = stats.length;
  var lastWeekIndex = lastElementIndex - daysPerWeek;

  var lastWeekCount = sum(stats.slice(lastWeekIndex).map(function(d) {
    return d.downloads
  }));

  var weekBeforeCount = sum(stats.slice(lastElementIndex - (daysPerWeek * 2), lastWeekIndex).map(function(d) {
    return d.downloads;
  }));

  var delta = lastWeekCount - weekBeforeCount;
  // If the day before is zero, percentage change doesn't make sense
  var percent = weekBeforeCount ? (delta / weekBeforeCount) * 100 : 0;

  debug('computed the stats for the last week');
  return {
    count: lastWeekCount,
    delta: delta,
    increased: delta > 0,
    decreased: delta < 0,
    percent: Math.round(percent * 100) / 100
  };
}

function getLastMonthStats(stats) {
  var count = stats.reduce(function(prev, next) {
    return prev + next.downloads;
  }, 0);

  debug('computed the stats for the last month');

  return {
    count: count,
    // TODO: Need to fetch the previous month's stats
    // That will make sense when we pull the year's stats for graphing
    delta: 0,
    percent: 0
  };
}

/**
 * Backfills missing days
 *
 * @param  {Object[]} downloads
 */
function fillInMissingDays(downloads) {
  // Counts are not available for today
  var _day = moment(_yesterday);
  var existingDays = {};

  downloads.forEach(function(d) {
    existingDays[d.day] = true;
  });

  // This avoids needing to know if there are 30 or 31 days in a month
  while (_day > _startOfLastMonth) {
    var day = _day.format(DAY_FORMAT);

    if (typeof existingDays[day] === 'undefined') {
      downloads.push({day: day, downloads: 0});
      existingDays[day] = true;
    }

    _day.subtract(1, 'day');
  }

  // Sort in ascending order
  downloads.sort(function(d1, d2) {
    return moment(d1.day).unix() - moment(d2.day).unix();
  });
}

module.exports = getTopPackages;
module.exports.Package = Package;
module.exports.sortCounts = sortCounts;
module.exports.getCountsForPackages = getCountsForPackages;