'use strict';

let $ = require('jquery');
let _ = require('underscore');
let Marionette = require('backbone.marionette');

module.exports = Marionette.ItemView.extend({
  id: 'progress',
  template: require('../templates/progress.hbs'),
  templateHelpers: function() {
    return {
      dismissable: this.options.dismissable
    };
  },

  collectionEvents: {
    'add': 'parsing'
  },

  ui: {
    message: '.message',
    pct: '.pct',
    progress: '.progress-bar-fill',
    close: '.close'
  },

  events: {
    'click @ui.close': 'cancel'
  },

  initialize: function() {
    this.on('start', this.start);
    this.on('complete', this.destroy);
  },

  start: function() {
    this.collection.reset();
    this.advance();
  },

  advance: function() {
    let index = this.collection.length;
    let json = this.model.get('data');
    this.collection.add({
      id: index + 1,
      raw: json[index],
      columns: _.keys(json[index])
    });
  },

  parsing: function() {
    let progress = this.collection.length / this.model.get('data').length * 100;
    this.update( progress, 'Parsing...' );
    if (progress >= 100) {
      this.trigger('complete');
    } else {
      setTimeout(this.advance.bind(this), 0);
    }
  },

  progress: function(progress, message) {
    setTimeout(function() {
      this.update( progress, message );
    }.bind(this), 0);
  },

  read: function(event) {
    this.ui.message.text( 'Reading...' );
    this.ui.pct.text('');
    this.ui.progress.width('');
  },

  update: function(progress, message) {
    let pct = Math.round(progress) + '%';
    this.ui.message.text( message );
    this.ui.pct.text( pct );
    if (!isNaN(progress)) this.ui.progress.css( 'width', pct );
  },

  cancel: function() {
    this.collection.set([]);
    this.update(0);
    this.destroy();
  }
});
