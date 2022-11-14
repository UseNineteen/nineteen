'use strict';
var _ = require('underscore');
var d3 = require('d3');
var Backbone = require('backbone');
var DataItem = require('../models/data_item');

module.exports = Backbone.Collection.extend({
	model: DataItem,
	columns: [],

	constructor: function(models, options) {
		models = models || [];
		models = models.map(function(data, index) {
			return {
				id: index + 1,
				raw: data,
				columns: _.keys(data)
			}
		});
		this.columns = _.union.apply(this, _.pluck(models, 'columns'));
		Backbone.Collection.apply(this, [models, options]);
	},

	initialize: function(models, options) {
		this.on('add', function(model) {
			if (model.has('columns')) {
				this.columns = _.union(this.columns, model.get('columns'));
			}
		});

		this.on('reset', function() {
			this.columns = [];
		});
	},

	rollup: function(key, filter) {
		let self = this;
		return this.chain()
      .groupBy(function(d) {
				let value = d.get('raw')[key];
				if (filter) value = `${value} - ${d.get('raw')[filter]}`;
				return value;
			})
      .pairs().map(function(d) {
        let val = d[1][0].getParsed(key);
				let models = new Backbone.Collection(d[1], {
					comparator: function(a,b) {
						let left = a.getParsed(key);
						let right = b.getParsed(key);
						return left == right ? a.id - b.id : left < right ? -1 : 1;
					}
				});
				models.sort();
        return {
          label: d[0],
          value: val,
					items: models,
          count: d[1].length
        };
      }).value();
	}
});
