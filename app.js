var program = require("commander"),
    request = require("request"),
    mkdirp  = require("mkdirp"),
    async   = require("async"),
    path    = require("path"),
    fs      = require("fs"),
    printf  = require("util").format;

try {
  var client_id = require(__dirname+"/id.json");
  if(typeof client_id.id == "undefined") throw new Error();
  if(client_id.id == "SOUNDCLOUD_APP_CLIENT_ID" || client_id.id.length != 32) throw new Error();
  client_id = client_id.id;
} catch(e) {
  console.error("Please copy id.json.sample and change SOUNDCLOUD_APP_CLIENT_ID to your Soundcloud APP")
  return;
}

var URLS = {
  "search": function(query) {
    return printf("http://api.soundcloud.com/users/?q=%s&format=json&client_id=%s", encodeURIComponent(query), client_id);
  },
  "tracks": function(id, offset) {
    return printf("http://api.soundcloud.com/users/%d/tracks/?limit=50&offset=%d&format=json&client_id=%s", id, offset || 0, client_id);
  }
};

var getJSON = function(url, callback) {
  request(url, function(e, r, b) {
    callback(JSON.parse(b));
  });
};

var download = function(task, callback) {
  var url = task.url, title = task.title, out = task.out;
  console.log("downloading", title);

  var stream = fs.createWriteStream(path.join(out, (title+".mp3").replace(/(\\|\/)/igm, "-")));
  request(url).pipe(stream);
  stream.on("close", callback);
}

var funnel = undefined;

var iterate = function(id, out, offset, max) {
  getJSON(URLS.tracks(id, offset), function(data) {
    if(!data.length) return console.log("Done!") && process.exit(0);
    if(data.errors) throw new Error("OHMYGODERROR");

    if(funnel === undefined) {
      funnel = async.queue(download, (!max || max < 1) ? Number.MAX_VALUE : max);

      if(max > 0) {
        funnel.drain = function() {
          iterate(id, out, offset+50, max);
        };
      }
    }

    while(data.length) {
      var dat = data.shift();
      if(dat.kind != "track") continue;
      if(!dat.downloadable) continue;
      funnel.push({title: dat.title, out: out, url: dat.download_url+"?client_id="+client_id}, function(e) {
        if(e) console.log("Could not download!");
      });
    }

    if(max == 0) iterate(id, out, offset+50, max);
  });
};

var start = function(id, out, max) {
  if(typeof max == "undefined") max = 2;
  var dir = out.out || process.cwd();
  if(!out.out) dir+="/"+(out.id.toString());
  out = path.resolve(dir);
  mkdirp.sync(out);

  iterate(id, out, 0, max);  
};

program
      .version("1.0.0")
      .option("-i, --id [int]", "Specify an user ID (overrides --search). (required if no -q)", parseInt)
      .option("-q, --search [string]", "Search for an user. (required if no -i)", String)
      .option("-o, --out [string]", "Specify the output directory", String)
      .option("-t, --max [int]", "Specify the max downloader threads (0 = infinite)", parseInt)
      .parse(process.argv);

if(!program.id && !program.search) return program.help();
if(!program.id) {
  getJSON(URLS.search(program.search), function(data) {
    if(data.errors) throw new Error("OHMYGODERROR");
    program.id = data[0].id
    start(program.id, program, program.max);
  });
} else start(program.id, program, program.max);
