var _ = require('underscore');
var Backbone = require('backbone');
var DataFile = require('../models/data_file');

var LocalRouter = Backbone.Router.extend({
  initialize: function() {
    if (typeof NINETEEN_DATA !== 'undefined') this.parse();
  },

  parse: function() {
		var View = require('../views/progress');
		var view = new View({
			collection: app.datafile.collection,
			model: app.datafile,
		});

		view.on('complete', this.visualize.bind(this));
		app.regions.get('main').show(view)
		view.start();
  },

	visualize: function() {
		var Model = require('../models/visualize');
		var model = new Model(NINETEEN_DATA.visualize, { collection: app.datafile.collection });
		var View = require('../views/visualize');
		var view = new View({
			collection: model.collection,
			model: model
		});
		app.regions.get('main').show(view);
	},
});

module.exports = new LocalRouter();
