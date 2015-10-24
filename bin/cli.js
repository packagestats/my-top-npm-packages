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

var timer = require('node-tictoc');
timer.tic();

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
    columns: ['Package', 'Downloads over the last ' + sortBy]
  }));

  console.log('---');
  timer.toc();
});