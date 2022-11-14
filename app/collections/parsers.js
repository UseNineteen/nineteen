var Backbone = require('backbone');
var Parser = require('../models/parser');

function InvalidParser(extname) {
  var message = 'Parser not found';
  if (extname) message += ': ' + extname;
  return new ReferenceError(message + '.');
}

var Parsers = Backbone.Collection.extend({
	model: Parser,
	findParser: function(extname) {
		var parser = this.get(extname);
    if (!parser) throw new InvalidParser(extname);
		return parser;
	}
});
module.exports = Parsers;
