var fs = require('fs');

describe('XLSX Parser', function() {
  it('parses a valid xlsx file', function(done) {
    var parser = require( root.join('lib', 'parsers', 'parser.xlsx.js') );
    var file = fixture.resolve('data.xlsx');
    var buffer = fs.readFileSync(file, 'binary');
    var expected = [fixture('data.json')];
    parser(buffer, function(error, actual) {
      assert.deepEqual(actual, expected);
      done();
    });
  });
});
