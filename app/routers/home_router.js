var _ = require('underscore');
var Backbone = require('backbone');
var DataFile = require('../models/data_file');

var HomeRouter = Backbone.Router.extend({
	routes: {
		'': 'home',
		'upload': 'upload',
		'visualize': 'parse'
	},

	home: function() {
  	var ImportView = require('../views/import_view.js');
  	var view = new ImportView({
			model: app.datafile,
			collection: app.datafile.collection
		});
  	app.regions.get('main').show(view);
  },

  parse: function() {
		var View = require('../views/progress');

		if (!this.hasData()) {
			Backbone.history.navigate('/', { trigger: true });
		} else if (!app.datafile.isParsed()) {
			var view = new View({
				collection: app.datafile.collection,
				model: app.datafile,
			});

			view.on('complete', this.visualize.bind(this));
			app.regions.get('main').show(view)
			view.start();
		} else {
			this.visualize();
		}
  },

	visualize: function() {
		var Model = require('../models/visualize');
		var model = new Model({}, { collection: app.datafile.collection });
		var View = require('../views/visualize');
		var view = new View({
			collection: model.collection,
			model: model
		});
		app.regions.get('main').show(view);
	},

	/*
	 * Checks to see that we have data available to visualize.
	 */
	hasData: function() {
		return app.datafile instanceof DataFile && app.datafile.hasData();
	}
});

module.exports = new HomeRouter();
