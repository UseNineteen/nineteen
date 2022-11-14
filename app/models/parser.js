var _ = require('underscore');
var Backbone = require('backbone');
var path = require('path');

var Parser = Backbone.Model.extend({
	idAttribute: 'extname',
	validate: function(attrs, options) {
		if (!attrs.extname) {
			return 'Your parser must register an extension.';
		}

		if (!attrs.fn || !_.isFunction(attrs.fn)) {
			return 'Your parser must register a callable function.';
		}
	}
});
module.exports = Parser;
