var fs = require('fs');

describe('CSV Parser', function() {
  it('parses a valid csv file', function(done) {
    var parser = require( root.join('lib', 'parsers', 'parser.csv.js') );
    var file = fixture.resolve('data.csv');
    var buffer = fs.readFileSync(file, 'binary');
    var expected = [fixture('data.json')];
    parser(buffer, function(error, actual) {
      assert.deepEqual(actual, expected);
      done();
    });
  });
});
