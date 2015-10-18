#!/usr/bin/env node

var getTopPackages = require('../');
var columnify = require('columnify');

var program = require('commander');

program
  .version(require('../package.json').version)
  .usage('[options] <username>')
  .option('--day', 'for the past day')
  .option('--week', 'for the past week')
  .parse(process.argv);

var sortBy = 'month';

if (program.day) {
  sortBy = 'day';
}

if (program.week) {
  sortBy = 'week';
}

getTopPackages({
  username: program.args[0],
  sortBy: sortBy
},
function(err, rankedPackages) {
  if (err) {
    console.log(err.message);
    return;
  }

  var table = {};

  rankedPackages.forEach(function(p) {
    table[p.name] = p.counts[sortBy].count || 0;
  });

  console.log(columnify(table, {
    columns: ['Packages (' + rankedPackages.length + ')', 'Downloads over the last ' + sortBy]
  }));

  console.log('-----');
  console.log('Like this tool? Check out www.packagestats.io');
});