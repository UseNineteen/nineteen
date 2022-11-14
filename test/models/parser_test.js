var Parser = require( root.join('app/models/parser') );

describe('Parser Model', function() {
  describe('#validate', function() {
    beforeEach(function() {
      this.model = new Parser({
        extname: 'txt',
        fn: function() {}
      });

      assert(this.model.isValid());
    });

    it('is invalid without extname attribute', function() {
      this.model.unset('extname');
      assert(!this.model.isValid());
    });

    it('is invalid without fn attribute', function() {
      this.model.unset('fn');
      assert(!this.model.isValid());
    });

    it('is invalid when fn attribute is not a function', function() {
      this.model.set('fn', 'fail');
      assert(!this.model.isValid());
    });
  });
});
