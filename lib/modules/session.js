module.exports = function(app) {
  var config = require('config');
  var session = require('express-session');
  var FileStore = require('session-file-store')(session);

  app.use(session({
    resave: false,
    saveUninitialized: false,
    secret: config.secret,
    store: new FileStore({
      path: app.locals.root + '/tmp/sessions'
    }),
    unset: 'destroy'
  }));
};
