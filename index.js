var express = require('express');
var winston = require('winston');
var app = express();
var path = require('path');

app.set('env', process.env.NODE_ENV || 'development');
app.locals.root = __dirname;
app.set('port', process.env.PORT || 3000);
app.locals.zip = path.join(__dirname, 'tmp', 'download.zip');

require('./lib/modules/handlebars')(app);
require('./lib/modules/session')(app);

var multer = require('multer');
var storage = multer.memoryStorage();
var upload = multer({ storage: storage });
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

// ==========================
// Stylus
// ==========================
var stylus = require('stylus');
function compile(str, path) {
  var autoprefixer = require('autoprefixer-stylus')();
  return stylus(str).set('filename', path).use(autoprefixer);
}

app.use(stylus.middleware({
  src: path.join(__dirname, 'app', 'assets', 'stylesheets'),
  compile: compile
}));

// ==========================
// Browserify
// ==========================
var browserify = require('browserify-middleware');
browserify.settings('transform', ['hbsfy', ['babelify', { presets: ['es2015'] }]]);

var test = browserify.settings.env('test');
test('precompile', true);
test('cache', true);

function updateZip(filename) {
  var fs = require('fs');
  var zip = new require('jszip')();
  fs.readFile(app.locals.zip, function(err, data) {
    if (data) zip.load(data);
  });

  return function(source) {
    zip.file(filename, source);
    console.log('here');
    fs.writeFileSync(app.locals.zip, zip.generate({type:"nodebuffer"}));
    return source;
  }
}

var libs = ['autolinker', 'd3', 'jquery', 'underscore', 'backbone', 'backbone.babysitter', 'backbone.marionette', 'backbone.stickit', 'backbone.wreqr', 'fs', 'hbsfy', 'jszip', 'moment', 'moment-parseformat', 'mime', 'path', 'stream', 'csv', 'xlsx'];
app.get('/main.js', browserify(__dirname + '/app/main.js', { external: libs }));
app.get('/vendor.js', browserify(libs));

// ==========================
// Assets
// ==========================
app.use(express.static(path.join(__dirname, 'app', 'assets', 'fonts')));
app.use(express.static(path.join(__dirname, 'app', 'assets', 'images')));
app.use(express.static(path.join(__dirname, 'app', 'assets', 'javascripts')));
app.use(express.static(path.join(__dirname, 'app', 'assets', 'stylesheets')));
app.use('/normalize.css', express.static(require.resolve('normalize.css')));


// ==========================
// Routes
// ==========================

app.get('/', function(req, res) {
  res.render('index');
});

app.get('/visualize', function(req, res) {
  var json = null;
  if (req.session && req.session.data) json = JSON.stringify(req.session.data);
  req.session = null;
  res.render('index', { NINETEEN_DATA: json });
});

function parse(file, cb) {
  var DataFile = require(app.locals.root + '/app/models/data_file');
  var model = new DataFile({ name: file.originalname });
  model.read(file.buffer.toString('binary'), function(err, data) {
    if (cb) cb(err, data, model);
  });
}

function visualize(req, res) {
  return function(err, data, model) {
    res.header('Content-Type', 'application/json');
    res.json( model.toJSON() );
  }
}

function blob(name, buffer) {
  return {
    originalname: name,
    buffer: buffer
  }
}

app.post('/upload', upload.single('file'), function(req, res) {
  parse(req.file, function(err, data, model) {
    req.session.data = model.toJSON();
    res.redirect('/visualize');
  });
});

app.post('/download', function(req, res) {
  var path = require('path');
  var request = require('request');
  request({url: req.body.url, encoding: null }, function(error, response, body) {
    var file = blob(path.basename(req.body.url), body);
    parse(file, visualize(req, res));
  });
});

app.get('/sample', function(req, res) {
  var fs = require('fs');
  var path = app.locals.root + '/app/downloads/shopping_decision_diary.xlsx';
  var file = blob('shopping_decision_diary.xlsx', fs.readFileSync(path));
  parse(file, visualize(req, res));
});

app.get('/save', function(req, res, next) {
  req.zip = new require('jszip')();
  var source = require('fs').readFileSync('app/layouts/main.hbs', 'utf-8');
  var template = require('handlebars').compile(source);
  var html = template({ body: '<script src="/data.js"></script>' });
  req.zip.file('index.html', html.replace(/(href|url|src)="\//gim, '$1="./assets/'));
  next();
}, function(req, res, next) {
  req.zip.folder('assets').file('normalize.css', require('fs').readFileSync(require.resolve('normalize.css')));
  req.zip.folder('assets').file('modernizr.js', require('fs').readFileSync('app/assets/javascripts/modernizr.js'));
  req.zip.folder('assets').file('html2canvas.js', require('fs').readFileSync('app/assets/javascripts/html2canvas.js'));
  next();
}, function(req, res, next) {
  require('request')(`http://0.0.0.0:${app.get('port')}/main.js`, function (error, response, body) {
    if (error) return next(error);
    req.zip.folder('assets').file('main.js', body);
    next();
  });
}, function(req, res, next) {
  require('request')(`http://0.0.0.0:${app.get('port')}/vendor.js`, function (error, response, body) {
    if (error) return next(error);
    req.zip.folder('assets').file('vendor.js', body);
    next();
  });
}, function(req, res, next) {
  require('request')(`http://0.0.0.0:${app.get('port')}/screen.css`, function (error, response, body) {
    if (error) return next(error);
    req.zip.folder('assets').file('screen.css', body);
    next();
  });
}, function(req, res, next) {
  var imagesDir = path.join(__dirname, 'app','assets','images');
  require('fs').readdirSync(imagesDir).forEach(function(image) {
    var data = require('fs').readFileSync(path.join(imagesDir, image), 'binary');
    req.zip.folder('assets').file(image, data);
  });
  next();
}, function(req, res, next) {
  var fontsDir = path.join(__dirname, 'app','assets','fonts');
  require('fs').readdirSync(fontsDir).forEach(function(font) {
    var data = require('fs').readFileSync(path.join(fontsDir, font), 'binary');
    req.zip.folder('assets').file(font, data);
  });
  next();
}, function(req, res, next) {
  require('fs').writeFile(app.locals.zip, req.zip.generate({type:"nodebuffer"}), next);
}, function(req, res) {
  res.download(app.locals.zip, 'nineteen-export.zip');
});

app.use(function(req, res, next) {
  res.status(404).send('Sorry cant find that!');
});

app.use(function(req, res, next) {
  req.header('Access-Control-Allow-Origin', '*');
  next();
});

if (app.get('env') !== 'test') {
  app.listen(app.get('port'), function() {
    console.log("Web server listening on port " + app.get('port'));
  });
}

module.exports = app;
