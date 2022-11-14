'use strict';

let _ = require('underscore');
let Dropdown = require('./_base');

module.exports = Dropdown.extend({
  template: require('../../templates/dropdowns/group-column.hbs'),
  templateHelpers: function() {
    return {
      columns: this.collection
    }
  },
  events: {
    'change :radio': 'update'
  },
  onRender: function() {
    this.$(`:radio[value="${this.model.get('groupKey')}"]`).prop('checked', true);
  },
  update: function(event) {
    let value = event.target.value;
    this.model.set('groupKey', value);
    this.$target.text(value);
    this.destroy();
  }
});
