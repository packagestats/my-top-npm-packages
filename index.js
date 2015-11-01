var Package = require('./lib/Package');

var q = require('q');
var debug = require('debug')('my-top-npm-packages');
var Registry = require('npm-registry');
var npm = new Registry();

var moment = require('moment');
var values = require('object-values');
var packer = require('string-packer');

var listPackagesForUser = q.nbind(npm.users.list, npm.users);
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

// Around the length limits of an http get request
var maxGetRequestLength = 2048;

function maxMirrorLength() {
  var mirrorLengths = values(Registry.mirrors).map(function(mirror) {
    return mirror.length;
  });

  return Math.max.apply(Math, mirrorLengths);
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
  });
};

/**
 * @param  {Object[]} packages
 * @param  {Boolean} [isForUser=true] - Whether or not this query is for an npm user
 * @return {Promise}
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
  // TODO: Find a way to fetch the part of the request right before the package list for a more accurate count.
  var binSize = maxGetRequestLength - (maxMirrorLength() + '/downloads/range/last-month/'.length);
  debug('bin size: ' + binSize);

  var batches = packer({
    list: packages.map(function(p) { return p.name; }),
    delimiter: ',',
    binSize: binSize
  });

  debug('generated ' + batches.length + ' batches');
  var getCountsForBatch = function(batch) {
    return fetchDownloadCounts(batch);
  };

  return q.all(batches.map(getCountsForBatch))
  .then(function(results) {
    return results.map(getCounts);
  })
  .then(function(sets) {
    return sets.reduce(function(prev, next) {
      return prev.concat(next);
    });
  });
}

function fetchDownloadCounts(batch) {
  var query = 'last-month';
  var packageNames = batch.split(',');

  debug('grabbing the ' + query + ' stats for the batch of ' + packageNames.length);

  return getDownloadRange(query, batch)
  .then(function(stats) {
    debug('finished getting the stats for the batch of ' + packageNames.length);
    return stats;
  });
}

/**
 * @param  {Array} stats
 * @return {Promise}
 */
function getCounts(stats) {
  var lastDayStats = {};
  var lastWeekStats = {};
  var lastMonthStats = {};

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
    debug(packageName + ' processing');
    var downloads = stats[packageName].downloads;
    var oldNumDays = downloads.length;

    fillInMissingDays(downloads);

    debug(packageName + ': days: ' + oldNumDays +
          ' | filled ' + (downloads.length - oldNumDays) + ' days');

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
    return d.downloads;
  }));

  var weekBeforeCount = sum(stats.slice(lastElementIndex - (daysPerWeek * 2), lastWeekIndex).map(function(d) {
    return d.downloads;
  }));

  var delta = lastWeekCount - weekBeforeCount;
  // If the day before is zero, percentage change doesn't make sense
  var percent = weekBeforeCount ? (delta / weekBeforeCount) * 100 : 0;

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
