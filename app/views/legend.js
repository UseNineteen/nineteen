var Marionette = require('backbone.marionette');

var ItemView = Marionette.ItemView.extend({
  attributes: function() {
    return {
      title: this.model.get('label')
    };
  },
  className: 'legend-item',
  tagName: 'li',
  template: require('../templates/legend_item.hbs'),
  templateHelpers: function() {
    return {
      showCounts: this.legend.get('counts') && !this.legend.get('split')
    }
  },
  modelEvents: {
    'mouseover': 'highlight',
    'mouseout': 'lowlight'
  },

  initialize: function(options) {
    this.legend = options.legend;
  },

  highlight: function() {
    this.$el.siblings().css('opacity', 0.25);
  },

  lowlight: function() {
    this.$el.siblings().css('opacity', 1);
  }
});

module.exports = Marionette.CompositeView.extend({
  className: 'sidebar',
  template: require('../templates/legend.hbs'),
  childView: ItemView,
  childViewContainer: '.legend-items',
  childViewOptions: function() {
    return { legend: this.model }
  },

  modelEvents: {
    'change:counts change:split': 'render'
  },

  ui: {
    legendToggle: '#legend-toggle',
  },

  triggers: {
    'click @ui.legendToggle': 'toggleLegend',
  },

  onToggleLegend: function() {
		let active = !this.$el.parent().hasClass('legend-collapsed');
		this.ui.legendToggle.toggleClass('legend-collapsed', active);
		this.$el.parent().toggleClass('legend-collapsed', active);
	},
});
