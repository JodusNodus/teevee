# teevee
A handy CLI tool to watch TV shows from [zooqle](https://zooqle.com) with [webtorrent](https://webtorrent.io).

```bash
> npm install -g teevee
```

## Demo
![Demo video](./demo.gif)

## Requirements
* [Nodejs](https://nodejs.org/en/)
* [webtorrent-cli](https://github.com/webtorrent/webtorrent-cli)
* A supported media player
* macOS or Linux

## Usage
```
Usage: teevee [options] [command]

CLI to stream TV shows with webtorrent

Options:
  --vlc       Default, Use VLC as player
  --iina      Use IINA as player
  --mplayer   Use MPlayer as player
  --mpv       Use MPV as player
  --xmbc      Use XMBC as player
  -h, --help  output usage information

Commands:
  add <imdbID>     Add a TV show to your collection with its IMDB ID.
  remove           Remove a TV show from your collection.
  fetch            Fetch a magnet URL for an episode from your collection.
  watch [options]  Stream an episode from your collection with webtorrent-cli.
```

### Where do i find the IMDB ID?
1. Find your TV show on [IMDB](https://imdb.com)
2. The URL should look like this `https://www.imdb.com/title/<imdbID>`
