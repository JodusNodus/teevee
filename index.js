#!/usr/bin/env node

const tty = require('tty');
const fs = require('fs');
const Conf = require("conf");
const process = require("process");
const { promisify } = require("util");
const program = require("commander");
const inquirer = require("inquirer");
const reopenTTY = require("reopen-tty");
const ora = require("ora");
const { zooqle } = require("zooqle");
const colors = require("colors");
const _ = require("lodash");

const config = new Conf();

const openStream = () => {
	const fd = fs.openSync("/dev/tty", "r+");
	const stdin = new tty.ReadStream(fd);
	const stdout = new tty.WriteStream(fd);
	return {stdin, stdout};
}
const {stdin, stdout} = openStream();

const output = {
  info: text => stdout.write(">".green + " " + text.bold + "\n"),
  err: text => stdout.write("x".red + " " + text.bold + "\n"),
  spinner: text => ora({ text, stream: stdout }).start(),
  prompt: inquirer.createPromptModule({ output: stdout, input: stdin })
};

/**
* Zooqle API
*/
async function zooqleFetchByImdb(imdbId) {
  try {
    const { showResponse } = await zooqle.search(imdbId);
    return showResponse;
  } catch (err) {
    return null;
  }
}

async function zooqleFetchEpisodeTorrents(dataHref) {
  try {
    return await zooqle.getData(dataHref);
  } catch (err) {
    return null;
  }
}

/**
 * Watch an episode
 */
async function selectTvShow(tvShows) {
  const choices = tvShows.map(show => show.title);
  const tvShowQuestion = {
    type: "list",
    name: "tvShow",
    message: "Choose a TV show",
    choices: choices
  };
  const { tvShow } = await output.prompt([tvShowQuestion]);
  const i = choices.indexOf(tvShow);
  return tvShows[i];
}

async function selectSeason(seasons) {
  const nonEmptySeasons = seasons.filter(x => x.episodes.length > 0);
  const choices = nonEmptySeasons.map(x => x.season);
  const seasonQuestion = {
    type: "list",
    name: "season",
    message: "Pick a season",
    pageSize: 10,
    choices: choices
  };
  const { season } = await output.prompt([seasonQuestion]);
  const i = choices.indexOf(season);
  return nonEmptySeasons[i];
}

async function selectEpisode(episodes) {
  const eps = episodes.filter(ep => ep.episodeTitle);
  const choices = eps.map(ep => ep.episodeNumber + ") " + ep.episodeTitle);
  const episodeQuestion = {
    type: "list",
    name: "episode",
    message: "Pick an episode",
    pageSize: 10,
    choices: choices
  };
  const { episode } = await output.prompt([episodeQuestion]);
  const i = choices.indexOf(episode);
  return eps[i];
}

function deduceQualityFromTorrent(title) {
  const qualitySigns = [
    ["1080p", /1080p/gi],
    ["720p", /720p/gi],
    ["HDTV", /HDTV|HD/gi],
    ["SDTV", /SDTV|SD/gi],
    ["WEBRIP", /WEB/gi],
  ];
  for (const [quality, regex] of qualitySigns) {
    if (regex.test(title)) {
      return quality;
    }
  }
  return null;
}

async function selectTorrent(torrents) {
  const highestSeeded = _.chain(torrents)
    .map(x =>
      Object.assign({}, x, { quality: deduceQualityFromTorrent(x.title) })
    )
    .sortBy(["seeders"])
    .reverse()
    .uniqBy("quality")
    .value();

  const choices = highestSeeded.map(
    tor => `▲${tor.seeders} ▼${tor.leechers} - ${tor.size} - ${tor.quality}`
  );
  const torrentQuestion = {
    type: "list",
    name: "torrent",
    message: "Pick a torrent",
    choices: choices
  };
  const { torrent } = await output.prompt([torrentQuestion]);
  const i = choices.indexOf(torrent);
  return highestSeeded[i];
}

async function watchCommand() {
  const tvShows = config.get("tvShows");
  if (!tvShows || tvShows.length < 1) {
    output.err("You haven't added any TV shows.");
    return;
  }

  const { imdbId } = await selectTvShow(tvShows);

  const spinner1 = output.spinner("Loading show information");
  const tvShow = await zooqleFetchByImdb(imdbId);
  spinner1.stop();
  if (!tvShow) {
    output.err("It seems that this TV show has dissapeared");
    return;
  }

  const season = await selectSeason(tvShow.seasons);

  const episode = await selectEpisode(season.episodes);

  const spinner2 = output.spinner("Loading episode information");
  const torrents = await zooqleFetchEpisodeTorrents(episode.dataHref);
  spinner2.stop();
  if (!torrents) {
    output.err("Failed to fetch torrents for the episode");
    return;
  }

  const { magnet } = await selectTorrent(torrents);
  console.log(magnet);
}

/**
 * Add a new TV show
 */
async function confirmTvShow({ title, from, summary }) {
  console.log("Title:".blue, title);
  console.log("Release date:".blue, from);
  console.log("Summary:".blue, summary);
  const question = {
    type: "confirm",
    name: "confirmTvShow",
    message: "Is this what you are looking for?"
  };
  const { confirmTvShow } = await output.prompt([question]);
  return confirmTvShow;
}

async function addTvShow({ title, imdbId }) {
  let newArr = [{ title, imdbId }];
  if (config.has("tvShows")) {
    newArr = newArr.concat(config.get("tvShows"));
  }
  config.set("tvShows", newArr);
}

async function addCommand(imdbId) {
  const tvShows = config.get("tvShows");
  if (tvShows && _.find(tvShows, ["imdbId", imdbId])) {
    output.err("This TV shows is already in your collection.");
    return;
  }

  const spinner = output.spinner("Searching for TV shows");
  const tvShow = await zooqleFetchByImdb(imdbId);
  spinner.stop();

  if (!tvShow) {
    err("Nothing found");
    return;
  }

  const confirmed = await confirmTvShow(tvShow);
  if (!confirmed) {
    return;
  }

  await addTvShow(tvShow);
  output.info(tvShow.title.blue.bold + " has been added");
}

/**
 * Remove a TV show
 */
async function removeTvShow(imdbId) {
  let newArr = config.get("tvShows").filter(show => show.imdbId !== imdbId);
  config.set("tvShows", newArr);
}

async function confirmRemoveTvShow(title) {
  const question = {
    type: "confirm",
    name: "confirmTvShow",
    message:
      "Do you really want to remove " + title.blue + " from your collection ?"
  };
  const { confirmTvShow } = await output.prompt([question]);
  return confirmTvShow;
}

async function removeCommand() {
  const tvShows = config.get("tvShows");
  if (!tvShows || tvShows.length < 1) {
    err("You haven't added any TV shows.");
    return;
  }

  const { title, imdbId } = await selectTvShow(tvShows);
	output.info(imdbId);

  const confirmed = await confirmRemoveTvShow(title);
  if (!confirmed) {
    return;
  }

  await removeTvShow(imdbId);
  output.info(title.blue.bold + " has been removed");
}

program
  .command("add <imdbID>")
  .description("Add a TV show to your collection with its IMDB ID.")
  .action(addCommand);

program
  .command("remove")
  .description("Remove a new TV show from your collection.")
  .action(removeCommand);

program
  .command("fetch")
  .description("Fetch a magnet URL for an episode from your collection.")
  .action(watchCommand);

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  watchCommand();
}
