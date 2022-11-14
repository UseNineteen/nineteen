var Parser = require( root.join('app/models/parser') );
var Parsers = require( root.join('app/collections/parsers') );

describe('Parsers Collection', function() {
  var collection, parsers = [];

  before(function() {
    ['xlsx', 'xls', 'csv'].forEach(function(extname) {
      var filename = ['parser', extname, 'js'].join('.');
      parsers.push( new Parser({
        extname: extname,
        fn: require( root.join('lib/parsers', filename) )
      }));
    });
  });

  beforeEach(function() {
    collection = new Parsers(parsers);
  });

  it('finds parsers based on extension', function() {
    var expected = parsers[0];
    var actual = collection.findParser('xlsx');
    assert.equal(actual, expected);
  });

  it('throws if no parser found', function() {
    assert.throws(function() {
      collection.findParser('foobar');
    }, /Parser not found: foobar./);
  });
});
