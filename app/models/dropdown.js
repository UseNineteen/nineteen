'use strict';

let Backbone = require('backbone');
module.exports = Backbone.Model.extend({
  defaults: {
    title: null,
    options: new Backbone.Collection()
  }
});
