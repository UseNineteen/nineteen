'use strict';

let _ = require('underscore');
let Dropdown = require('./_base');

module.exports = Dropdown.extend({
  template: require('../../templates/dropdowns/viewer-columns.hbs'),
  templateHelpers: {
    selected: function(column) {
      return this.model.get('selected').findWhere({ name: column });
    }
  },
  ui: {
    checkboxes: 'input[type="checkbox"]',
    selectAll: '.select-all',
    deselectAll: '.deselect-all'
  },
  triggers: {
    'click @ui.selectAll': 'selectAll',
    'click @ui.deselectAll': 'deselectAll'
  },
  events: {
    'change :checkbox': 'update'
  },
  onRender: function() {
    this.$el.addClass('dropdown-right');
    for (let column of this.model.get('selected').models) {
      this.$(`:checkbox[value="${column.get('name')}"]`).prop('checked', true);
    }
  },
  update: function() {
    let selected = this.$(':checkbox:checked').toArray();
    let columns = selected.map(function(checkbox) {
      return { name: checkbox.value };
    });
    this.model.get('selected').reset(columns);
  },
  onSelectAll: function() {
    this.ui.checkboxes.prop('checked', true);
    this.model.get('selected').reset(this.model.get('columns'));
  },
  onDeselectAll: function() {
    this.ui.checkboxes.prop('checked', false);
    this.model.get('selected').reset();
  }
});
