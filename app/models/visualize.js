'use strict';

let colors = require('../mixins/color');
let d3 = require('d3');
let Backbone = require('backbone');

module.exports = Backbone.Model.extend({
  defaults: function() {
    this.columns = this.collection.columns.map(function(column) {
      return { name: column };
    });
    let column = this.columns[0].name;

    return {
      'automatic': true,
      'colorKey': column,
      'groupKey': column,
      'counts': false,
      'zoom': 1.0,
      'split': false,
      'scaleColor': d3.scale.ordinal(),
      'scaleX': d3.scale.linear(),
      'scaleY': d3.scale.ordinal(),
      'sort-by': 'value',
      'sort-direction': 'ascending',
      // TODO: Extract this into view
      'viewer-columns': new Backbone.Collection()
    };
  },

  initialize: function(options) {
    options = options || {};

    if (typeof options['viewer-columns'] !== 'undefined') {
      this.set('viewer-columns', new Backbone.Collection());
      this.get('viewer-columns').reset(options['viewer-columns']);
    } else {
      this.get('viewer-columns').reset(this.columns);
    }

    this.collection.comparator = function(a, b) {
      let left = a.getParsed(this.get('groupKey'));
      let right = b.getParsed(this.get('groupKey'));

      if (left == right) {
        left = a.getParsed(this.get('colorKey'));
        right = b.getParsed(this.get('colorKey'));
      }

      return left == right ? a.id - b.id : left < right ? -1 : 1;
    }.bind(this);

    this.options = { zoom: { max: 5, min: 0.1 } };
    this.legend = new Backbone.Collection(null, { comparator: 'value' });
    this.labels = new Backbone.Collection(null, { comparator: 'value' });
    this.listenTo(this.legend, 'reset sort', this.calculateScaleColor);
    this.listenTo(this.labels, 'reset sort', this.calculateScaleY);
    this.on('change:scaleColor', this.assignColors);
    this.on('change:colorKey', this.buildLegend);
    this.on('change:groupKey', this.buildLabels);
    this.on('change:groupKey change:automatic', this.automaticColorChange);
    this.on('change:groupKey change:colorKey', this.collection.sort, this.collection);
    this.on('change:sort-by change:sort-direction', this.sortLabels);

    this.buildLegend(this, this.get('colorKey'), {});
    this.buildLabels(this, this.get('groupKey'), {});
  },

  /**
   * Resets the collection of legend items
   * Legend items are unique `colorKey` values within the data collection
   * This should be run after changing the `colorKey` attribute
   */
  buildLegend: function(model, key, options) {
    this.buildCollection( this.legend, key );
  },

  /**
   * Resets the collection of label items
   * Label items are unique `groupKey` values within the data collection
   * This should be run after changing the `groupKey` attribute
   */
  buildLabels: function(model, key, options) {
    this.buildCollection( this.labels, key );
  },

  buildCollection: function(collection, key) {
    let items = this.collection.rollup(key);
    collection.reset( items );
    return items;
  },

  /*
   * Automatically updates the color key to match the group key
   * when the legend model has a truthy `automatic` attribute
	 */
	automaticColorChange: function() {
		if (this.get('automatic')) {
			this.set('colorKey', this.get('groupKey'));
		}
	},

  assignColors: function(model, scale, options) {
    this.legend.each(function(item) {
      let color = scale( item.get('label') );
      item.set('background-color', color.fill);
      item.set('border-color', color.stroke);
    });
  },

  calculateScale: function(collection, options) {
    this.calculateScaleColor( this.legend, options );
    // this.calculateScaleX( collection, options );
    this.calculateScaleY( this.labels, options );
  },

  calculateScaleX: function(collection, options) {
    let range = [0, this.columns()];
    let scale = this.get('scaleX').domain();
    this.set('scaleX', scale);
    return scale;
  },

  calculateScaleY: function(collection, options) {
    let vals = collection.pluck('value');
    let scale = d3.scale.ordinal().domain(vals).rangeRoundPoints([0, vals.length]);
    this.set('scaleY', scale);
    return scale;
  },

  calculateScaleColor: function(collection, options) {
    let vals = collection.pluck('label');
    let scale = d3.scale.ordinal().domain(vals).range(colors.filter(vals.length));
    this.set('scaleColor', scale);
    return scale;
  },

  maxCount: function() {
    return d3.max(this.labels.models, function(item) {
      return item.get('count');
    });
  },

  rows: function() {
    return this.labels.length;
  },

  getX: function(model) {
    if (this.isSplit()) {
      return this.getSplitX( model );
    } else {
      return this.getStackedX( model );
    }
  },

  getStackedX: function(model) {
    let key = this.get('groupKey');
    let filtered = this.collection.filter(function(item) {
      return item.get('raw')[key] == model.get('raw')[key];
    });
    return filtered.indexOf( model );
  },

  getSplitX: function(model) {
    let colorKey = this.get('colorKey');
    let groupKey = this.get('groupKey');
    let group = this.legend.findWhere({ label: model.get('raw')[colorKey] });
    let index = this.legend.indexOf( group );
    let offset = this.getOffsetX( groupKey, index );

    let filtered = this.collection.filter(function(item) {
      return item.get('raw')[colorKey] == model.get('raw')[colorKey] && item.get('raw')[groupKey] == model.get('raw')[groupKey];
    });

    return filtered.indexOf( model ) + offset;
  },

  getOffsetX: function(groupKey, num) {
    let offset = this.showCounts() ? 1 : 0;
    num = num === undefined ? this.legend.length : num;
    return this.legend.chain().take(num).reduce(function(memo, item) {
      return memo + item.get('items').chain().countBy(function(model) {
        return model.get('raw')[groupKey];
      }).max(function(count) {
        return count;
      }).value() + offset;
    }, 0).value() + num;
  },

  getY: function(model) {
    let key = this.get('groupKey');
    let scale = this.get('scaleY');
    return scale( model.getParsed(key) );
  },

  zoomIn: function() {
    let zoom = Math.min(this.get('zoom') + 0.1, this.options.zoom.max);
    this.set('zoom', zoom);
    return this.get('zoom');
  },

  zoomOut: function() {
    let zoom = Math.max(this.get('zoom') - 0.1, this.options.zoom.min);
    this.set('zoom', zoom);
    return this.get('zoom');
  },

  zoomReset: function() {
    let zoom = 1;
    this.set('zoom', zoom);
    return zoom;
  },

  reverse: function(direction) {
    direction = direction || this.get('sort-direction');
    switch (direction) {
      case 'ascending': this.set('sort-direction', 'descending'); break;
      case 'descending': this.set('sort-direction', 'ascending'); break;
    }
  },

  getColor: function(model, attr) {
    attr = attr || 'fill';
    let scale = this.get('scaleColor');
    let key = this.get('colorKey');
    return scale( model.get('raw')[key] )[attr];
  },

  /*
   * Re-sorts the rows
   * Necessary after changing the sort-by or sort-direction model attributes
   */
  sortLabels: function() {
    let key = this.get('sort-by');
    let direction = this.get('sort-direction');

    this.labels.comparator = function(a,b) {
      return d3[direction](a.get(key), b.get(key));
    };

    this.labels.sort();
  },

  // ========
  //
  showCounts: function() {
    return this.get('counts');
  },

  toggleCounts: function() {
    this.set('counts', !this.get('counts'));
    return this.get('counts');
  },

  isAutomatic: function() {
    return this.get('automatic');
  },

  isSplit: function() {
    return this.get('split');
  },

  toggleSplit: function() {
    this.set('split', !this.get('split'));
    return this.get('split');
  }
});
