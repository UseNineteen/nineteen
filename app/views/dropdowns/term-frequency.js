'use strict';

let $ = require('jquery');
let _ = require('underscore');
let Dropdown = require('./_base');

module.exports = Dropdown.extend({
  template: require('../../templates/dropdowns/term-frequency.hbs'),
  templateHelpers: function() {
    return {
      terms: this.model.get('suggestions'),
      hasTerms: this.model.get('suggestions').length > 0
    }
  },

  ui: {
    terms: '.term'
  },

  events: {
    'click @ui.terms': 'onTermInsert'
  },

  onTermInsert: function(event) {
    let term = $(event.currentTarget).find('.name').text();
    this.model.addTerm( term, event.shiftKey );
    this.destroy();
  }
});
