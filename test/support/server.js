var Browser = require('./zombie');
var browser = new Browser();

// before(function(done) {
//   this.timeout(10000); // Wait for browserify precompile
//   this.server = app.listen(app.get('port'), function() {
//     browser.visit('/', done);
//   });
// });
//
// after(function() {
//   this.server.close();
// });
