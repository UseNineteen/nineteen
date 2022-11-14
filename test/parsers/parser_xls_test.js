var fs = require('fs');

describe('XLS Parser', function() {
  it('parses a valid xls file', function(done) {
    var parser = require( root.join('lib', 'parsers', 'parser.xls.js') );
    var file = fixture.resolve('data.xls');
    var buffer = fs.readFileSync(file, 'binary');
    var expected = [fixture('data.json')];
    parser(buffer, function(error, actual) {
      assert.deepEqual(actual, expected);
      done();
    });
  });
});
