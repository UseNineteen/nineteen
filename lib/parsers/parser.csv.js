var csv = require('csv');
var stream = require('stream');

module.exports = function(data, callback) {
  var options = { columns: true, auto_parse: false };
  csv.parse(data, options, callback);
};
