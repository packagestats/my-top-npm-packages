### my-top-npm-packages [![npm](http://img.shields.io/npm/v/my-top-npm-packages.svg)](https://npmjs.org/package/my-top-npm-packages) [![npm](http://img.shields.io/npm/dm/my-top-npm-packages.svg)](https://npmjs.org/package/my-top-npm-packages)

> Get your top npm packages, ranked by downloads in the last month

`npm install -g my-top-npm-packages`

### Usage

`my-top-npm-downloads [options] <githubUsername>`

* Defaults to showing you the download counts in the last `month`.
* Other options: `--week` or `--day`

### How does it work

Scrapes the npm profile of the specified user, pulls the stats for every one of their packages,
then ranks them by the specified time period.

I currently have about ~40 published packages and this takes ~19 seconds to finish.
If you're [@sindresorhus](https://github.com/sindresorhus), go make some popcorn – it'll be a while.

### Beware, this will break if

* npm paginates the list of packages on a user's profile page
* npm changes the html for the sidebar on the package's page
* npm changes their url structure

Scraping, ftw.