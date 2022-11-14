var path = require('path');

function fixture() {
  return require( fixture.resolve.apply(this, arguments) );
}

fixture.resolve = function() {
  var file = path.join.apply(this, arguments);
  return path.join(__dirname, '..', 'fixtures', file);
}

module.exports = fixture;
