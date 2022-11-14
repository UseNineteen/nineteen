module.exports = function(app) {
  var exphbs = require('express-handlebars');

  // assign the handlebars engine to .html files
  app.engine('hbs', exphbs({
  	defaultLayout: 'main',
  	extname: '.hbs',
  	layoutsDir: app.locals.root + '/app/layouts',
  	partialsDir: app.locals.root + '/app/templates/'
  }));

  // set .html as the default extension
  app.set('view engine', 'hbs');
  app.set('views', app.locals.root + '/app/templates');
};
