var fs = require('fs');
var sinon = require('sinon');
var DataFile = require( root.join('app/models/data_file') );

describe('DataFile Model', function() {
  describe('#read', function() {
    ['csv', 'xls', 'xlsx'].forEach(function(extname) {
      describe(extname +' files', function() {
        var file, data, expected, stub;

        beforeEach(function() {
          file = fixture.resolve('data.'+ extname);
          data = fs.readFileSync(file, 'binary');
          expected = [ fixture('data.json') ];
          stub = sinon.stub();
          stub.yields(null, expected);
        });

        it('passes buffer to parser', function(done) {
          var model = new DataFile({ name: file });
          model.parsers.reset([{ extname: extname, fn: stub }]);
          model.read(data, function() {
            assert(stub.called);
            done();
          });
        });

        it('correctly sets data attribute', function() {
          var model = new DataFile({ name: file });
          model.read(data, function(err, data) {
            assert.deepEqual(data, expected);
            assert.deepEqual(model.get('data'), data);
          });
        });
      });
    });

    it('throws an error if no file name is given', function() {
      var file = fixture.resolve('/data.xlsx');
      var data = fs.readFileSync(file, 'binary');
      var model = new DataFile();
      assert.throws(function() {
        model.read(data);
      }, /You must set a `name` attribute./);
    });

    it('throws an error if missing extension', function() {
      var file = fixture.resolve('data.xlsx');
      var data = fs.readFileSync(file, 'binary');
      var model = new DataFile({ name: '.bar' });
      assert.throws(function() {
        model.read(data);
      }, /Your file needs a valid extension./);
    });

    it('throws an error if an unsupported extension', function() {
      var file = fixture.resolve('data.xlsx');
      var data = fs.readFileSync(file, 'binary');
      var model = new DataFile({ name: 'foo.bar' });
      assert.throws(function() {
        model.read(data);
      }, /Parser not found: bar./);
    });

    it('throws an error if missing binary data', function() {
      assert.throws(function() {
        new DataFile({ name: 'foo.xlsx' }).read();
      }, /You must pass a `data` parameter to #read./);
    });
  });
});
