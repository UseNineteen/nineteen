var $ = require('jquery');
var _ = require('underscore');
var d3 = require('d3');
var Backbone = require('backbone');
Backbone.Stickit = require('backbone.stickit');
var Marionette = require('backbone.marionette');
let Visualize = require('../models/visualize');
var VisualizeView = Marionette.LayoutView.extend({
	id: 'visualize',
	template: require('../templates/visualize.hbs'),

	defaults: {
		block: {
			size: 16,
			gap: 3
		}
	},

	regions: {
		legend: '#legend',
		viewer: '#viewer',
		filters: '#filters',
		navigation: '#navigation',
    dropdowns: '#dropdowns'
	},

	ui: {
		visualization: '#visualization',
		viewer: '#viewer',
		legend: '#legend',
		viewerKey: 'header[role="banner"] .viewer-key a',
		legendKey: 'header[role="banner"] .legend-key a',
		toggleSave: '#save',
		brand: '#brand'
	},

	triggers: {
		'click @ui.viewerKey': 'groupColumn',
		'click @ui.legendKey': 'colorColumn',
		'click @ui.toggleSave': 'toggleSave',
		'click @ui.brand': 'restart'
	},

	templateHelpers: {
		filename: app.datafile.get('name'),
		details: app.datafile.details.call(app.datafile)
	},

	initialize: function() {
		this.options = _.extend({}, this.defaults, this.options);
		let columns = this.collection.columns;
	},

	onAttach: function() {
		this.listenTo(this.model, 'change:groupKey', this.groupKeyText);
		this.listenTo(this.model, 'change:colorKey', this.colorKeyText);

		setTimeout(function() {
			this.$el.css('opacity', 0);
			this.renderLegend();
			this.renderViewer();
			this.$el.css('opacity', 1);
		}.bind(this), 0);
	},

	/**
   * Updates the text of the color key element to match changes in value.
   * @param {object} model The model that was updated.
   * @param {string} value The new value which was set.
	 */
	colorKeyText: function(model, value) {
		this.ui.legendKey.text(value);
	},

	/**
   * Updates the text of the group key element to match changes in value.
   * @param {object} model The model that was updated.
   * @param {string} value The new value which was set.
	 */
	groupKeyText: function(model, value) {
		this.ui.viewerKey.text(value);
	},

	/**
   * Render and append the Legend view
   * This view is responsible for rendering the legend sidebar
	 */
	renderLegend: function(model) {
		let LegendView = require('./legend');
		let view = new LegendView({
			collection: this.model.legend,
			model: this.model
		});
		this.getRegion('legend').show(view);
	},

	/**
   * Render and append the Viewer view
   * This view is responsible for the main visualization region
	 */
	renderViewer: function(collection, viewer, legend, search) {
		let ViewerView = require('./viewer');
		let view = new ViewerView({
			collection: this.collection,
			model: this.model,
			parent: this
		});
		this.getRegion('viewer').show(view);
	},

	/**
   * Handles click events on the "Group Column" pulldown
   * Displays the column picker popup
   */
	onGroupColumn: function() {
		let Dropdown = require('./dropdowns/group-column');
		let region = this.getRegion('dropdowns');
		let $target = this.ui.viewerKey;
		if (region.hasView() && region.currentView.$target.is($target)) {
			region.reset();
		} else {
			let pos = $target.position();
			let view = new Dropdown({
				model: this.model,
				collection: this.collection.columns,
				$target: $target,
				pos: [pos.left, pos.top + $target.outerHeight()]
			});
			region.show(view);
		}
	},

	/**
   * Handles click events on the "Color Column" pulldown
   * Displays the column picker popup
   */
	onColorColumn: function() {
		let Dropdown = require('./dropdowns/color-column');
		let region = this.getRegion('dropdowns');
		let $target = this.ui.legendKey;
		if (region.hasView() && region.currentView.$target.is($target)) {
			region.reset();
		} else {
			let pos = $target.position();
			let view = new Dropdown({
				model: this.model,
				collection: this.collection.columns,
				$target: $target,
				pos: [pos.left, pos.top + $target.outerHeight()]
			});
			region.show(view);
		}
	},

	/**
   * Handles click events on the "Save" link
   * Displays the save popup
   */
	onToggleSave: function() {
		let Dropdown = require('./dropdowns/save');
		let region = this.getRegion('dropdowns');
		let $target = this.ui.toggleSave;
		if (region.hasView() && region.currentView.$target.is($target)) {
			region.reset();
		} else {
			let pos = $target.offset();
			let view = new Dropdown({
				$target: $target,
				visualization: this.$el,
				pos: [pos.left + $target.outerWidth(), pos.top + $target.outerHeight()],
				parentView: this
			});
			region.show(view);
		}
	},

	/**
   * Handles click events on the "nineteen" brand link
   * Returns the user to the homepage via a Backbone route
   */
	onRestart: function() {
		Backbone.history.navigate('/', {trigger: true});
	},

	/**
	 * Creates a stringified JSON dump of the necessary models
	 */
	export: function() {
		let json = {};
		json.datafile = app.datafile.toJSON();
		json.visualize = this.model.toJSON();
		return JSON.stringify(json);
	}
});

module.exports = VisualizeView;
