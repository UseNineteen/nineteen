'use strict';

var _ = require('underscore');
var tm = require('textmining');
var Backbone = require('backbone');

module.exports = Backbone.Model.extend({
  defaults: function() {
    let columns = this.collection.columns.map(function(column) {
      return { name: column };
    });

    return {
      term: '',
      index: undefined,
      scope: new Backbone.Collection(columns),
      suggestions: [],
      results: [],
      regex: /"(.+?)"|(\S+)/gim
    }
  },

  initialize: function() {
		this.listenTo(this.collection, 'all', this.search);
    this.listenTo(this.get('scope'), 'add remove reset', this.search);
    this.listenTo(this.get('scope'), 'add remove reset', this.analyze);
    this.on('change:term', this.search);
    this.analyze();
	},

  analyze: function() {
    let scope = this.get('scope').pluck('name');
    let documents = this.collection.reduce(function(memo, model) {
      let values = _.values(model.pick(scope));
      return memo.concat(values);
    }, []);

    let bag = tm.bagOfWords( _.compact(documents), true, true );

    // Filter terms to verify that they are wholly alphanumeric
    var terms = bag.terms.filter(function(term) {
      return /^[a-z0-9]+$/gim.test(term.term);
    });
    
    let top10 = _.sortBy(terms, 'frequency').reverse().slice(0,10);
    this.set('suggestions', top10);
    return top10;
  },

  search: function() {
    let searches = this.get('term').split(' AND ').map(this.findTerm.bind(this));
    let results = _.reduce(searches, function(memo, search) {
      return _.intersection(memo, search);
    });
		this.set('results', results);
		return results;
	},

  columns: function(collection) {
    let keys = _.union.apply(this, this.collection.invoke('keys'));
    return this.has('scope') ? this.get('scope') : keys;
  },

  match: function(model) {
    return this.hasTerm() && this.contains(model);
  },

  contains: function(model) {
    return _.contains(this.get('results'), model);
  },

  hasTerm: function() {
    return this.get('term').length > 0;
  },

  findTerm: function(term) {
    let escapeRegExp = this.escapeRegExp.bind(this);
    let regex = this.get('regex');
    let scope = this.get('scope').pluck('name');
    let matches = [], results = [];
    while ((matches = regex.exec(term)) !== null) {
      let match = _.compact(matches)[1];
      let pattern = new RegExp(escapeRegExp(match), 'i');
      let filtered = this.collection.filter(function(model) {
        return _.any(_.values(model.pick(scope)), function(str) {
          return pattern.test(str);
        });
      });
      results = _.union(results, filtered);
    }

    return results;
  },

  addTerm: function(term, newGroup) {
    let terms = [ this.get('term'), term ];
    if (this.get('term') && newGroup) terms.splice(1, 0, 'AND');
    this.set('term', terms.join(' ').trim());
  },

  getTerm: function(model, text) {
    let matches = [];
    if (_.contains(this.get('results'), model)) {
      let escapeRegExp = this.escapeRegExp.bind(this);
      let regex = this.get('regex');
      this.get('term').split(' AND ').forEach(function(search) {
        let terms = [], results = [];
        while ((terms = regex.exec(search)) !== null) {
          let term = _.compact(terms)[1];
          let pattern = new RegExp(escapeRegExp(term), 'gi');
          while ((results = pattern.exec(text)) !== null) {
            matches.push(results);
          }
        }
      });
    }
    return matches;
  },

  escapeRegExp: function(str) {
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&").replace(/\\\*/g, '.');
  }
});
