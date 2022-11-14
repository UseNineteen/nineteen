// process.env.NODE_ENV = 'test';
// process.env.PORT = 3001;
global.assert = require('chai').assert;
global.fixture = require('./support/fixtures');
global.root = require('./support/root');
global.sinon = require('sinon');
global.storageMock = require('./support/session_storage');
global.Browser = require('./support/zombie');
global.app = require( root.join('index') );
global.XMLHttpRequest = require('xmlhttprequest').XMLHttpRequest;

var jsdom = require('jsdom');
jsdom.env({
  html: '<html/>',
  scripts: [ root.join('lib', 'modernizr.min.js') ],
  created: function(err, window) {
    global.window = window;
    global.document = window.document;
    global.Modernizr = {
      filereader: true,
      xhrresponsetypeblob: true
    };
  }
});
