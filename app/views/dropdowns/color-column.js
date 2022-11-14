'use strict';

let _ = require('underscore');
let Dropdown = require('./_base');

module.exports = Dropdown.extend({
  template: require('../../templates/dropdowns/color-column.hbs'),
  templateHelpers: function() {
    return {
      columns: this.collection
    }
  },
  events: {
    'change :radio': 'update'
  },
  onRender: function() {
    if (this.model.isAutomatic()) {
      this.$(':radio[value=""]').prop('checked', true);
    } else {
      this.$(`:radio[value="${this.model.get('colorKey')}"]`).prop('checked', true);
    }
  },
  update: function(event) {
    let value = event.target.value;
    if (value.length > 0) {
      this.model.set({
        'automatic': false,
        'colorKey': value
      });
    } else {
      this.model.set('automatic', true);
    }
    this.destroy();
  }
});
