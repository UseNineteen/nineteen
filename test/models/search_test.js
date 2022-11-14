'use strict';
let _ = require('underscore');
let json = fixture('search.json');
let Backbone = require('backbone');
let DataItems = require( root.join('app/collections/data_items') );
let Search = require( root.join('app/models/search') );
describe('Search Model', function() {
  describe('#search', function() {
    beforeEach(function() {
      this.model = new Search({}, { collection: new DataItems(json) });
    });

    it('performs keyword search', function() {
      let search = this.model;
      search.collection.each(function(model) {
        search.set('term', model.get('raw')['Name']);
        assert.deepEqual(search.get('results'), [ model ]);
      });
    });

    it('performs phrase search', function() {
      let examples = {
        'umami': 2,
        'kombucha umami': 2,
        '"kombucha umami"': 1,
        'satisfied': 2,
        'Extremely satisfied': 2,
        '"Extremely satisfied"': 1
      }

      for (var example in examples) {
        this.model.set('term', example);
        assert.lengthOf(this.model.get('results'), examples[example]);
      }
    });

    it('accepts join (AND) modifier', function() {
      this.model.set('term', 'kombucha Ashley');
      assert.lengthOf(this.model.get('results'), 2);
      this.model.set('term', 'kombucha AND Ashley');
      assert.lengthOf(this.model.get('results'), 1);
    });

    it('accepts wildcard (*) modifier', function() {
      this.model.set('term', 're*d');
      assert.lengthOf(this.model.get('results'), 2);
      this.model.set('term', 're*k');
      assert.lengthOf(this.model.get('results'), 0);
    });

    it('restricts search to a single attribute', function() {
      this.model.set('term', 'Cody');
      assert.lengthOf(this.model.get('results'), 1);
      this.model.get('scope').set({name: 'Age'});
      assert.lengthOf(this.model.get('results'), 0);
    });
  });
});
