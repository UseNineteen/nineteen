const Browser = require('zombie');
Browser.localhost('localhost', process.env.PORT);
Browser.runScripts = true;
module.exports = Browser;
