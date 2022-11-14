var _ = require('underscore');
var $ = require('jquery');
var Backbone = require('backbone');
var Marionette = require('backbone.marionette');
var DataFile = require('./models/data_file');
window.JSZip = require('jszip');

var AppRegion = Marionette.Region.extend({
	onShow: function() {
		this.$el.css('opacity', 1);
	}
});

var App = Marionette.Application.extend({
	initialize: function(options) {
		this.vent = new Backbone.Wreqr.EventAggregator();
	},

	onStart: function(options){
		this.setupDataFile();
		this.setupRegions();
		this.setupRouters();
	},

	setupRegions: function() {
		app.regions = new Marionette.RegionManager();
		app.regions.addRegions({
			main: {
				selector: '#main',
				regionClass: AppRegion
			}
		});
	},

	setupRouters: function() {
		var router;

		if (typeof NINETEEN_LOCAL !== 'undefined') {
			router = require('./routers/local_router');
		} else {
			router = require('./routers/home_router');
		}

		if (Backbone.history){
			Backbone.history.start({ pushState: true });
		}
	},

	setupDataFile: function() {
		app.datafile = new DataFile();
		if (typeof NINETEEN_DATA !== 'undefined') {
			app.datafile.set(NINETEEN_DATA.datafile);
		} else {
			app.datafile.fetch();
		}
	}
});

window.app = new App({container: 'body'});
app.start();

module.exports = app;
