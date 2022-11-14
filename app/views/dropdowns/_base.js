'use strict';

let _ = require('underscore');
let $ = require('jquery');
let Marionette = require('backbone.marionette');

module.exports = Marionette.LayoutView.extend({
  className: 'dropdown',
  template: false,
  initialize: function(options) {
    $(window).on('click', this.click.bind(this));
    this.options = options;
    this.options.pos = options.pos;
    this.$target = options.$target;
    this.parentView = options.parentView;
    this.on('render', this.position);
  },
  click: function(event) {
    let $targets = $(event.target).parents('.dropdown').andSelf();
    if (!$targets.is(this.$el)) this.destroy();
  },
  position: function(x, y) {
    if (this.options.pos) [x,y] = this.options.pos;
    if (x && y) this.$el.css({ left: x, top: y });
  }
});
